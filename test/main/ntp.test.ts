import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeSocket extends EventEmitter {
  send = vi.fn();
  close = vi.fn();
}

const mocks = vi.hoisted(() => ({
  sockets: [] as FakeSocket[],
  createSocket: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock("dgram", () => ({ createSocket: mocks.createSocket }));
vi.mock("dns", () => ({ promises: { lookup: mocks.lookup } }));

import { createNtpSync, intervalMs, queryNtp } from "@/main/ntp";

const NTP_EPOCH_OFFSET_S = 2208988800;
const T1 = 1_700_000_000_000;

const writeTimestamp = (buf: Buffer, offset: number, ms: number): void => {
  const secs = Math.floor(ms / 1000);
  buf.writeUInt32BE(secs + NTP_EPOCH_OFFSET_S, offset);
  buf.writeUInt32BE(Math.round(((ms - secs * 1000) / 1000) * 2 ** 32), offset + 4);
};

const response = (t2: number, t3: number, stratum = 2): Buffer => {
  const buf = Buffer.alloc(48);
  buf[0] = 0x24;
  buf[1] = stratum;
  writeTimestamp(buf, 32, t2);
  writeTimestamp(buf, 40, t3);
  return buf;
};

const tick = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const lastSocket = (): FakeSocket => mocks.sockets[mocks.sockets.length - 1];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T1);
  mocks.sockets.length = 0;
  mocks.createSocket.mockReset().mockImplementation(() => {
    const s = new FakeSocket();
    mocks.sockets.push(s);
    return s;
  });
  mocks.lookup.mockReset().mockResolvedValue({ address: "192.0.2.1", family: 4 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("queryNtp", () => {
  it("サーバーのタイムスタンプからずれと往復時間を計算する", async () => {
    const p = queryNtp("ntp.example");
    await tick();
    expect(mocks.lookup).toHaveBeenCalledWith("ntp.example");
    expect(mocks.createSocket).toHaveBeenCalledWith("udp4");
    const sock = lastSocket();
    const [req, port, address] = sock.send.mock.calls[0];
    expect(req).toHaveLength(48);
    expect(req[0]).toBe(0x23);
    expect(port).toBe(123);
    expect(address).toBe("192.0.2.1");
    sock.send.mock.calls[0][3](null); // successful send: no-op

    // Server clock is 1000 ms ahead; 50 ms one-way latency, 10 ms processing.
    vi.setSystemTime(T1 + 110);
    sock.emit("message", response(T1 + 1050, T1 + 1060));
    const r = await p;
    expect(r.offset).toBeCloseTo((1050 + (1060 - 110)) / 2, 3);
    expect(r.rtt).toBeCloseTo(110 - 10, 3);
    expect(sock.close).toHaveBeenCalledTimes(1);
  });

  it("IPv6アドレスにはudp6を使う", async () => {
    mocks.lookup.mockResolvedValue({ address: "2001:db8::1", family: 6 });
    const p = queryNtp("ntp6.example");
    await tick();
    expect(mocks.createSocket).toHaveBeenCalledWith("udp6");
    lastSocket().emit("message", response(T1, T1));
    await expect(p).resolves.toEqual({ offset: 0, rtt: 0 });
  });

  it("タイムアウトで失敗し、遅れた応答は無視する", async () => {
    const p = queryNtp("ntp.example", 1000);
    const assertion = expect(p).rejects.toThrow("タイムアウト");
    await tick();
    vi.advanceTimersByTime(1000);
    await assertion;
    const sock = lastSocket();
    sock.emit("message", response(T1, T1));
    sock.emit("error", new Error("late"));
    expect(sock.close).toHaveBeenCalledTimes(1);
  });

  it("既定のタイムアウトは5秒", async () => {
    const p = queryNtp("ntp.example");
    const assertion = expect(p).rejects.toThrow("タイムアウト");
    await tick();
    vi.advanceTimersByTime(4999);
    expect(lastSocket().close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await assertion;
  });

  it("短すぎるパケットは失敗にする", async () => {
    const p = queryNtp("ntp.example");
    await tick();
    lastSocket().emit("message", Buffer.alloc(47));
    await expect(p).rejects.toThrow("不正な応答");
  });

  it("Kiss-o'-Death（stratum 0）は失敗にする", async () => {
    const p = queryNtp("ntp.example");
    await tick();
    lastSocket().emit("message", response(T1, T1, 0));
    await expect(p).rejects.toThrow("サーバに拒否されました");
  });

  it("ソケットのエラーで失敗にする", async () => {
    const p = queryNtp("ntp.example");
    await tick();
    const err = new Error("ECONNREFUSED");
    lastSocket().emit("error", err);
    await expect(p).rejects.toBe(err);
    expect(lastSocket().close).toHaveBeenCalledTimes(1);
  });

  it("送信に失敗したら失敗にし、タイムアウトを解除する", async () => {
    const p = queryNtp("ntp.example");
    await tick();
    const err = new Error("send failed");
    lastSocket().send.mock.calls[0][3](err);
    await expect(p).rejects.toBe(err);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("DNSの名前解決に失敗したら失敗にする", async () => {
    mocks.lookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(queryNtp("nope")).rejects.toThrow("ENOTFOUND");
    expect(mocks.createSocket).not.toHaveBeenCalled();
  });
});

interface Deferred {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

const deferLookup = (): Deferred => {
  const d = {} as Deferred;
  mocks.lookup.mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        d.resolve = resolve;
        d.reject = reject;
      }),
  );
  return d;
};

const cfg = (over: Partial<{ enabled: boolean; server: string; intervalMin: number }> = {}) => ({
  enabled: true,
  server: "ntp.example",
  intervalMin: 60,
  ...over,
});

/** Lets a pending sync reach the socket and answers with the given offset. */
const answer = async (offsetMs: number): Promise<void> => {
  await tick();
  lastSocket().emit("message", response(T1 + offsetMs, T1 + offsetMs));
  await tick();
};

describe("NtpSync", () => {
  it("無効な状態で始まる", () => {
    const sync = createNtpSync(vi.fn());
    expect(sync.status).toMatchObject({ enabled: false, offsetMs: 0, lastSync: null, syncing: false });
  });

  it("有効にするとすぐ同期し、次の同期を間隔どおりに予約する", async () => {
    const onChange = vi.fn();
    const sync = createNtpSync(onChange);
    sync.configure(cfg({ intervalMin: 10 }));
    expect(sync.status).toMatchObject({ enabled: true, server: "ntp.example", syncing: true, error: null });
    await answer(500);
    expect(sync.status).toMatchObject({ offsetMs: 500, rttMs: 0, lastSync: T1, error: null, syncing: false });
    expect(onChange).toHaveBeenLastCalledWith(sync.status);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10 * 60_000 - 1);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(sync.status.syncing).toBe(true);
  });

  it("同じ設定なら何もしない", async () => {
    const onChange = vi.fn();
    const sync = createNtpSync(onChange);
    sync.configure(cfg());
    await answer(0);
    onChange.mockClear();
    sync.configure(cfg());
    expect(onChange).not.toHaveBeenCalled();
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });

  it("間隔だけが変わった場合は予約し直すだけにする", async () => {
    const sync = createNtpSync(vi.fn());
    sync.configure(cfg({ intervalMin: 60 }));
    await answer(0);
    sync.configure(cfg({ intervalMin: 2 }));
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    expect(sync.status.syncing).toBe(false);
    vi.advanceTimersByTime(2 * 60_000);
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
  });

  it("1分未満の間隔は1分にする", async () => {
    const sync = createNtpSync(vi.fn());
    sync.configure(cfg({ intervalMin: 0 }));
    await answer(0);
    vi.advanceTimersByTime(60_000 - 1);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
  });

  it("未設定なら間隔を60分にする", () => {
    expect(intervalMs(null)).toBe(60 * 60_000);
  });

  it("設定変更の判定ではenabled/server/intervalMinだけを比べる", async () => {
    const onChange = vi.fn();
    const sync = createNtpSync(onChange);
    sync.configure(cfg());
    await answer(0);
    onChange.mockClear();
    sync.configure({ ...cfg(), extra: 1 } as any);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("サーバーが変わったら同期し直す", async () => {
    const sync = createNtpSync(vi.fn());
    sync.configure(cfg());
    await answer(0);
    sync.configure(cfg({ server: "other.example" }));
    expect(sync.status.server).toBe("other.example");
    expect(mocks.lookup).toHaveBeenLastCalledWith("other.example");
  });

  it("無効にしたら状態を初期化して同期を止める", async () => {
    const sync = createNtpSync(vi.fn());
    sync.configure(cfg());
    await answer(300);
    sync.configure(cfg({ enabled: false }));
    expect(sync.status).toEqual({
      enabled: false,
      server: "ntp.example",
      offsetMs: 0,
      rttMs: null,
      lastSync: null,
      error: null,
      syncing: false,
    });
    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });

  it("同じサーバーで再び有効にしたら同期する", async () => {
    const sync = createNtpSync(vi.fn());
    sync.configure(cfg({ enabled: false }));
    expect(mocks.lookup).not.toHaveBeenCalled();
    sync.configure(cfg());
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });

  it("無効なときのsyncNowは同期せず現在の状態を返す", async () => {
    const sync = createNtpSync(vi.fn());
    await expect(sync.syncNow()).resolves.toBe(sync.status);
    sync.configure(cfg({ enabled: false }));
    await expect(sync.syncNow()).resolves.toBe(sync.status);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("エラーを記録し、min(5分, 間隔)後に再試行する", async () => {
    mocks.lookup.mockRejectedValue(new Error("ENOTFOUND"));
    const sync = createNtpSync(vi.fn());
    sync.configure(cfg({ intervalMin: 60 }));
    await tick();
    expect(sync.status).toMatchObject({ error: "ENOTFOUND", syncing: false });
    vi.advanceTimersByTime(5 * 60_000 - 1);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
  });

  it("間隔が5分より短ければその間隔で再試行する", async () => {
    mocks.lookup.mockRejectedValue(new Error("x"));
    const sync = createNtpSync(vi.fn());
    sync.configure(cfg({ intervalMin: 2 }));
    await tick();
    vi.advanceTimersByTime(2 * 60_000);
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
  });

  it("Error以外の失敗理由は文字列にする", async () => {
    mocks.lookup.mockRejectedValue("boom");
    const sync = createNtpSync(vi.fn());
    sync.configure(cfg());
    await tick();
    expect(sync.status.error).toBe("boom");
  });

  it("同期に成功したら前回のエラーを消す", async () => {
    mocks.lookup.mockRejectedValueOnce(new Error("first"));
    const sync = createNtpSync(vi.fn());
    sync.configure(cfg());
    await tick();
    expect(sync.status.error).toBe("first");
    const p = sync.syncNow();
    await answer(0);
    await expect(p).resolves.toMatchObject({ error: null, lastSync: T1 });
  });

  it("同期中に設定が変わったら成功結果を捨てる", async () => {
    deferLookup(); // sync started by configure(a): never settles
    const sync = createNtpSync(vi.fn());
    sync.configure(cfg({ server: "a.example" }));
    const manual = deferLookup();
    const pending = sync.syncNow();
    const latest = deferLookup();
    sync.configure(cfg({ server: "b.example" }));

    manual.resolve({ address: "192.0.2.1", family: 4 });
    await answer(999);
    await expect(pending).resolves.toBe(sync.status);
    expect(sync.status).toMatchObject({ server: "b.example", offsetMs: 0, lastSync: null, syncing: true });
    expect(vi.getTimerCount()).toBe(0); // the stale result did not schedule anything

    latest.reject(new Error("current failure"));
    await tick();
    expect(sync.status.error).toBe("current failure");
  });

  it("同期中に設定が変わったら失敗結果を捨てる", async () => {
    const first = deferLookup();
    const sync = createNtpSync(vi.fn());
    sync.configure(cfg({ server: "a.example" }));
    deferLookup();
    sync.configure(cfg({ server: "b.example" }));
    const statusBefore = sync.status;

    first.reject(new Error("stale failure"));
    await tick();
    expect(sync.status).toBe(statusBefore);
    expect(sync.status.error).toBeNull();
  });
});
