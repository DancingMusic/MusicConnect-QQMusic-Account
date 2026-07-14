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
  MusicTrackAccess,
} from "@dancingmusic/music-connect";

type AccountMusicTrack = MusicTrack & { access?: MusicTrackAccess };
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

function normalizeAccountId(value: unknown): string {
  return text(value).replace(/\D/g, "");
}

function resolveQqAccountId(cookie: Record<string, string>): string {
  const rawUin = Number(cookie.login_type) === 2
    ? (cookie.wxuin || cookie.uin || cookie.p_uin || "")
    : (cookie.uin || cookie.qqmusic_uin || cookie.wxuin || cookie.p_uin || "");
  return normalizeAccountId(rawUin);
}

function qqCookieHasLogin(cookieText: string): boolean {
  const cookie = parseCookieHeader(cookieText);
  const uin = resolveQqAccountId(cookie);
  const musicKey = cookie.qm_keyst || cookie.qqmusic_key || cookie.music_key || cookie.p_skey || cookie.skey
    || cookie.psrf_qqaccess_token || cookie.psrf_qqrefresh_token || cookie.wxrefresh_token || cookie.wxskey || "";
  return Boolean(uin && musicKey);
}

function qqCookieHasPlaybackLogin(cookieText: string): boolean {
  const cookie = parseCookieHeader(cookieText);
  const uin = resolveQqAccountId(cookie);
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

function trackAccess(song: Record<string, unknown>): MusicTrackAccess {
  const pay = asRecord(song.pay);
  const file = asRecord(song.file);
  const requiresMembership = Number(pay?.pay_play ?? pay?.payplay ?? 0) > 0;
  const catalogMembership = requiresMembership || Number(pay?.pay_month ?? pay?.paymonth ?? 0) > 0;
  const tryBegin = Number(file?.try_begin ?? file?.trybegin ?? 0);
  const tryEnd = Number(file?.try_end ?? file?.tryend ?? 0);
  const trySize = Number(file?.size_try ?? file?.sizeTry ?? 0);
  const hasPreview = Number.isFinite(trySize) && trySize > 0;
  const explicitlyDisabled = Number(song.disabled ?? 0) > 0;
  const audioSizeKeys = [
    "size_128mp3", "size_320mp3", "size_192aac", "size_96aac", "size_flac", "size_hires",
  ];
  const hasAudioSizeMetadata = !!file && audioSizeKeys.some(key => Object.prototype.hasOwnProperty.call(file, key));
  const hasAnyAudioFile = !file || !hasAudioSizeMetadata || audioSizeKeys.some(key => Number(file[key] ?? 0) > 0);
  const badges = catalogMembership
    ? [{ kind: "membership", label: "VIP", reason: "QQ 音乐会员目录歌曲" }]
    : undefined;
  const entitlement = catalogMembership
    ? { kind: "subscription", state: requiresMembership ? "required" as const : "granted" as const, tier: "VIP" }
    : undefined;
  const preview = hasPreview
    ? {
        available: true,
        ...(Number.isFinite(tryBegin) && tryBegin >= 0 ? { startMs: tryBegin } : {}),
        ...(Number.isFinite(tryEnd) && tryEnd > 0 ? { endMs: tryEnd } : {}),
      }
    : undefined;

  if (requiresMembership) {
    return {
      availability: "membership-required",
      requiredMembership: "VIP",
      label: "VIP",
      reason: "需要有效的 QQ 音乐会员权限",
      badges,
      entitlement,
      preview,
    };
  }
  if (!hasAnyAudioFile && hasPreview) {
    return {
      availability: "preview",
      label: "试听",
      reason: "当前歌曲仅提供试听片段",
      badges: [{ kind: "trial", label: "试听" }],
      preview,
    };
  }
  if (explicitlyDisabled || !hasAnyAudioFile) {
    return { availability: "unavailable", label: "不可用", reason: "QQ 音乐未返回可用的完整音频文件" };
  }
  return {
    availability: "playable",
    ...(catalogMembership ? {
      requiredMembership: "VIP",
      label: "VIP",
      reason: "当前账号已具备 QQ 音乐会员播放权限",
      badges,
      entitlement,
    } : {}),
    ...(preview ? { preview } : {}),
  };
}

function findAccountRecord(
  data: Record<string, unknown> | undefined,
  accountId: string,
  mapKeys: string[],
  listKeys: string[],
): Record<string, unknown> | undefined {
  if (!data || !accountId) return undefined;
  for (const key of mapKeys) {
    const map = asRecord(data[key]);
    const direct = asRecord(map?.[accountId]);
    if (direct) return direct;
    if (!map) continue;
    for (const [mapAccountId, value] of Object.entries(map)) {
      if (normalizeAccountId(mapAccountId) === accountId) {
        const record = asRecord(value);
        if (record) return record;
      }
    }
  }
  for (const key of listKeys) {
    for (const value of asArray(data[key])) {
      const record = asRecord(value);
      if (!record) continue;
      const recordId = normalizeAccountId(record.uin ?? record.qqmusic_uin ?? record.wxuin ?? record.id);
      if (recordId === accountId) return record;
    }
  }
  return undefined;
}

const MEMBERSHIP_FLAG_KEYS = [
  "HugeVip", "hugeVip", "iSuperVip", "isSuperVip", "superVip", "iVipFlag", "vipFlag",
  "itwelve", "iTwelve", "ieight", "iEight",
] as const;

function accountMembership(value: Record<string, unknown> | undefined): AccountMembership | undefined {
  if (!value) return undefined;
  const sources = [value, asRecord(value.mVip), asRecord(value.vipInfo)].filter(Boolean) as Record<string, unknown>[];
  const hasKnownStatus = sources.some(source => MEMBERSHIP_FLAG_KEYS.some(key => Object.prototype.hasOwnProperty.call(source, key)));
  if (!hasKnownStatus) return undefined;

  const enabled = (...keys: string[]) => sources.some(source => keys.some(key => Number(source[key] ?? 0) > 0));
  const labels: string[] = [];
  let tier: string | undefined;
  if (enabled("HugeVip", "hugeVip")) { labels.push("超级会员"); tier = "SVIP"; }
  if (enabled("iSuperVip", "isSuperVip", "superVip")) { labels.push("豪华绿钻"); tier ??= "VIP"; }
  else if (enabled("iVipFlag", "vipFlag")) { labels.push("绿钻"); tier ??= "VIP"; }
  if (enabled("itwelve", "iTwelve")) { labels.push("豪华音乐包"); tier ??= "VIP"; }
  else if (enabled("ieight", "iEight")) { labels.push("音乐包"); tier ??= "VIP"; }
  return {
    active: labels.length > 0,
    label: labels.join(" · ") || "普通账号",
    tier,
  };
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
    version: "0.3.2",
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
    if (access?.availability === "copyright-restricted" || access?.availability === "region-restricted" || access?.availability === "unavailable") return null;
    if (access?.availability === "membership-required" && this.profile?.membership?.active === false) {
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
    const uin = resolveQqAccountId(cookie);
    const baseData = asRecord(asRecord(response.req_2)?.data);
    const base = findAccountRecord(baseData, uin, ["map_userinfo", "map_user_info", "userInfoMap"], ["vec_userinfo", "user_list"]);
    const vipData = asRecord(asRecord(response.req_1)?.data);
    const vip = findAccountRecord(vipData, uin, ["infoMap", "info_map", "vipInfoMap"], ["infoList", "vip_info_list"]);
    const membership = accountMembership(vip);
    const isWeChatLogin = Number(cookie.login_type) === 2;
    const avatarUrl = httpsUrl(base?.headurl ?? base?.head_url ?? base?.avatarUrl ?? base?.avatar)
      ?? (!isWeChatLogin && uin ? `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(uin)}&s=640` : undefined);
    this.profile = {
      id: uin || undefined,
      name: text(base?.nick ?? base?.nickname ?? base?.name) || undefined,
      avatarUrl,
      membership,
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
