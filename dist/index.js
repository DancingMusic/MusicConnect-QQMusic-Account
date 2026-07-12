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
function validateBaseUrl(value) {
  const url = new URL(value);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("QQ \u97F3\u4E50\u7F51\u5173\u5FC5\u987B\u4F7F\u7528 HTTPS\uFF1B\u672C\u5730\u5F00\u53D1\u4EC5\u5141\u8BB8 loopback HTTP");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("QQ \u97F3\u4E50\u7F51\u5173\u5730\u5740\u4E0D\u80FD\u5305\u542B\u5185\u5D4C\u51ED\u636E\u3001\u67E5\u8BE2\u53C2\u6570\u6216\u7247\u6BB5");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
}
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
function joinSinger(song) {
  return song.singer?.map((item) => item?.name).filter(Boolean).join(", ") || "";
}
function albumCover(mid) {
  return mid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${mid}.jpg` : void 0;
}
function toTrack(song) {
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
    updatedAt: ""
  };
}
function toPlaylist(playlist) {
  const id = String(playlist.dissid ?? playlist.disstid ?? "");
  return {
    id: `qq-playlist:${id}`,
    name: playlist.dissname || "Unknown",
    description: playlist.introduction,
    coverUrl: playlist.imgurl,
    trackCount: playlist.song_count ?? playlist.song_num,
    curator: playlist.creator?.name,
    externalUrl: id ? `https://y.qq.com/n/ryqq/playlist/${id}` : void 0
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
      description: "QQ Music account login through the official web page with a credential-free catalog gateway",
      version: "0.1.0",
      capabilities: ["search", "stream", "playlist", "login"],
      configSchema: [{
        key: "apiBaseUrl",
        label: "QQ Music API \u7AEF\u70B9",
        type: "url",
        required: false,
        placeholder: "https://your-qqmusic-gateway.example.com",
        help: "\u53EF\u9009\u7684\u65E0\u51ED\u636E\u76EE\u5F55\u7F51\u5173\u3002\u8D26\u53F7 Cookie \u4E0D\u4F1A\u53D1\u9001\u5230\u6B64\u5730\u5740\u3002"
      }]
    };
    this.baseUrl = "";
    this.cookie = "";
  }
  async init(config) {
    const typed = config;
    const configuredUrl = (typed?.apiBaseUrl || "").trim();
    this.baseUrl = configuredUrl ? validateBaseUrl(configuredUrl) : "";
    this.cookie = typeof typed?.cookie === "string" && qqCookieHasLogin(typed.cookie) ? typed.cookie : "";
  }
  async login(request = { intent: "status" }) {
    const intent = request.intent ?? "status";
    if (intent === "status") {
      return this.cookie ? { status: "authenticated", message: "QQ \u97F3\u4E50\u8D26\u53F7\u4F1A\u8BDD\u53EF\u7528" } : { status: "anonymous", message: "\u672A\u767B\u5F55 QQ \u97F3\u4E50" };
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
      return {
        status: "authenticated",
        message: qqCookieHasPlaybackLogin(submittedCookie) ? "QQ \u97F3\u4E50\u767B\u5F55\u6210\u529F" : "QQ \u97F3\u4E50\u767B\u5F55\u6210\u529F\uFF1B\u5982\u90E8\u5206\u6B4C\u66F2\u65E0\u6CD5\u64AD\u653E\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55\u4EE5\u8865\u5168\u64AD\u653E\u4F1A\u8BDD"
      };
    }
    return this.startWebLogin();
  }
  async search(query) {
    const keyword = (query.keyword || "").trim();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    if (!keyword || !this.baseUrl) return { tracks: [], total: 0, page, pageSize };
    const data = await this.request("/search", { key: keyword, pageNo: page, pageSize });
    const list = data.data?.list ?? data.data?.song?.list ?? [];
    return { tracks: list.map(toTrack), total: data.data?.total ?? data.data?.song?.totalnum ?? list.length, page, pageSize };
  }
  async getTrack(trackId) {
    const mid = this.parseTrackId(trackId);
    if (!mid || !this.baseUrl) return null;
    const data = await this.request("/song", { songmid: mid });
    const song = Array.isArray(data.data) ? data.data[0] : data.data;
    return song ? toTrack(song) : null;
  }
  async getStreamUrl(trackId) {
    const mid = this.parseTrackId(trackId);
    if (!mid || !this.baseUrl) return null;
    const data = await this.request("/song/url", { id: mid });
    const url = typeof data.data === "string" ? data.data : data.data?.playUrl?.[mid];
    return url ? { url, format: "mp3" } : null;
  }
  async listPlaylists(query = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    if (!this.baseUrl) return { playlists: [], total: 0, page, pageSize };
    const data = await this.request("/top/playlist", {
      pageNo: page,
      pageSize,
      sortId: query.sort === "new" ? 2 : 5,
      ...query.category ? { categoryId: query.category } : {}
    });
    const list = data.data?.list ?? [];
    return { playlists: list.map(toPlaylist), total: data.data?.total ?? list.length, page, pageSize };
  }
  async getPlaylistTracks(playlistId, opts = {}) {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 30;
    const id = this.parsePlaylistId(playlistId);
    if (!id || !this.baseUrl) return { tracks: [], total: 0, page, pageSize };
    const data = await this.request("/playlist", { id });
    const songs = data.data?.songlist ?? [];
    return { tracks: songs.map(toTrack), total: songs.length, page, pageSize };
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
  async request(path, params = {}) {
    const url = new URL(path, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15e3)
    });
    if (!response.ok) throw new Error(`QQ Music API failed: ${response.status} ${response.statusText}`);
    return response.json();
  }
};
var index_default = QQMusicAccountConnector;
export {
  QQMusicAccountConnector,
  index_default as default
};
