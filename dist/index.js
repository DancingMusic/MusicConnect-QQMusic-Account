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
function normalizeAccountId(value) {
  return text(value).replace(/\D/g, "");
}
function resolveQqAccountId(cookie) {
  const rawUin = Number(cookie.login_type) === 2 ? cookie.wxuin || cookie.uin || cookie.p_uin || "" : cookie.uin || cookie.qqmusic_uin || cookie.wxuin || cookie.p_uin || "";
  return normalizeAccountId(rawUin);
}
function qqCookieHasLogin(cookieText) {
  const cookie = parseCookieHeader(cookieText);
  const uin = resolveQqAccountId(cookie);
  const musicKey = cookie.qm_keyst || cookie.qqmusic_key || cookie.music_key || cookie.p_skey || cookie.skey || cookie.psrf_qqaccess_token || cookie.psrf_qqrefresh_token || cookie.wxrefresh_token || cookie.wxskey || "";
  return Boolean(uin && musicKey);
}
function qqCookieHasPlaybackLogin(cookieText) {
  const cookie = parseCookieHeader(cookieText);
  const uin = resolveQqAccountId(cookie);
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
  const file = asRecord(song.file);
  const requiresMembership = Number(pay?.pay_play ?? pay?.payplay ?? 0) > 0;
  const catalogMembership = requiresMembership || Number(pay?.pay_month ?? pay?.paymonth ?? 0) > 0;
  const tryBegin = Number(file?.try_begin ?? file?.trybegin ?? 0);
  const tryEnd = Number(file?.try_end ?? file?.tryend ?? 0);
  const trySize = Number(file?.size_try ?? file?.sizeTry ?? 0);
  const hasPreview = Number.isFinite(trySize) && trySize > 0;
  const explicitlyDisabled = Number(song.disabled ?? 0) > 0;
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
  const badges = catalogMembership ? [{ kind: "membership", label: "VIP", reason: "QQ \u97F3\u4E50\u4F1A\u5458\u76EE\u5F55\u6B4C\u66F2" }] : void 0;
  const entitlement = catalogMembership ? { kind: "subscription", state: requiresMembership ? "required" : "granted", tier: "VIP" } : void 0;
  const preview = hasPreview ? {
    available: true,
    ...Number.isFinite(tryBegin) && tryBegin >= 0 ? { startMs: tryBegin } : {},
    ...Number.isFinite(tryEnd) && tryEnd > 0 ? { endMs: tryEnd } : {}
  } : void 0;
  if (requiresMembership) {
    return {
      availability: "membership-required",
      requiredMembership: "VIP",
      label: "VIP",
      reason: "\u9700\u8981\u6709\u6548\u7684 QQ \u97F3\u4E50\u4F1A\u5458\u6743\u9650",
      badges,
      entitlement,
      preview
    };
  }
  if (!hasAnyAudioFile && hasPreview) {
    return {
      availability: "preview",
      label: "\u8BD5\u542C",
      reason: "\u5F53\u524D\u6B4C\u66F2\u4EC5\u63D0\u4F9B\u8BD5\u542C\u7247\u6BB5",
      badges: [{ kind: "trial", label: "\u8BD5\u542C" }],
      preview
    };
  }
  if (explicitlyDisabled || !hasAnyAudioFile) {
    return { availability: "unavailable", label: "\u4E0D\u53EF\u7528", reason: "QQ \u97F3\u4E50\u672A\u8FD4\u56DE\u53EF\u7528\u7684\u5B8C\u6574\u97F3\u9891\u6587\u4EF6" };
  }
  return {
    availability: "playable",
    ...catalogMembership ? {
      requiredMembership: "VIP",
      label: "VIP",
      reason: "\u5F53\u524D\u8D26\u53F7\u5DF2\u5177\u5907 QQ \u97F3\u4E50\u4F1A\u5458\u64AD\u653E\u6743\u9650",
      badges,
      entitlement
    } : {},
    ...preview ? { preview } : {}
  };
}
function findAccountRecord(data, accountId, mapKeys, listKeys) {
  if (!data || !accountId) return void 0;
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
  return void 0;
}
var MEMBERSHIP_FLAG_KEYS = [
  "HugeVip",
  "hugeVip",
  "iSuperVip",
  "isSuperVip",
  "superVip",
  "iVipFlag",
  "vipFlag",
  "itwelve",
  "iTwelve",
  "ieight",
  "iEight"
];
function accountMembership(value) {
  if (!value) return void 0;
  const sources = [value, asRecord(value.mVip), asRecord(value.vipInfo)].filter(Boolean);
  const hasKnownStatus = sources.some((source) => MEMBERSHIP_FLAG_KEYS.some((key) => Object.prototype.hasOwnProperty.call(source, key)));
  if (!hasKnownStatus) return void 0;
  const enabled = (...keys) => sources.some((source) => keys.some((key) => Number(source[key] ?? 0) > 0));
  const labels = [];
  let tier;
  if (enabled("HugeVip", "hugeVip")) {
    labels.push("\u8D85\u7EA7\u4F1A\u5458");
    tier = "SVIP";
  }
  if (enabled("iSuperVip", "isSuperVip", "superVip")) {
    labels.push("\u8C6A\u534E\u7EFF\u94BB");
    tier ?? (tier = "VIP");
  } else if (enabled("iVipFlag", "vipFlag")) {
    labels.push("\u7EFF\u94BB");
    tier ?? (tier = "VIP");
  }
  if (enabled("itwelve", "iTwelve")) {
    labels.push("\u8C6A\u534E\u97F3\u4E50\u5305");
    tier ?? (tier = "VIP");
  } else if (enabled("ieight", "iEight")) {
    labels.push("\u97F3\u4E50\u5305");
    tier ?? (tier = "VIP");
  }
  return {
    active: labels.length > 0,
    label: labels.join(" \xB7 ") || "\u666E\u901A\u8D26\u53F7",
    tier
  };
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
function officialSongReference(value) {
  const outer = asRecord(value);
  const song = asRecord(outer?.songInfo) ?? outer;
  const songId = Number(song?.id ?? song?.songid ?? song?.song_id);
  const songType = Number(song?.type ?? song?.songtype ?? song?.song_type ?? 0);
  if (!Number.isSafeInteger(songId) || songId <= 0 || !Number.isSafeInteger(songType) || songType < 0) return null;
  return { songId, songType };
}
function officialTrackList(response) {
  const envelope = asRecord(response.req_1);
  const data = asRecord(envelope?.data) ?? asRecord(response.data) ?? response;
  const body = asRecord(data.body);
  const song = asRecord(body?.song) ?? asRecord(data.song);
  const candidates = [
    data.songlist,
    data.song_list,
    data.trackList,
    data.track_list,
    data.list,
    data.tracks,
    song?.list
  ];
  const values = candidates.find(Array.isArray) ?? [];
  const total = Number(
    data.total_song_num ?? data.totalSongNum ?? data.total ?? data.song_count ?? song?.totalnum ?? song?.total ?? values.length
  );
  return { values, total: Number.isFinite(total) && total >= 0 ? total : values.length };
}
function confirmedBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === 0 || value === "0") return false;
  if (value === 1 || value === "1") return true;
  return void 0;
}
function favoriteMutationState(response) {
  const data = asRecord(asRecord(response.req_1)?.data) ?? asRecord(response.data) ?? response;
  const favorite = [
    response.favorite,
    response.liked,
    data.favorite,
    data.liked,
    data.isFavorite,
    data.is_favorite
  ].map(confirmedBoolean).find((value) => value !== void 0);
  if (favorite === void 0) return null;
  const changed = [response.changed, data.changed].map(confirmedBoolean).find((value) => value !== void 0);
  return { favorite, ...changed === void 0 ? {} : { changed } };
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
      version: "0.4.0",
      capabilities: [
        "search",
        "stream",
        "lyrics",
        "playlist",
        "login",
        "user-library",
        "favorites-read",
        "favorites-write",
        "recommendations"
      ]
    };
    this.cookie = "";
    this.host = null;
    this.profile = null;
    this.tracks = /* @__PURE__ */ new Map();
    this.mediaMids = /* @__PURE__ */ new Map();
    this.songReferences = /* @__PURE__ */ new Map();
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
    const list = this.rememberOfficialTracks(rawList);
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
    if (access?.availability === "copyright-restricted" || access?.availability === "region-restricted" || access?.availability === "unavailable") return null;
    if (access?.availability === "membership-required" && this.profile?.membership?.active === false) {
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
    const songs = this.rememberOfficialTracks(rawSongs);
    return { tracks: songs, total: Number(data?.total_song_num ?? songs.length), page, pageSize };
  }
  async listFavoriteTracks(query = {}) {
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Math.trunc(query.pageSize ?? 30)));
    const response = await this.official("qq.account.liked.list", { page, pageSize });
    const { values, total } = officialTrackList(response);
    const tracks = this.rememberOfficialTracks(values);
    return { tracks, total, page, pageSize, syncedAt: Date.now() };
  }
  async setTrackFavorite(trackId, favorite) {
    const mid = this.parseTrackId(trackId);
    if (!mid || !/^[A-Za-z0-9]+$/.test(mid)) throw new Error("INVALID_QQ_SONGMID");
    if (typeof favorite !== "boolean") throw new Error("INVALID_FAVORITE_STATE");
    const songReference = this.songReferences.get(`qq:${mid}`);
    const response = await this.official("qq.account.liked.set", {
      songmid: mid,
      ...songReference ?? {},
      favorite
    });
    const state = favoriteMutationState(response);
    if (!state || state.favorite !== favorite) {
      throw new Error("QQ_MUSIC_FAVORITE_STATE_UNCONFIRMED");
    }
    return {
      trackId: `qq:${mid}`,
      favorite: state.favorite,
      ...state.changed === void 0 ? {} : { changed: state.changed },
      syncedAt: Date.now()
    };
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
  rememberOfficialTracks(values) {
    const tracks = [];
    values.forEach((value) => {
      const track = toOfficialTrack(value);
      if (!track) return;
      tracks.push(track);
      this.tracks.set(track.id, track);
      const mediaMid = officialMediaMid(value);
      if (mediaMid) this.mediaMids.set(track.id, mediaMid);
      const songReference = officialSongReference(value);
      if (songReference) this.songReferences.set(track.id, songReference);
    });
    return tracks;
  }
  async official(operation, params = {}) {
    if (!this.cookie) throw new Error("QQ_MUSIC_LOGIN_REQUIRED");
    if (!this.host?.officialProviderRequest) throw new Error("QQ_MUSIC_OFFICIAL_PROVIDER_UNAVAILABLE");
    return this.host.officialProviderRequest(operation, params);
  }
  async refreshProfile() {
    const response = await this.official("qq.account.profile");
    const cookie = parseCookieHeader(this.cookie);
    const uin = resolveQqAccountId(cookie);
    const baseData = asRecord(asRecord(response.req_2)?.data);
    const base = findAccountRecord(baseData, uin, ["map_userinfo", "map_user_info", "userInfoMap"], ["vec_userinfo", "user_list"]);
    const vipData = asRecord(asRecord(response.req_1)?.data);
    const vip = findAccountRecord(vipData, uin, ["infoMap", "info_map", "vipInfoMap"], ["infoList", "vip_info_list"]);
    const membership = accountMembership(vip);
    const isWeChatLogin = Number(cookie.login_type) === 2;
    const avatarUrl = httpsUrl(base?.headurl ?? base?.head_url ?? base?.avatarUrl ?? base?.avatar) ?? (!isWeChatLogin && uin ? `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(uin)}&s=640` : void 0);
    this.profile = {
      id: uin || void 0,
      name: text(base?.nick ?? base?.nickname ?? base?.name) || void 0,
      avatarUrl,
      membership
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
