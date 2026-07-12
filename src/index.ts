/**
 * QQ Music account connector for DancingMusic.
 *
 * The host owns credential capture and persistence. This connector only
 * validates the host-injected cookie and keeps it in memory for login status.
 * Catalog gateway requests are intentionally credential-free.
 */
import type {
  MusicConnector,
  MusicConnectorLoginRequest,
  MusicConnectorLoginResult,
  MusicConnectorMeta,
  MusicListQuery,
  MusicPlaylist,
  MusicPlaylistList,
  MusicPlaylistQuery,
  MusicSearchResult,
  MusicStreamInfo,
  MusicTrack,
} from "@dancingmusic/music-connect";

export interface QQMusicAccountConfig {
  apiBaseUrl?: string;
  /** Secret injected at runtime by the DancingMusic host credential vault. */
  cookie?: string;
}

const QQ_WEB_COOKIE_FLOW_ID = "qq-music-account-web-cookie";
const QQ_LOGIN_URL = "https://y.qq.com/n/ryqq/profile";
const QQ_WARMUP_URL = "https://y.qq.com/n/ryqq/player";
const QQ_COOKIE_PRIORITY = [
  "uin",
  "qqmusic_uin",
  "wxuin",
  "login_type",
  "qm_keyst",
  "qqmusic_key",
  "music_key",
  "p_skey",
  "skey",
  "psrf_qqopenid",
  "psrf_qqunionid",
  "psrf_qqaccess_token",
  "psrf_qqrefresh_token",
  "wxopenid",
  "wxunionid",
  "wxrefresh_token",
  "wxskey",
  "p_uin",
  "ptcz",
  "RK",
];

function validateBaseUrl(value: string): string {
  const url = new URL(value);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("QQ 音乐网关必须使用 HTTPS；本地开发仅允许 loopback HTTP");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("QQ 音乐网关地址不能包含内嵌凭据、查询参数或片段");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
}

function parseCookieHeader(cookieText: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of cookieText.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function qqCookieHasLogin(cookieText: string): boolean {
  const cookie = parseCookieHeader(cookieText);
  const rawUin = Number(cookie.login_type) === 2
    ? (cookie.wxuin || cookie.uin || cookie.p_uin || "")
    : (cookie.uin || cookie.qqmusic_uin || cookie.wxuin || cookie.p_uin || "");
  const uin = rawUin.replace(/\D/g, "");
  const musicKey = cookie.qm_keyst || cookie.qqmusic_key || cookie.music_key || cookie.p_skey || cookie.skey
    || cookie.psrf_qqaccess_token || cookie.psrf_qqrefresh_token || cookie.wxrefresh_token || cookie.wxskey || "";
  return Boolean(uin && musicKey);
}

function qqCookieHasPlaybackLogin(cookieText: string): boolean {
  const cookie = parseCookieHeader(cookieText);
  const rawUin = Number(cookie.login_type) === 2
    ? (cookie.wxuin || cookie.uin || cookie.p_uin || "")
    : (cookie.uin || cookie.qqmusic_uin || cookie.wxuin || cookie.p_uin || "");
  const uin = rawUin.replace(/\D/g, "");
  const playbackKey = cookie.qm_keyst || cookie.qqmusic_key || cookie.music_key || cookie.wxskey || "";
  return Boolean(uin && playbackKey);
}

interface QQSong {
  songmid?: string;
  songname?: string;
  singer?: Array<{ name: string }>;
  albumname?: string;
  albummid?: string;
  interval?: number;
}

interface QQSearchResponse {
  data?: {
    list?: QQSong[];
    song?: { list?: QQSong[]; totalnum?: number };
    total?: number;
  };
}

interface QQSongUrlResponse {
  data?: { playUrl?: Record<string, string> } | string;
}

interface QQPlaylist {
  dissid?: string | number;
  disstid?: string | number;
  dissname?: string;
  imgurl?: string;
  song_count?: number;
  song_num?: number;
  creator?: { name?: string };
  introduction?: string;
}

function joinSinger(song: QQSong): string {
  return song.singer?.map(item => item?.name).filter(Boolean).join(", ") || "";
}

function albumCover(mid?: string): string | undefined {
  return mid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${mid}.jpg` : undefined;
}

function toTrack(song: QQSong): MusicTrack {
  const id = song.songmid || "";
  return {
    id: `qq:${id}`,
    title: song.songname || "Unknown",
    artist: joinSinger(song) || "Unknown",
    album: song.albumname,
    coverUrl: albumCover(song.albummid),
    durationSec: song.interval ?? 0,
    price: 0,
    currency: "CNY",
    version: "1.0.0",
    createdAt: "",
    updatedAt: "",
  };
}

function toPlaylist(playlist: QQPlaylist): MusicPlaylist {
  const id = String(playlist.dissid ?? playlist.disstid ?? "");
  return {
    id: `qq-playlist:${id}`,
    name: playlist.dissname || "Unknown",
    description: playlist.introduction,
    coverUrl: playlist.imgurl,
    trackCount: playlist.song_count ?? playlist.song_num,
    curator: playlist.creator?.name,
    externalUrl: id ? `https://y.qq.com/n/ryqq/playlist/${id}` : undefined,
  };
}

