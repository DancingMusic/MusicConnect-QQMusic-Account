// src/index.ts
var QQ_WEB_COOKIE_FLOW_ID = "qq-music-account-web-cookie";
var QQ_LOGIN_URL = "https://y.qq.com/n/ryqq/profile";
var QQ_WARMUP_URL = "https://y.qq.com/n/ryqq/player";
var QQ_COOKIE_PRIORITY = [
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
  "RK"
];
function parseCookieHeader(cookieText) {
  const result = {};
  for (const part of cookieText.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}
function qqCookieHasLogin(cookieText) {
  const cookie = parseCookieHeader(cookieText);
  const rawUin = Number(cookie.login_type) === 2 ? cookie.wxuin || cookie.uin || cookie.p_uin || "" : cookie.uin || cookie.qqmusic_uin || cookie.wxuin || cookie.p_uin || "";
  const uin = rawUin.replace(/\D/g, "");
  const musicKey = cookie.qm_keyst || cookie.qqmusic_key || cookie.music_key || cookie.p_skey || cookie.skey || cookie.psrf_qqaccess_token || cookie.psrf_qqrefresh_token || cookie.wxrefresh_token || cookie.wxskey || "";
  return Boolean(uin && musicKey);
}
function qqCookieHasPlaybackLogin(cookieText) {
  const cookie = parseCookieHeader(cookieText);
  const rawUin = Number(cookie.login_type) === 2 ? cookie.wxuin || cookie.uin || cookie.p_uin || "" : cookie.uin || cookie.qqmusic_uin || cookie.wxuin || cookie.p_uin || "";
  const uin = rawUin.replace(/\D/g, "");
  const playbackKey = cookie.qm_keyst || cookie.qqmusic_key || cookie.music_key || cookie.wxskey || "";
  return Boolean(uin && playbackKey);
}
function albumCover(mid) {
  return mid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${mid}.jpg` : void 0;
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function text(value) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function httpsUrl(value) {
  const raw = text(value).trim();
  if (!raw) return void 0;
  if (raw.startsWith("//")) return `https:${raw}`;
  return raw.replace(/^http:\/\//i, "https://");
}
function trackAccess(song) {
  const pay = asRecord(song.pay);
  const action = asRecord(song.action);
  const file = asRecord(song.file);
  const requiresMembership = Number(pay?.pay_play ?? pay?.payplay ?? 0) > 0;
  const tryBegin = Number(song.try_begin ?? song.trybegin ?? pay?.time_free ?? 0);
  const tryEnd = Number(song.try_end ?? song.tryend ?? 0);
  const hasPreview = Number.isFinite(tryEnd) && tryEnd > Math.max(0, tryBegin);
  const explicitlyDisabled = Number(song.disabled ?? 0) > 0 || action && Object.prototype.hasOwnProperty.call(action, "play") && Number(action.play) === 0 && !requiresMembership;
  const audioSizeKeys = [
    "size_128mp3",
    "size_320mp3",
    "size_192aac",
    "size_96aac",
    "size_flac",
    "size_hires"
  ];
  const hasAudioSizeMetadata = !!file && audioSizeKeys.some((key) => Object.prototype.hasOwnProperty.call(file, key));
  const hasAnyAudioFile = !file || !hasAudioSizeMetadata || audioSizeKeys.some((key) => Number(file[key] ?? 0) > 0);
  if (hasPreview) return { availability: "preview", label: "\u8BD5\u542C", reason: "\u5F53\u524D\u6B4C\u66F2\u4EC5\u63D0\u4F9B\u8BD5\u542C\u7247\u6BB5" };
  if (requiresMembership) {
    return {
      availability: "membership-required",
      requiredMembership: "VIP",
      label: "VIP",
      reason: "\u9700\u8981\u6709\u6548\u7684 QQ \u97F3\u4E50\u4F1A\u5458\u6743\u9650"
    };
  }
  if (explicitlyDisabled || !hasAnyAudioFile) {
    return { availability: "copyright-restricted", label: "\u65E0\u7248\u6743", reason: "\u5F53\u524D\u6B4C\u66F2\u53D7\u7248\u6743\u9650\u5236\uFF0C\u6682\u65E0\u5B8C\u6574\u97F3\u6E90" };
  }
  return { availability: "playable" };
}
function toOfficialTrack(value) {
  const outer = asRecord(value);
  const song = asRecord(outer?.songInfo) ?? outer;
  if (!song) return null;
  const mid = text(song.mid ?? song.songmid);
  if (!mid) return null;
  const singers = asArray(song.singer).map(asRecord).map((item) => text(item?.name)).filter(Boolean);
  const album = asRecord(song.album) ?? asRecord(song.al);
  const albumMid = text(album?.mid ?? song.albummid);
  return {
    id: `qq:${mid}`,
    title: text(song.name ?? song.title ?? song.songname) || "Unknown",
    artist: singers.join(", ") || "Unknown",
    album: text(album?.name ?? song.albumname) || void 0,
    coverUrl: albumMid ? albumCover(albumMid) : httpsUrl(song.picurl),
    durationSec: Number(song.interval ?? song.duration ?? 0),
    price: 0,
    currency: "CNY",
    version: "1.0.0",
    createdAt: "",
    updatedAt: "",
    access: trackAccess(song)
  };
}
function officialMediaMid(value) {
  const outer = asRecord(value);
  const song = asRecord(outer?.songInfo) ?? outer;
  const file = asRecord(song?.file);
  return text(file?.media_mid ?? file?.mediaMid ?? song?.media_mid);
}
function toOfficialPlaylist(value) {
  const item = asRecord(value);
  if (!item) return null;
  const creator = asRecord(item.creator);
  const id = text(item.tid ?? item.dirid ?? item.dissid ?? item.id ?? item.content_id);
  if (!id) return null;
  return {
    id: `qq-playlist:${id}`,
    name: text(item.dirName ?? item.diss_name ?? item.dissname ?? item.name ?? item.title) || "QQ \u97F3\u4E50\u6B4C\u5355",
    description: text(item.desc ?? item.description) || void 0,
    coverUrl: httpsUrl(item.picUrl ?? item.bigpicUrl ?? item.picurl ?? item.cover_url_big ?? item.coverUrl ?? item.cover),
    trackCount: Number(item.song_cnt ?? item.song_count ?? item.song_num ?? item.songNum ?? 0) || void 0,
    curator: text(creator?.name ?? creator?.nick ?? creator?.nickname ?? item.creator) || void 0,
    externalUrl: `https://y.qq.com/n/ryqq/playlist/${id}`
  };
}
var QQMusicAccountConnector = class {
  constructor() {
    this.meta = {
      id: "qq-music-account",
      familyId: "qq-music",
      variant: "account",
      authRequirement: "required",
      supportedHosts: ["desktop"],
      name: "QQ \u97F3\u4E50\u8D26\u53F7",
      description: "QQ Music account login and catalog through the host-owned official provider adapter",
      version: "0.3.0",
      capabilities: ["search", "stream", "lyrics", "playlist", "login", "user-library", "recommendations"]
    };
    this.cookie = "";
    this.host = null;
    this.profile = null;
    this.tracks = /* @__PURE__ */ new Map();
    this.mediaMids = /* @__PURE__ */ new Map();
  }
  async init(config, host) {
    const typed = config;
    this.cookie = typeof typed?.cookie === "string" && qqCookieHasLogin(typed.cookie) ? typed.cookie : "";
    this.host = host ?? null;
    if (this.cookie && this.host?.officialProviderRequest) await this.refreshProfile().catch(() => void 0);
  }
  async login(request = { intent: "status" }) {
    const intent = request.intent ?? "status";
    if (intent === "status") {
      if (this.cookie && this.host?.officialProviderRequest) {
        try {
          await this.refreshProfile();
        } catch {
          return { status: "expired", message: "QQ \u97F3\u4E50\u767B\u5F55\u4F1A\u8BDD\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u626B\u7801\u767B\u5F55" };
        }
      }
      return this.cookie ? { status: "authenticated", user: this.profile ? { id: this.profile.id, name: this.profile.name, avatarUrl: this.profile.avatarUrl } : void 0, membership: this.profile?.membership, message: "QQ \u97F3\u4E50\u8D26\u53F7\u4F1A\u8BDD\u53EF\u7528" } : { status: "anonymous", message: "\u672A\u767B\u5F55 QQ \u97F3\u4E50" };
    }
    if (intent === "logout") {
      this.cookie = "";
      return { status: "anonymous", message: "\u5DF2\u9000\u51FA QQ \u97F3\u4E50\u8D26\u53F7" };
    }
    if (intent === "cancel") {
      return { status: this.cookie ? "authenticated" : "anonymous", message: "\u5DF2\u53D6\u6D88 QQ \u97F3\u4E50\u767B\u5F55" };
    }
    if (intent === "continue") {
      const submittedCookie = typeof request.input?.cookie === "string" ? request.input.cookie : "";
      if (!submittedCookie) {
        if (request.flowId === QQ_WEB_COOKIE_FLOW_ID) {
          return this.startWebLogin("\u8BF7\u7EE7\u7EED\u5728 QQ \u97F3\u4E50\u5B98\u65B9\u9875\u9762\u626B\u7801\u5E76\u786E\u8BA4\u767B\u5F55");
        }
        return { status: "error", message: "\u672A\u6536\u5230 QQ \u97F3\u4E50\u767B\u5F55\u4F1A\u8BDD" };
      }
      if (!qqCookieHasLogin(submittedCookie)) {
        return { status: "error", message: "\u672A\u8BFB\u53D6\u5230\u6709\u6548 QQ \u97F3\u4E50\u4F1A\u8BDD Cookie" };
      }
      this.cookie = submittedCookie;
      if (this.host?.officialProviderRequest) {
        try {
          await this.refreshProfile();
        } catch {
          this.cookie = "";
          return { status: "error", message: "QQ \u97F3\u4E50\u4F1A\u8BDD\u6821\u9A8C\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u626B\u7801\u767B\u5F55" };
        }
      }
      return {
        status: "authenticated",
        user: this.profile ? { id: this.profile.id, name: this.profile.name, avatarUrl: this.profile.avatarUrl } : void 0,
        ...this.profile?.membership ? { membership: this.profile.membership } : {},
        message: qqCookieHasPlaybackLogin(submittedCookie) ? "QQ \u97F3\u4E50\u767B\u5F55\u6210\u529F" : "QQ \u97F3\u4E50\u767B\u5F55\u6210\u529F\uFF1B\u5982\u90E8\u5206\u6B4C\u66F2\u65E0\u6CD5\u64AD\u653E\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55\u4EE5\u8865\u5168\u64AD\u653E\u4F1A\u8BDD"
      };
    }
    return this.startWebLogin();
  }
  async search(query) {
    const keyword = (query.keyword || "").trim();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    if (!keyword) return { tracks: [], total: 0, page, pageSize };
    const response = await this.official("qq.catalog.search", { query: keyword, page, pageSize });
    const data = asRecord(asRecord(response.req_1)?.data);
    const body = asRecord(data?.body);
    const song = asRecord(body?.song);
    const rawList = asArray(song?.list);
    const list = rawList.map(toOfficialTrack).filter((item) => !!item);
    rawList.forEach((value) => {
      const track = toOfficialTrack(value);
      const mediaMid = officialMediaMid(value);
      if (track && mediaMid) this.mediaMids.set(track.id, mediaMid);
    });
    list.forEach((item) => this.tracks.set(item.id, item));
    const meta = asRecord(data?.meta);
    return { tracks: list, total: Number(meta?.sum ?? list.length), page, pageSize };
  }
  async getTrack(trackId) {
    return this.tracks.get(trackId) ?? null;
  }
  async getStreamUrl(trackId) {
    const mid = this.parseTrackId(trackId);
    if (!mid) return null;
    const track = this.tracks.get(trackId);
    const access = track?.access;
    if (access?.availability === "copyright-restricted" || access?.availability === "region-restricted") return null;
    if (access?.availability === "membership-required" && !this.profile?.membership?.active) {
      throw new Error("QQ_MUSIC_MEMBERSHIP_REQUIRED");
    }
    const response = await this.official("qq.stream.resolve", {
      songmid: mid,
      ...this.mediaMids.get(trackId) ? { mediaMid: this.mediaMids.get(trackId) } : {},
      requiresMembership: access?.availability === "membership-required",
      membershipActive: this.profile?.membership?.active === true
    });
    const envelope = asRecord(response.req_0) ?? asRecord(response.req_1);
    const data = asRecord(envelope?.data);
    const midurlinfo = asArray(data?.midurlinfo).map(asRecord).find((item) => typeof item?.purl === "string" && item.purl.length > 0);
    const purl = typeof midurlinfo?.purl === "string" ? midurlinfo.purl : "";
    const sip = asArray(data?.sip).find((value) => typeof value === "string") ?? "https://ws.stream.qqmusic.qq.com/";
    return purl ? { url: new URL(purl, sip).toString(), format: purl.split(".").pop()?.split("?")[0] || "m4a" } : null;
  }
  async getLyrics(trackId) {
    const mid = this.parseTrackId(trackId);
    if (!mid) return null;
    const response = await this.official("qq.track.lyrics", { songmid: mid });
    const data = asRecord(asRecord(response.req_1)?.data) ?? asRecord(response.data) ?? response;
    const lyric = decodeProviderText(data.lyric);
    const translated = decodeProviderText(data.trans ?? data.translated);
    return lyric ? { text: lyric, ...translated ? { translated } : {} } : null;
  }
  async listPlaylists(query = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    if (query.category === "recommendations") {
      const response2 = await this.official("qq.recommend.playlists", { page, pageSize });
      const data2 = asRecord(asRecord(response2.req_1)?.data);
      const items = asArray(data2?.v_playlist).map(toOfficialPlaylist).filter((item) => !!item);
      return { playlists: items, total: Number(data2?.total ?? items.length), page, pageSize };
    }
    const response = await this.official("qq.account.playlists");
    const data = asRecord(asRecord(response.req_1)?.data);
    const all = asArray(data?.v_playlist).map(toOfficialPlaylist).filter((item) => !!item);
    const start = Math.max(0, (page - 1) * pageSize);
    return { playlists: all.slice(start, start + pageSize), total: all.length, page, pageSize };
  }
  async getPlaylistTracks(playlistId, opts = {}) {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 30;
    const id = this.parsePlaylistId(playlistId);
    if (!id) return { tracks: [], total: 0, page, pageSize };
    const response = await this.official("qq.playlist.tracks", {
      playlistId: id,
      offset: Math.max(0, (page - 1) * pageSize),
      limit: pageSize
    });
    const data = asRecord(asRecord(response.req_1)?.data);
    const rawSongs = asArray(data?.songlist);
    const songs = rawSongs.map(toOfficialTrack).filter((item) => !!item);
    rawSongs.forEach((value) => {
      const track = toOfficialTrack(value);
      const mediaMid = officialMediaMid(value);
      if (track && mediaMid) this.mediaMids.set(track.id, mediaMid);
    });
    songs.forEach((item) => this.tracks.set(item.id, item));
    return { tracks: songs, total: Number(data?.total_song_num ?? songs.length), page, pageSize };
  }
  startWebLogin(message = "\u8BF7\u5728 QQ \u97F3\u4E50\u5B98\u65B9\u9875\u9762\u626B\u7801\u767B\u5F55\uFF1B\u684C\u9762\u7AEF\u4F1A\u81EA\u52A8\u5B89\u5168\u4FDD\u5B58\u8D26\u53F7\u4F1A\u8BDD") {
    return {
      status: "pending",
      flow: "browser",
      flowId: QQ_WEB_COOKIE_FLOW_ID,
      actions: [{
        type: "open-url",
        label: "\u6253\u5F00 QQ \u97F3\u4E50\u5B98\u65B9\u626B\u7801\u767B\u5F55",
        url: QQ_LOGIN_URL,
        cookieCapture: {
          provider: "qq-music",
          title: "QQ \u97F3\u4E50\u767B\u5F55",
          domains: ["qq.com", "y.qq.com", "qqmusic.qq.com"],
          requiredCookieNames: ["uin", "qqmusic_uin", "wxuin", "p_uin"],
          playbackCookieNames: ["qm_keyst", "qqmusic_key", "music_key", "wxskey"],
          cookieNames: QQ_COOKIE_PRIORITY,
          warmupUrl: QQ_WARMUP_URL,
          message: "\u684C\u9762\u7AEF\u4F1A\u5728\u9694\u79BB\u7A97\u53E3\u6253\u5F00 QQ \u97F3\u4E50\u5B98\u65B9\u9875\u9762\u5E76\u7531\u5BBF\u4E3B\u5B89\u5168\u4FDD\u5B58 Cookie\u3002"
        },
        message
      }],
      message
    };
  }
  parseTrackId(trackId) {
    return trackId.startsWith("qq:") ? trackId.slice(3) : trackId || null;
  }
  parsePlaylistId(playlistId) {
    return playlistId.startsWith("qq-playlist:") ? playlistId.slice("qq-playlist:".length) : playlistId || null;
  }
  async official(operation, params = {}) {
    if (!this.cookie) throw new Error("QQ_MUSIC_LOGIN_REQUIRED");
    if (!this.host?.officialProviderRequest) throw new Error("QQ_MUSIC_OFFICIAL_PROVIDER_UNAVAILABLE");
    return this.host.officialProviderRequest(operation, params);
  }
  async refreshProfile() {
    const response = await this.official("qq.account.profile");
    const cookie = parseCookieHeader(this.cookie);
    const uin = (cookie.uin || cookie.qqmusic_uin || cookie.wxuin || cookie.p_uin || "").replace(/\D/g, "");
    const baseMap = asRecord(asRecord(asRecord(response.req_2)?.data)?.map_userinfo);
    const base = asRecord(baseMap?.[uin]);
    const vipMap = asRecord(asRecord(asRecord(response.req_1)?.data)?.infoMap);
    const vip = asRecord(vipMap?.[uin]);
    const memberships = [];
    let tier;
    if (Number(vip?.HugeVip)) {
      memberships.push("\u8D85\u7EA7\u4F1A\u5458");
      tier = "SVIP";
    }
    if (Number(vip?.iSuperVip)) {
      memberships.push("\u8C6A\u534E\u7EFF\u94BB");
      tier ?? (tier = "VIP");
    } else if (Number(vip?.iVipFlag)) {
      memberships.push("\u7EFF\u94BB");
      tier ?? (tier = "VIP");
    }
    if (Number(vip?.itwelve)) {
      memberships.push("\u8C6A\u534E\u97F3\u4E50\u5305");
      tier ?? (tier = "VIP");
    } else if (Number(vip?.ieight)) {
      memberships.push("\u97F3\u4E50\u5305");
      tier ?? (tier = "VIP");
    }
    this.profile = {
      id: uin || void 0,
      name: text(base?.nick) || void 0,
      avatarUrl: httpsUrl(base?.headurl),
      membership: {
        active: memberships.length > 0,
        label: memberships.join(" \xB7 ") || "\u666E\u901A\u8D26\u53F7",
        tier
      }
    };
  }
};
function decodeProviderText(value) {
  const raw = text(value).trim();
  if (!raw) return "";
  if (raw.includes("[00:") || raw.includes("[ti:")) return raw;
  try {
    const binary = globalThis.atob(raw);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes).trim();
  } catch {
    return "";
  }
}
var index_default = QQMusicAccountConnector;
export {
  QQMusicAccountConnector,
  index_default as default
};
