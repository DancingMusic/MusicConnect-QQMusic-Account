import { afterEach, describe, expect, it, vi } from "vitest";
import { QQMusicAccountConnector } from "../index";

const BASE = "https://mock-qq.test";
const VALID_COOKIE = "uin=123456; qm_keyst=account-session-secret";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

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
      version: "0.1.0",
    });
    expect(connector.meta.capabilities).toEqual(expect.arrayContaining(["search", "stream", "playlist", "login"]));
    expect(connector.meta.configSchema?.map(field => field.key)).toEqual(["apiBaseUrl"]);
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

  it("requires a credential-free HTTPS gateway except on loopback", async () => {
    const connector = new QQMusicAccountConnector();
    await expect(connector.init({ apiBaseUrl: "http://gateway.example.com" })).rejects.toThrow("HTTPS");
    await expect(connector.init({ apiBaseUrl: "https://user:secret@gateway.example.com" })).rejects.toThrow("内嵌凭据");
    await expect(connector.init({ apiBaseUrl: "https://gateway.example.com?cookie=secret" })).rejects.toThrow("查询参数");
    await expect(connector.init({ apiBaseUrl: "http://127.0.0.1:3400" })).resolves.toBeUndefined();
  });

  it("returns empty catalog results when no gateway is configured", async () => {
    const connector = new QQMusicAccountConnector();
    await connector.init({ cookie: VALID_COOKIE });
    expect(await connector.search({ keyword: "周杰伦" })).toMatchObject({ tracks: [], total: 0 });
    expect(await connector.getTrack("qq:track")).toBeNull();
    expect(await connector.getStreamUrl("qq:track")).toBeNull();
  });

  it("maps credential-free gateway search results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      data: {
        list: [{
          songmid: "001fakp82WoZ8u",
          songname: "晴天",
          singer: [{ name: "周杰伦" }],
          albumname: "叶惠美",
          albummid: "002Neh8l0RxIPZ",
          interval: 269,
        }],
        total: 1,
      },
    }));
    const connector = new QQMusicAccountConnector();
    await connector.init({ apiBaseUrl: BASE, cookie: VALID_COOKIE });
    const result = await connector.search({ keyword: "周杰伦", pageSize: 10 });
    expect(result.tracks[0]).toMatchObject({
      id: "qq:001fakp82WoZ8u",
      title: "晴天",
      artist: "周杰伦",
      album: "叶惠美",
      durationSec: 269,
    });
  });

  it("never forwards the account cookie to the configurable gateway", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      requestUrl = typeof input === "string" ? input : input.toString();
      requestInit = init;
      return Promise.resolve(jsonResponse({ data: { list: [], total: 0 } }));
    });
    const connector = new QQMusicAccountConnector();
    await connector.init({ apiBaseUrl: BASE, cookie: VALID_COOKIE });
    await connector.search({ keyword: "周杰伦" });

    expect(requestUrl).toContain("key=%E5%91%A8%E6%9D%B0%E4%BC%A6");
    expect(requestUrl).not.toContain("cookie");
    expect(requestUrl).not.toContain("account-session-secret");
    expect(JSON.stringify(requestInit)).not.toContain("account-session-secret");
    expect(requestInit?.headers).toEqual({ Accept: "application/json" });
  });
});