export class QQMusicAccountConnector implements MusicConnector {
  readonly meta: MusicConnectorMeta = {
    id: "qq-music-account",
    familyId: "qq-music",
    variant: "account",
    authRequirement: "required",
    supportedHosts: ["desktop"],
    name: "QQ 音乐账号",
    description: "QQ Music account login through the official web page with a credential-free catalog gateway",
    version: "0.1.0",
    capabilities: ["search", "stream", "playlist", "login"],
    configSchema: [{
      key: "apiBaseUrl",
      label: "QQ Music API 端点",
      type: "url",
      required: false,
      placeholder: "https://your-qqmusic-gateway.example.com",
      help: "可选的无凭据目录网关。账号 Cookie 不会发送到此地址。",
    }],
  };

  private baseUrl = "";
  private cookie = "";

  async init(config?: Record<string, unknown>): Promise<void> {
    const typed = config as QQMusicAccountConfig | undefined;
    const configuredUrl = (typed?.apiBaseUrl || "").trim();
    this.baseUrl = configuredUrl ? validateBaseUrl(configuredUrl) : "";
    this.cookie = typeof typed?.cookie === "string" && qqCookieHasLogin(typed.cookie) ? typed.cookie : "";
  }

  async login(request: MusicConnectorLoginRequest = { intent: "status" }): Promise<MusicConnectorLoginResult> {
    const intent = request.intent ?? "status";
    if (intent === "status") {
      return this.cookie
        ? { status: "authenticated", message: "QQ 音乐账号会话可用" }
        : { status: "anonymous", message: "未登录 QQ 音乐" };
    }
    if (intent === "logout") {
      this.cookie = "";
      return { status: "anonymous", message: "已退出 QQ 音乐账号" };
    }
    if (intent === "cancel") {
      return { status: this.cookie ? "authenticated" : "anonymous", message: "已取消 QQ 音乐登录" };
    }
    if (intent === "continue") {
      const submittedCookie = typeof request.input?.cookie === "string" ? request.input.cookie : "";
      if (!submittedCookie) {
        if (request.flowId === QQ_WEB_COOKIE_FLOW_ID) {
          return this.startWebLogin("请继续在 QQ 音乐官方页面扫码并确认登录");
        }
        return { status: "error", message: "未收到 QQ 音乐登录会话" };
      }
      if (!qqCookieHasLogin(submittedCookie)) {
        return { status: "error", message: "未读取到有效 QQ 音乐会话 Cookie" };
      }
      this.cookie = submittedCookie;
      return {
        status: "authenticated",
        message: qqCookieHasPlaybackLogin(submittedCookie)
          ? "QQ 音乐登录成功"
          : "QQ 音乐登录成功；如部分歌曲无法播放，请重新登录以补全播放会话",
      };
    }
    return this.startWebLogin();
  }

