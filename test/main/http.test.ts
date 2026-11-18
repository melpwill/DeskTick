import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeRequest extends EventEmitter {
  followRedirect = vi.fn();
  abort = vi.fn();
  end = vi.fn();
}

class FakeResponse extends EventEmitter {
  constructor(
    public statusCode: number,
    public headers: Record<string, string | string[]> = {},
  ) {
    super();
  }
}

const electron = vi.hoisted(() => ({
  net: { request: vi.fn() },
}));
vi.mock("electron", () => electron);

import { httpErrorText, httpGet, type HttpGetOptions } from "@/main/http";

const API = "https://api.github.com/repos/melpwill/DeskTick/releases/latest";
const OPTS: HttpGetOptions = { maxBytes: 10, accept: "application/json", timeoutMs: 1000 };

let req: FakeRequest;

beforeEach(() => {
  req = new FakeRequest();
  electron.net.request.mockReturnValue(req);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * @description - 応答を返す
 * @param {FakeResponse} res - 応答
 * @return {FakeResponse} - 応答
 */
const respond = (res: FakeResponse): FakeResponse => {
  req.emit("response", res);
  return res;
};

describe("httpErrorText", () => {
  it("アクセス制限とそれ以外を分けて説明する", () => {
    expect(httpErrorText(403)).toContain("制限");
    expect(httpErrorText(429)).toContain("制限");
    expect(httpErrorText(500)).toBe("サーバーがエラーを返しました (HTTP 500)");
  });
});

describe("httpGet", () => {
  it("Cookieを送らず、転送は手動で扱う設定でGETする", async () => {
    const p = httpGet(API, OPTS);
    expect(electron.net.request).toHaveBeenCalledWith({
      url: API,
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      useSessionCookies: false,
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "DeskTick-Updater" },
    });
    expect(req.end).toHaveBeenCalled();
    const res = respond(new FakeResponse(200, { "content-length": "5" }));
    res.emit("data", Buffer.from("ab"));
    res.emit("data", Buffer.from("cde"));
    res.emit("end");
    await expect(p).resolves.toEqual(Buffer.from("abcde"));
    expect(req.abort).not.toHaveBeenCalled();
  });

  it("受信したバイト数を知らせる", async () => {
    const onProgress = vi.fn();
    const p = httpGet(API, { ...OPTS, onProgress });
    const res = respond(new FakeResponse(200));
    res.emit("data", Buffer.from("ab"));
    res.emit("data", Buffer.from("c"));
    res.emit("end");
    await p;
    expect(onProgress.mock.calls).toEqual([[2], [3]]);
  });

  it("許可していないURLには接続しない", async () => {
    await expect(httpGet("https://evil.example/x", OPTS)).rejects.toThrow("許可されていないURLです");
    expect(electron.net.request).not.toHaveBeenCalled();
  });

  it("許可したホストへの転送だけをたどる", async () => {
    const p = httpGet(API, OPTS);
    req.emit("redirect", 302, "GET", "https://objects.githubusercontent.com/x");
    expect(req.followRedirect).toHaveBeenCalledTimes(1);
    req.emit("redirect", 302, "GET", "https://evil.example/x");
    await expect(p).rejects.toThrow("許可されていない転送先です: https://evil.example/x");
    expect(req.followRedirect).toHaveBeenCalledTimes(1);
    expect(req.abort).toHaveBeenCalled();
  });

  it("転送が多すぎたら中断する", async () => {
    const p = httpGet(API, OPTS);
    for (let i = 0; i < 6; i++) req.emit("redirect", 302, "GET", "https://github.com/x");
    await expect(p).rejects.toThrow("転送が多すぎます");
    expect(req.followRedirect).toHaveBeenCalledTimes(5);
  });

  it("200以外の応答は失敗にする", async () => {
    const p = httpGet(API, OPTS);
    respond(new FakeResponse(404));
    await expect(p).rejects.toThrow("HTTP 404");
  });

  it("Content-Lengthが上限を超えていたら受信しない", async () => {
    const p = httpGet(API, OPTS);
    respond(new FakeResponse(200, { "content-length": ["11"] }));
    await expect(p).rejects.toThrow("想定より大きなファイルです");
  });

  it("受信したデータが上限を超えたら中断し、以降のデータは無視する", async () => {
    const onProgress = vi.fn();
    const p = httpGet(API, { ...OPTS, onProgress });
    const res = respond(new FakeResponse(200));
    res.emit("data", Buffer.alloc(8));
    res.emit("data", Buffer.alloc(3));
    res.emit("data", Buffer.alloc(1));
    res.emit("end");
    await expect(p).rejects.toThrow("想定より大きなファイルです");
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(req.abort).toHaveBeenCalledTimes(1);
  });

  it("応答の中断とエラーを失敗にする", async () => {
    const p1 = httpGet(API, OPTS);
    respond(new FakeResponse(200)).emit("aborted");
    await expect(p1).rejects.toThrow("通信が中断されました");

    req = new FakeRequest();
    electron.net.request.mockReturnValue(req);
    const p2 = httpGet(API, OPTS);
    respond(new FakeResponse(200)).emit("error", new Error("reset"));
    await expect(p2).rejects.toThrow("reset");
  });

  it("リクエストのエラーを失敗にする", async () => {
    const p = httpGet(API, OPTS);
    req.emit("error", new Error("net::ERR_PROXY_CONNECTION_FAILED"));
    await expect(p).rejects.toThrow("net::ERR_PROXY_CONNECTION_FAILED");
  });

  it("時間内に終わらなければ中断する", async () => {
    vi.useFakeTimers();
    const p = httpGet(API, OPTS);
    const assertion = expect(p).rejects.toThrow("通信がタイムアウトしました");
    vi.advanceTimersByTime(1000);
    await assertion;
    expect(req.abort).toHaveBeenCalled();
  });
});
