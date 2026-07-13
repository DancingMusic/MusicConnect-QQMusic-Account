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
  MusicLyrics,
  MusicPlaylist,
  MusicPlaylistList,
  MusicPlaylistQuery,
  MusicSearchResult,
  MusicStreamInfo,
  MusicTrack,
} from "@dancingmusic/music-connect";

type TrackAvailability = "playable" | "preview" | "membership-required" | "copyright-restricted" | "region-restricted" | "unavailable";
interface TrackAccess {
  availability: TrackAvailability;
  requiredMembership?: string;
  label?: string;
  reason?: string;
}
type AccountMusicTrack = MusicTrack & { access?: TrackAccess };
interface AccountMembership {
  active: boolean;
  label?: string;
  tier?: string;
  expiresAt?: number;
}

export interface QQMusicAccountConfig {
  /** Secret injected at runtime by the DancingMusic host credential vault. */
  cookie?: string;
}

interface QQMusicAccountHost {
  officialProviderRequest?<T = unknown>(operation: string, params?: Record<string, unknown>): Promise<T>;
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function httpsUrl(value: unknown): string | undefined {
  const raw = text(value).trim();
  if (!raw) return undefined;
  if (raw.startsWith("//")) return `https:${raw}`;
  return raw.replace(/^http:\/\//i, "https://");
}

function trackAccess(song: Record<string, unknown>): TrackAccess {
  const pay = asRecord(song.pay);
  const action = asRecord(song.action);
  const file = asRecord(song.file);
  const requiresMembership = Number(pay?.pay_play ?? pay?.payplay ?? 0) > 0;
  const tryBegin = Number(song.try_begin ?? song.trybegin ?? pay?.time_free ?? 0);
  const tryEnd = Number(song.try_end ?? song.tryend ?? 0);
  const hasPreview = Number.isFinite(tryEnd) && tryEnd > Math.max(0, tryBegin);
  const explicitlyDisabled = Number(song.disabled ?? 0) > 0
    || (action && Object.prototype.hasOwnProperty.call(action, "play") && Number(action.play) === 0 && !requiresMembership);
  const audioSizeKeys = [
    "size_128mp3", "size_320mp3", "size_192aac", "size_96aac", "size_flac", "size_hires",
  ];
  const hasAudioSizeMetadata = !!file && audioSizeKeys.some(key => Object.prototype.hasOwnProperty.call(file, key));
  const hasAnyAudioFile = !file || !hasAudioSizeMetadata || audioSizeKeys.some(key => Number(file[key] ?? 0) > 0);

  if (hasPreview) return { availability: "preview", label: "试听", reason: "当前歌曲仅提供试听片段" };
  if (requiresMembership) {
    return {
      availability: "membership-required",
      requiredMembership: "VIP",
      label: "VIP",
      reason: "需要有效的 QQ 音乐会员权限",
    };
  }
  if (explicitlyDisabled || !hasAnyAudioFile) {
    return { availability: "copyright-restricted", label: "无版权", reason: "当前歌曲受版权限制，暂无完整音源" };
  }
  return { availability: "playable" };
}

function toOfficialTrack(value: unknown): AccountMusicTrack | null {
  const outer = asRecord(value);
  const song = asRecord(outer?.songInfo) ?? outer;
  if (!song) return null;
  const mid = text(song.mid ?? song.songmid);
  if (!mid) return null;
  const singers = asArray(song.singer).map(asRecord).map(item => text(item?.name)).filter(Boolean);
  const album = asRecord(song.album) ?? asRecord(song.al);
  const albumMid = text(album?.mid ?? song.albummid);
  return {
    id: `qq:${mid}`,
    title: text(song.name ?? song.title ?? song.songname) || "Unknown",
    artist: singers.join(", ") || "Unknown",
    album: text(album?.name ?? song.albumname) || undefined,
    coverUrl: albumMid ? albumCover(albumMid) : httpsUrl(song.picurl),
    durationSec: Number(song.interval ?? song.duration ?? 0),
    price: 0,
    currency: "CNY",
    version: "1.0.0",
    createdAt: "",
    updatedAt: "",
    access: trackAccess(song),
  };
}

function officialMediaMid(value: unknown): string {
  const outer = asRecord(value);
  const song = asRecord(outer?.songInfo) ?? outer;
  const file = asRecord(song?.file);
  return text(file?.media_mid ?? file?.mediaMid ?? song?.media_mid);
}

function toOfficialPlaylist(value: unknown): MusicPlaylist | null {
  const item = asRecord(value);
  if (!item) return null;
  const creator = asRecord(item.creator);
  const id = text(item.tid ?? item.dirid ?? item.dissid ?? item.id ?? item.content_id);
  if (!id) return null;
  return {
    id: `qq-playlist:${id}`,
    name: text(item.dirName ?? item.diss_name ?? item.dissname ?? item.name ?? item.title) || "QQ 音乐歌单",
    description: text(item.desc ?? item.description) || undefined,
    coverUrl: httpsUrl(item.picUrl ?? item.bigpicUrl ?? item.picurl ?? item.cover_url_big ?? item.coverUrl ?? item.cover),
    trackCount: Number(item.song_cnt ?? item.song_count ?? item.song_num ?? item.songNum ?? 0) || undefined,
    curator: text(creator?.name ?? creator?.nick ?? creator?.nickname ?? item.creator) || undefined,
    externalUrl: `https://y.qq.com/n/ryqq/playlist/${id}`,
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
    description: "QQ Music account login and catalog through the host-owned official provider adapter",
    version: "0.3.0",
    capabilities: ["search", "stream", "lyrics", "playlist", "login", "user-library", "recommendations"],
  };

  private cookie = "";
  private host: QQMusicAccountHost | null = null;
  private profile: { id?: string; name?: string; avatarUrl?: string; membership?: AccountMembership } | null = null;
  private tracks = new Map<string, AccountMusicTrack>();
  private mediaMids = new Map<string, string>();

  async init(config?: Record<string, unknown>, host?: QQMusicAccountHost): Promise<void> {
    const typed = config as QQMusicAccountConfig | undefined;
    this.cookie = typeof typed?.cookie === "string" && qqCookieHasLogin(typed.cookie) ? typed.cookie : "";
    this.host = host ?? null;
    if (this.cookie && this.host?.officialProviderRequest) await this.refreshProfile().catch(() => undefined);
  }

  async login(request: MusicConnectorLoginRequest = { intent: "status" }): Promise<MusicConnectorLoginResult> {
    const intent = request.intent ?? "status";
    if (intent === "status") {
      if (this.cookie && this.host?.officialProviderRequest) {
        try {
          await this.refreshProfile();
        } catch {
          return { status: "expired", message: "QQ 音乐登录会话已失效，请重新扫码登录" };
        }
      }
      return this.cookie
        ? { status: "authenticated", user: this.profile ? { id: this.profile.id, name: this.profile.name, avatarUrl: this.profile.avatarUrl } : undefined, membership: this.profile?.membership, message: "QQ 音乐账号会话可用" } as MusicConnectorLoginResult
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
      if (this.host?.officialProviderRequest) {
        try {
          await this.refreshProfile();
        } catch {
          this.cookie = "";
          return { status: "error", message: "QQ 音乐会话校验失败，请重新扫码登录" };
        }
      }
      return {
        status: "authenticated",
        user: this.profile ? { id: this.profile.id, name: this.profile.name, avatarUrl: this.profile.avatarUrl } : undefined,
        ...(this.profile?.membership ? { membership: this.profile.membership } : {}),
        message: qqCookieHasPlaybackLogin(submittedCookie)
          ? "QQ 音乐登录成功"
          : "QQ 音乐登录成功；如部分歌曲无法播放，请重新登录以补全播放会话",
      } as MusicConnectorLoginResult;
    }
    return this.startWebLogin();
  }

  async search(query: MusicListQuery): Promise<MusicSearchResult> {
    const keyword = (query.keyword || "").trim();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    if (!keyword) return { tracks: [], total: 0, page, pageSize };
    const response = await this.official<Record<string, unknown>>("qq.catalog.search", { query: keyword, page, pageSize });
    const data = asRecord(asRecord(response.req_1)?.data);
    const body = asRecord(data?.body);
    const song = asRecord(body?.song);
    const rawList = asArray(song?.list);
    const list = rawList.map(toOfficialTrack).filter((item): item is MusicTrack => !!item);
    rawList.forEach(value => {
      const track = toOfficialTrack(value);
      const mediaMid = officialMediaMid(value);
      if (track && mediaMid) this.mediaMids.set(track.id, mediaMid);
    });
    list.forEach(item => this.tracks.set(item.id, item));
    const meta = asRecord(data?.meta);
    return { tracks: list, total: Number(meta?.sum ?? list.length), page, pageSize };
  }

  async getTrack(trackId: string): Promise<MusicTrack | null> {
    return this.tracks.get(trackId) ?? null;
  }

  async getStreamUrl(trackId: string): Promise<MusicStreamInfo | null> {
    const mid = this.parseTrackId(trackId);
    if (!mid) return null;
    const track = this.tracks.get(trackId);
    const access = track?.access;
    if (access?.availability === "copyright-restricted" || access?.availability === "region-restricted") return null;
    if (access?.availability === "membership-required" && !this.profile?.membership?.active) {
      throw new Error("QQ_MUSIC_MEMBERSHIP_REQUIRED");
    }
    const response = await this.official<Record<string, unknown>>("qq.stream.resolve", {
      songmid: mid,
      ...(this.mediaMids.get(trackId) ? { mediaMid: this.mediaMids.get(trackId) } : {}),
      requiresMembership: access?.availability === "membership-required",
      membershipActive: this.profile?.membership?.active === true,
    });
    const envelope = asRecord(response.req_0) ?? asRecord(response.req_1);
    const data = asRecord(envelope?.data);
    const midurlinfo = asArray(data?.midurlinfo).map(asRecord)
      .find(item => typeof item?.purl === "string" && item.purl.length > 0);
    const purl = typeof midurlinfo?.purl === "string" ? midurlinfo.purl : "";
    const sip = asArray(data?.sip).find(value => typeof value === "string") as string | undefined
      ?? "https://ws.stream.qqmusic.qq.com/";
    return purl ? { url: new URL(purl, sip).toString(), format: purl.split(".").pop()?.split("?")[0] || "m4a" } : null;
  }

  async getLyrics(trackId: string): Promise<MusicLyrics | null> {
    const mid = this.parseTrackId(trackId);
    if (!mid) return null;
    const response = await this.official<Record<string, unknown>>("qq.track.lyrics", { songmid: mid });
    const data = asRecord(asRecord(response.req_1)?.data) ?? asRecord(response.data) ?? response;
    const lyric = decodeProviderText(data.lyric);
    const translated = decodeProviderText(data.trans ?? data.translated);
    return lyric ? { text: lyric, ...(translated ? { translated } : {}) } : null;
  }

  async listPlaylists(query: MusicPlaylistQuery = {}): Promise<MusicPlaylistList> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    if (query.category === "recommendations") {
      const response = await this.official<Record<string, unknown>>("qq.recommend.playlists", { page, pageSize });
      const data = asRecord(asRecord(response.req_1)?.data);
      const items = asArray(data?.v_playlist).map(toOfficialPlaylist).filter((item): item is MusicPlaylist => !!item);
      return { playlists: items, total: Number(data?.total ?? items.length), page, pageSize };
    }
    const response = await this.official<Record<string, unknown>>("qq.account.playlists");
    const data = asRecord(asRecord(response.req_1)?.data);
    const all = asArray(data?.v_playlist).map(toOfficialPlaylist).filter((item): item is MusicPlaylist => !!item);
    const start = Math.max(0, (page - 1) * pageSize);
    return { playlists: all.slice(start, start + pageSize), total: all.length, page, pageSize };
  }

  async getPlaylistTracks(playlistId: string, opts: { page?: number; pageSize?: number } = {}): Promise<MusicSearchResult> {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 30;
    const id = this.parsePlaylistId(playlistId);
    if (!id) return { tracks: [], total: 0, page, pageSize };
    const response = await this.official<Record<string, unknown>>("qq.playlist.tracks", {
      playlistId: id,
      offset: Math.max(0, (page - 1) * pageSize),
      limit: pageSize,
    });
    const data = asRecord(asRecord(response.req_1)?.data);
    const rawSongs = asArray(data?.songlist);
    const songs = rawSongs.map(toOfficialTrack).filter((item): item is MusicTrack => !!item);
    rawSongs.forEach(value => {
      const track = toOfficialTrack(value);
      const mediaMid = officialMediaMid(value);
      if (track && mediaMid) this.mediaMids.set(track.id, mediaMid);
    });
    songs.forEach(item => this.tracks.set(item.id, item));
    return { tracks: songs, total: Number(data?.total_song_num ?? songs.length), page, pageSize };
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

  private async official<T>(operation: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.cookie) throw new Error("QQ_MUSIC_LOGIN_REQUIRED");
    if (!this.host?.officialProviderRequest) throw new Error("QQ_MUSIC_OFFICIAL_PROVIDER_UNAVAILABLE");
    return this.host.officialProviderRequest<T>(operation, params);
  }

  private async refreshProfile(): Promise<void> {
    const response = await this.official<Record<string, unknown>>("qq.account.profile");
    const cookie = parseCookieHeader(this.cookie);
    const uin = (cookie.uin || cookie.qqmusic_uin || cookie.wxuin || cookie.p_uin || "").replace(/\D/g, "");
    const baseMap = asRecord(asRecord(asRecord(response.req_2)?.data)?.map_userinfo);
    const base = asRecord(baseMap?.[uin]);
    const vipMap = asRecord(asRecord(asRecord(response.req_1)?.data)?.infoMap);
    const vip = asRecord(vipMap?.[uin]);
    const memberships: string[] = [];
    let tier: string | undefined;
    if (Number(vip?.HugeVip)) { memberships.push("超级会员"); tier = "SVIP"; }
    if (Number(vip?.iSuperVip)) { memberships.push("豪华绿钻"); tier ??= "VIP"; }
    else if (Number(vip?.iVipFlag)) { memberships.push("绿钻"); tier ??= "VIP"; }
    if (Number(vip?.itwelve)) { memberships.push("豪华音乐包"); tier ??= "VIP"; }
    else if (Number(vip?.ieight)) { memberships.push("音乐包"); tier ??= "VIP"; }
    this.profile = {
      id: uin || undefined,
      name: text(base?.nick) || undefined,
      avatarUrl: httpsUrl(base?.headurl),
      membership: {
        active: memberships.length > 0,
        label: memberships.join(" · ") || "普通账号",
        tier,
      },
    };
  }
}

function decodeProviderText(value: unknown): string {
  const raw = text(value).trim();
  if (!raw) return "";
  if (raw.includes("[00:") || raw.includes("[ti:")) return raw;
  try {
    const binary = globalThis.atob(raw);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes).trim();
  } catch {
    return "";
  }
}

export default QQMusicAccountConnector;