  async search(query: MusicListQuery): Promise<MusicSearchResult> {
    const keyword = (query.keyword || "").trim();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    if (!keyword || !this.baseUrl) return { tracks: [], total: 0, page, pageSize };
    const data = await this.request<QQSearchResponse>("/search", { key: keyword, pageNo: page, pageSize });
    const list = data.data?.list ?? data.data?.song?.list ?? [];
    return { tracks: list.map(toTrack), total: data.data?.total ?? data.data?.song?.totalnum ?? list.length, page, pageSize };
  }

  async getTrack(trackId: string): Promise<MusicTrack | null> {
    const mid = this.parseTrackId(trackId);
    if (!mid || !this.baseUrl) return null;
    const data = await this.request<{ data?: QQSong | QQSong[] }>("/song", { songmid: mid });
    const song = Array.isArray(data.data) ? data.data[0] : data.data;
    return song ? toTrack(song) : null;
  }

  async getStreamUrl(trackId: string): Promise<MusicStreamInfo | null> {
    const mid = this.parseTrackId(trackId);
    if (!mid || !this.baseUrl) return null;
    const data = await this.request<QQSongUrlResponse>("/song/url", { id: mid });
    const url = typeof data.data === "string" ? data.data : data.data?.playUrl?.[mid];
    return url ? { url, format: "mp3" } : null;
  }

  async listPlaylists(query: MusicPlaylistQuery = {}): Promise<MusicPlaylistList> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    if (!this.baseUrl) return { playlists: [], total: 0, page, pageSize };
    const data = await this.request<{ data?: { list?: QQPlaylist[]; total?: number } }>("/top/playlist", {
      pageNo: page,
      pageSize,
      sortId: query.sort === "new" ? 2 : 5,
      ...(query.category ? { categoryId: query.category } : {}),
    });
    const list = data.data?.list ?? [];
    return { playlists: list.map(toPlaylist), total: data.data?.total ?? list.length, page, pageSize };
  }

  async getPlaylistTracks(playlistId: string, opts: { page?: number; pageSize?: number } = {}): Promise<MusicSearchResult> {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 30;
    const id = this.parsePlaylistId(playlistId);
    if (!id || !this.baseUrl) return { tracks: [], total: 0, page, pageSize };
    const data = await this.request<{ data?: { songlist?: QQSong[] } }>("/playlist", { id });
    const songs = data.data?.songlist ?? [];
    return { tracks: songs.map(toTrack), total: songs.length, page, pageSize };
  }

  private startWebLogin(message = "请在 QQ 音乐官方页面扫码登录；桌面端会自动安全保存账号会话"): MusicConnectorLoginResult {
    return {
      status: "pending",
      flow: "browser",
      flowId: QQ_WEB_COOKIE_FLOW_ID,
      actions: [{
        type: "open-url",
        label: "打开 QQ 音乐官方扫码登录",
        url: QQ_LOGIN_URL,
        cookieCapture: {
          provider: "qq-music",
          title: "QQ 音乐登录",
          domains: ["qq.com", "y.qq.com", "qqmusic.qq.com"],
          requiredCookieNames: ["uin", "qqmusic_uin", "wxuin", "p_uin"],
          playbackCookieNames: ["qm_keyst", "qqmusic_key", "music_key", "wxskey"],
          cookieNames: QQ_COOKIE_PRIORITY,
          warmupUrl: QQ_WARMUP_URL,
          message: "桌面端会在隔离窗口打开 QQ 音乐官方页面并由宿主安全保存 Cookie。",
        },
        message,
      }],
      message,
    };
  }

  private parseTrackId(trackId: string): string | null {
    return trackId.startsWith("qq:") ? trackId.slice(3) : trackId || null;
  }

  private parsePlaylistId(playlistId: string): string | null {
    return playlistId.startsWith("qq-playlist:") ? playlistId.slice("qq-playlist:".length) : playlistId || null;
  }

  private async request<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(path, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`QQ Music API failed: ${response.status} ${response.statusText}`);
    return response.json() as Promise<T>;
  }
}

export default QQMusicAccountConnector;
