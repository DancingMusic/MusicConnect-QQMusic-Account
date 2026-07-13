import { afterEach, describe, expect, it, vi } from "vitest";
import { QQMusicAccountConnector } from "../index";

const VALID_COOKIE = "uin=123456; qm_keyst=account-session-secret";

describe("QQMusicAccountConnector", () => {
  afterEach(() => vi.restoreAllMocks());

  it("declares a distinct required account variant in the QQ Music family", () => {
    const connector = new QQMusicAccountConnector();
    expect(connector.meta).toMatchObject({
      id: "qq-music-account",
      familyId: "qq-music",
      variant: "account",
      authRequirement: "required",
      supportedHosts: ["desktop"],
      version: "0.3.0",
    });
    expect(connector.meta.capabilities).toEqual(expect.arrayContaining(["search", "stream", "lyrics", "playlist", "login", "recommendations"]));
    expect(connector.meta.configSchema).toBeUndefined();
  });

  it("starts official web QR login with desktop cookie capture metadata", async () => {
    const connector = new QQMusicAccountConnector();
    const result = await connector.login({ intent: "start" });
    expect(result.status).toBe("pending");
    expect(result.flow).toBe("browser");
    expect(result.flowId).toBe("qq-music-account-web-cookie");
    expect(result.nextPollMs).toBeUndefined();
    expect(result.actions?.[0]).toMatchObject({
      type: "open-url",
      url: "https://y.qq.com/n/ryqq/profile",
      cookieCapture: {
        provider: "qq-music",
        warmupUrl: "https://y.qq.com/n/ryqq/player",
      },
    });
  });

  it("rejects invalid captured cookies without returning a secret patch", async () => {
    const connector = new QQMusicAccountConnector();
    const result = await connector.login({
      intent: "continue",
      flowId: "qq-music-account-web-cookie",
      input: { cookie: "uin=123456" },
    });
    expect(result.status).toBe("error");
    expect(result.configPatch).toBeUndefined();
  });

  it("accepts a host-submitted cookie without echoing it in configPatch", async () => {
    const connector = new QQMusicAccountConnector();
    const result = await connector.login({
      intent: "continue",
      flowId: "qq-music-account-web-cookie",
      input: { cookie: VALID_COOKIE },
    });
    expect(result.status).toBe("authenticated");
    expect(result.configPatch).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("account-session-secret");
    expect((await connector.login({ intent: "status" })).status).toBe("authenticated");
  });

  it("restores status only from a valid host-injected runtime cookie", async () => {
    const connector = new QQMusicAccountConnector();
    await connector.init({ cookie: VALID_COOKIE });
    expect((await connector.login({ intent: "status" })).status).toBe("authenticated");
    await connector.init({ cookie: "uin=123456" });
    expect((await connector.login({ intent: "status" })).status).toBe("anonymous");
  });

  it("clears only in-memory state on logout and emits no secret patch", async () => {
    const connector = new QQMusicAccountConnector();
    await connector.init({ cookie: VALID_COOKIE });
    const result = await connector.login({ intent: "logout" });
    expect(result.status).toBe("anonymous");
    expect(result.configPatch).toBeUndefined();
    expect((await connector.login({ intent: "status" })).status).toBe("anonymous");
  });

  it("keeps the official browser flow pending when continue has no captured cookie", async () => {
    const connector = new QQMusicAccountConnector();
    const result = await connector.login({
      intent: "continue",
      flowId: "qq-music-account-web-cookie",
    });
    expect(result.status).toBe("pending");
    expect(result.actions?.[0]?.cookieCapture?.provider).toBe("qq-music");
  });

  it("loads online account profile and membership through the host operation", async () => {
    const officialProviderRequest = vi.fn(async (operation: string) => {
      expect(operation).toBe("qq.account.profile");
      return {
        req_1: { data: { infoMap: { "123456": { iSuperVip: 1 } } } },
        req_2: { data: { map_userinfo: { "123456": { nick: "Dancing QQ", headurl: "http://qlogo.cn/avatar.jpg" } } } },
      };
    });
    const connector = new QQMusicAccountConnector();
    await connector.init({ cookie: VALID_COOKIE }, { officialProviderRequest });
    const status = await connector.login({ intent: "status" });
    expect(status.user).toEqual({ id: "123456", name: "Dancing QQ", avatarUrl: "https://qlogo.cn/avatar.jpg" });
    expect(status.membership).toEqual(expect.objectContaining({ active: true, tier: "VIP", label: "豪华绿钻" }));
  });

  it("maps account playlists and their tracks without apiBaseUrl", async () => {
    const officialProviderRequest = vi.fn(async (operation: string) => {
      if (operation === "qq.account.profile") return { req_1: { data: {} }, req_2: { data: {} } };
      if (operation === "qq.account.playlists") return {
        req_1: { data: { v_playlist: [{ tid: 88, dirName: "我喜欢", picurl: "http://y.gtimg.cn/cover.jpg", song_cnt: 2 }] } },
      };
      if (operation === "qq.playlist.tracks") return {
        req_1: { data: { total_song_num: 1, songlist: [{ mid: "001abc", name: "测试歌", singer: [{ name: "歌手" }], album: { name: "专辑", mid: "002album" }, interval: 200 }] } },
      };
      throw new Error(`unexpected ${operation}`);
    });
    const connector = new QQMusicAccountConnector();
    await connector.init({ cookie: VALID_COOKIE }, { officialProviderRequest });
    const playlists = await connector.listPlaylists!();
    expect(playlists.playlists[0]).toMatchObject({ id: "qq-playlist:88", name: "我喜欢", coverUrl: "https://y.gtimg.cn/cover.jpg" });
    const tracks = await connector.getPlaylistTracks!(playlists.playlists[0].id);
    expect(tracks.tracks[0]).toMatchObject({ id: "qq:001abc", title: "测试歌", artist: "歌手" });
  });

  it("uses only reviewed host operation ids and never exposes the cookie", async () => {
    const officialProviderRequest = vi.fn(async () => ({ req_1: { data: { body: { song: { list: [] } }, meta: { sum: 0 } } } }));
    const connector = new QQMusicAccountConnector();
    await connector.init({ cookie: VALID_COOKIE }, { officialProviderRequest });
    await connector.search({ keyword: "周杰伦" });
    expect(officialProviderRequest).toHaveBeenLastCalledWith("qq.catalog.search", { query: "周杰伦", page: 1, pageSize: 30 });
    expect(JSON.stringify(officialProviderRequest.mock.calls)).not.toContain("account-session-secret");
  });

  it("passes media_mid and falls back to the first playable quality", async () => {
    const officialProviderRequest = vi.fn(async (operation: string, params?: Record<string, unknown>) => {
      if (operation === "qq.account.profile") return { req_1: { data: {} }, req_2: { data: {} } };
      if (operation === "qq.catalog.search") return {
        req_1: { data: { body: { song: { list: [{ mid: "001abc", name: "测试歌", file: { media_mid: "media001" } }] } } } },
      };
      if (operation === "qq.stream.resolve") {
        expect(params).toEqual({
          songmid: "001abc",
          mediaMid: "media001",
          requiresMembership: false,
          membershipActive: false,
        });
        return {
          req_0: { data: { sip: ["https://stream.qqmusic.qq.com/"], midurlinfo: [
            { filename: "F000media001.flac", purl: "" },
            { filename: "M500media001.mp3", purl: "M500media001.mp3?vkey=ok" },
          ] } },
        };
      }
      throw new Error(`unexpected ${operation}`);
    });
    const connector = new QQMusicAccountConnector();
    await connector.init({ cookie: VALID_COOKIE }, { officialProviderRequest });
    const result = await connector.search({ keyword: "测试" });
    await expect(connector.getStreamUrl(result.tracks[0].id)).resolves.toEqual({
      url: "https://stream.qqmusic.qq.com/M500media001.mp3?vkey=ok",
      format: "mp3",
    });
  });

  it("labels VIP tracks and blocks them for a non-member account", async () => {
    const officialProviderRequest = vi.fn(async (operation: string) => {
      if (operation === "qq.account.profile") return { req_1: { data: { infoMap: { "123456": {} } } }, req_2: { data: {} } };
      if (operation === "qq.catalog.search") return {
        req_1: { data: { body: { song: { list: [{ mid: "vip001", name: "会员歌曲", pay: { pay_play: 1 }, file: { media_mid: "vip-media" } }] } } } },
      };
      throw new Error(`unexpected ${operation}`);
    });
    const connector = new QQMusicAccountConnector();
    await connector.init({ cookie: VALID_COOKIE }, { officialProviderRequest });
    const result = await connector.search({ keyword: "会员歌曲" });
    expect(result.tracks[0]).toMatchObject({
      access: { availability: "membership-required", requiredMembership: "VIP", label: "VIP" },
    });
    await expect(connector.getStreamUrl(result.tracks[0].id)).rejects.toThrow("QQ_MUSIC_MEMBERSHIP_REQUIRED");
    expect(officialProviderRequest).not.toHaveBeenCalledWith("qq.stream.resolve", expect.anything());
  });

  it("passes active VIP permission into stream resolution", async () => {
    const officialProviderRequest = vi.fn(async (operation: string, params?: Record<string, unknown>) => {
      if (operation === "qq.account.profile") return {
        req_1: { data: { infoMap: { "123456": { iSuperVip: 1 } } } }, req_2: { data: {} },
      };
      if (operation === "qq.catalog.search") return {
        req_1: { data: { body: { song: { list: [{ mid: "vip001", name: "会员歌曲", pay: { pay_play: 1 }, file: { media_mid: "vip-media" } }] } } } },
      };
      if (operation === "qq.stream.resolve") {
        expect(params).toMatchObject({ requiresMembership: true, membershipActive: true });
        return { req_0: { data: { sip: ["https://stream.qqmusic.qq.com/"], midurlinfo: [{ purl: "F000vip.flac?vkey=ok" }] } } };
      }
      throw new Error(`unexpected ${operation}`);
    });
    const connector = new QQMusicAccountConnector();
    await connector.init({ cookie: VALID_COOKIE }, { officialProviderRequest });
    const result = await connector.search({ keyword: "会员歌曲" });
    await expect(connector.getStreamUrl(result.tracks[0].id)).resolves.toMatchObject({ format: "flac" });
  });

  it("loads and decodes lyrics through the reviewed host operation", async () => {
    const encoded = Buffer.from("[00:01.00]第一句\n[00:02.00]第二句", "utf8").toString("base64");
    const officialProviderRequest = vi.fn(async (operation: string, params?: Record<string, unknown>) => {
      if (operation === "qq.account.profile") return { req_1: { data: {} }, req_2: { data: {} } };
      if (operation === "qq.track.lyrics") {
        expect(params).toEqual({ songmid: "001abc" });
        return { req_1: { data: { lyric: encoded } } };
      }
      throw new Error(`unexpected ${operation}`);
    });
    const connector = new QQMusicAccountConnector();
    await connector.init({ cookie: VALID_COOKIE }, { officialProviderRequest });
    await expect(connector.getLyrics!("qq:001abc")).resolves.toEqual({ text: "[00:01.00]第一句\n[00:02.00]第二句" });
  });

  it("loads paged recommendations separately from account playlists", async () => {
    const officialProviderRequest = vi.fn(async (operation: string, params?: Record<string, unknown>) => {
      if (operation === "qq.account.profile") return { req_1: { data: {} }, req_2: { data: {} } };
      if (operation === "qq.recommend.playlists") {
        expect(params).toEqual({ page: 2, pageSize: 12 });
        return { req_1: { data: { total: 40, v_playlist: [{ content_id: "8899", title: "今日推荐", cover: "http://y.gtimg.cn/reco.jpg", song_num: 30 }] } } };
      }
      throw new Error(`unexpected ${operation}`);
    });
    const connector = new QQMusicAccountConnector();
    await connector.init({ cookie: VALID_COOKIE }, { officialProviderRequest });
    await expect(connector.listPlaylists!({ category: "recommendations", page: 2, pageSize: 12 })).resolves.toMatchObject({
      total: 40,
      page: 2,
      playlists: [{ id: "qq-playlist:8899", name: "今日推荐", trackCount: 30 }],
    });
  });
});
