import { generateKeyPairSync, sign } from "crypto";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { LATEST_RELEASE_API, RELEASES_PAGE } from "@/main/githubRelease";
import { type HttpGetOptions } from "@/main/http";
import { MANIFEST_NAME, sha256Hex, SIGNATURE_NAME } from "@/main/updateManifest";
import {
  CHECK_INTERVAL_MS,
  createUpdater,
  DEV_BLOCKED,
  FIRST_CHECK_DELAY_MS,
  NO_WRITE_BLOCKED,
  RETRY_INTERVAL_MS,
  TICK_MS,
  type UpdateFiles,
  type Updater,
  type UpdaterOptions,
} from "@/main/updater";
import { type UpdateSettings } from "@/shared/settings";
import { type UpdateStatus } from "@/shared/types";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUB = publicKey.export({ format: "der", type: "spki" }).toString("base64");
const EXE_PATH = "C:/app/DeskTick.exe";
const NEW_EXE = Buffer.from("new DeskTick.exe");
const DL = `${RELEASES_PAGE}/download/v1.3.0`;

type Route = Uint8Array | Error;

let routes: Map<string, Route>;
let get: Mock<(url: string, opts: HttpGetOptions) => Promise<Uint8Array>>;
let files: { [K in keyof UpdateFiles]: Mock<UpdateFiles[K]> };
let settings: UpdateSettings;
let onStatus: Mock<(s: UpdateStatus) => void>;
let notify: Mock<(title: string, body: string) => void>;

const manifestBytes = (patch: Record<string, unknown> = {}): Buffer =>
  Buffer.from(
    JSON.stringify({
      product: "DeskTick",
      version: "1.3.0",
      file: "DeskTick.exe",
      size: NEW_EXE.length,
      sha256: sha256Hex(NEW_EXE),
      ...patch,
    }),
  );

const sigOf = (data: Uint8Array): Buffer => Buffer.from(sign(null, data, privateKey).toString("base64"));

const asset = (name: string, size: number): Record<string, unknown> => ({
  name,
  browser_download_url: `${DL}/${name}`,
  size,
});

/**
 * @description - 偽のGitHubに最新リリースを置く
 * @param {object} o - リリースの内容
 * @return {void} - なし
 */
const publish = (
  o: { tag?: string; manifest?: Buffer; sig?: Buffer; exe?: Buffer; exeSize?: number; omit?: string[] } = {},
): void => {
  const manifest = o.manifest ?? manifestBytes();
  const exe = o.exe ?? NEW_EXE;
  const all = [
    asset("DeskTick.exe", o.exeSize ?? NEW_EXE.length),
    asset(MANIFEST_NAME, manifest.length),
    asset(SIGNATURE_NAME, 100),
  ].filter((a) => !o.omit?.includes(a.name as string));
  routes.set(
    LATEST_RELEASE_API,
    Buffer.from(
      JSON.stringify({
        tag_name: o.tag ?? "v1.3.0",
        draft: false,
        prerelease: false,
        html_url: `${RELEASES_PAGE}/tag/${o.tag ?? "v1.3.0"}`,
        assets: all,
      }),
    ),
  );
  routes.set(`${DL}/${MANIFEST_NAME}`, manifest);
  routes.set(`${DL}/${SIGNATURE_NAME}`, o.sig ?? sigOf(manifest));
  routes.set(`${DL}/DeskTick.exe`, exe);
};

const make = (patch: Partial<UpdaterOptions> = {}): Updater =>
  createUpdater({
    productName: "DeskTick",
    currentVersion: "1.2.0",
    exePath: EXE_PATH,
    publicKeys: [PUB],
    files,
    get,
    settings: () => settings,
    now: () => Date.now(),
    onStatus,
    notify,
    ...patch,
  });

const apiCalls = (): number => get.mock.calls.filter(([url]) => url === LATEST_RELEASE_API).length;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 15, 9, 0));
  routes = new Map();
  get = vi.fn(async (url: string, opts: HttpGetOptions) => {
    const r = routes.get(url);
    if (r === undefined) throw new Error(`404 ${url}`);
    if (r instanceof Error) throw r;
    opts.onProgress?.(Math.floor(r.length / 2));
    opts.onProgress?.(Math.floor(r.length / 2));
    opts.onProgress?.(r.length);
    return r;
  });
  files = {
    canWrite: vi.fn(async () => true),
    stage: vi.fn(async (exe: string) => `${exe}.new`),
    swap: vi.fn(async () => undefined),
    cleanup: vi.fn(async () => undefined),
  };
  settings = { mode: "notify", notify: true, skipVersion: "" };
  onStatus = vi.fn();
  notify = vi.fn();
  publish();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("initial status", () => {
  it("まだ確認していない状態から始まる", () => {
    expect(make().status).toEqual({
      state: "idle",
      currentVersion: "1.2.0",
      latestVersion: null,
      releaseUrl: RELEASES_PAGE,
      progress: null,
      error: null,
      lastChecked: null,
      installBlocked: null,
    });
  });

  it("exeのパスがなければ差し替えられない理由を示す", () => {
    expect(make({ exePath: null }).status.installBlocked).toBe(DEV_BLOCKED);
  });
});

describe("check", () => {
  it("同じバージョンなら最新とする", async () => {
    publish({ tag: "v1.2.0", manifest: manifestBytes({ version: "1.2.0" }) });
    const u = make();
    const s = await u.check();
    expect(s).toMatchObject({
      state: "latest",
      latestVersion: null,
      releaseUrl: `${RELEASES_PAGE}/tag/v1.2.0`,
      lastChecked: Date.now(),
    });
    expect(onStatus.mock.calls.map(([x]) => x.state)).toEqual(["checking", "latest"]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(LATEST_RELEASE_API, {
      maxBytes: 1024 * 1024,
      accept: "application/vnd.github+json",
      timeoutMs: 15_000,
    });
  });

  it("新しいバージョンは署名を確かめてから知らせる", async () => {
    const s = await make().check();
    expect(s).toMatchObject({ state: "available", latestVersion: "1.3.0", error: null, installBlocked: null });
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      LATEST_RELEASE_API,
      `${DL}/${MANIFEST_NAME}`,
      `${DL}/${SIGNATURE_NAME}`,
    ]);
    expect(files.canWrite).toHaveBeenCalledWith(EXE_PATH);
    expect(notify).not.toHaveBeenCalled();
  });

  it("書き込めない場所なら、見つけた時点で差し替えられない理由を示す", async () => {
    files.canWrite.mockResolvedValue(false);
    const s = await make().check();
    expect(s).toMatchObject({ state: "available", installBlocked: NO_WRITE_BLOCKED });
  });

  it.each([
    [
      "リリース情報がJSONでない",
      () => routes.set(LATEST_RELEASE_API, Buffer.from("<html>")),
      "リリース情報を読み取れませんでした",
    ],
    ["マニフェストがない", () => publish({ omit: [MANIFEST_NAME] }), `リリースに${MANIFEST_NAME}がありません`],
    ["署名がない", () => publish({ omit: [SIGNATURE_NAME] }), `リリースに${SIGNATURE_NAME}がありません`],
    [
      "署名が別の鍵",
      () =>
        publish({
          sig: Buffer.from(sign(null, manifestBytes(), generateKeyPairSync("ed25519").privateKey).toString("base64")),
        }),
      "署名を確認できませんでした",
    ],
    [
      "マニフェストが改ざんされている",
      () => publish({ manifest: manifestBytes({ size: 1 }), sig: sigOf(manifestBytes()) }),
      "署名を確認できませんでした",
    ],
    [
      "マニフェストの版がタグと違う",
      () => publish({ manifest: manifestBytes({ version: "1.4.0" }) }),
      "リリースと一致しません",
    ],
    ["マニフェストの形式が不正", () => publish({ manifest: manifestBytes({ sha256: "x" }) }), "リリースと一致しません"],
    ["exeがない", () => publish({ omit: ["DeskTick.exe"] }), "リリースにDeskTick.exeがありません"],
    ["exeの大きさがマニフェストと違う", () => publish({ exeSize: 999 }), "リリースと一致しません"],
    ["通信に失敗した", () => routes.set(LATEST_RELEASE_API, new Error("offline")), "offline"],
    ["文字列が投げられた", () => get.mockRejectedValueOnce("boom"), "boom"],
  ])("%sときは失敗にする", async (_name, setup, error) => {
    setup();
    const s = await make().check();
    expect(s.state).toBe("error");
    expect(s.error).toContain(error);
    expect(s.latestVersion).toBeNull();
    expect(s.lastChecked).toBe(Date.now());
  });

  it("確認中に呼ばれても二重に確認しない", async () => {
    const u = make();
    await Promise.all([u.check(), u.check()]);
    expect(apiCalls()).toBe(1);
  });
});

describe("install", () => {
  it("新しいバージョンが見つかっていなければ何もしない", async () => {
    const u = make();
    await expect(u.install()).resolves.toBe(u.status);
    expect(get).not.toHaveBeenCalled();
  });

  it("ダウンロードして内容を確かめ、exeを差し替える", async () => {
    const u = make();
    await u.check();
    onStatus.mockClear();
    const s = await u.install();
    expect(s).toMatchObject({ state: "ready", latestVersion: "1.3.0", progress: null, error: null });
    expect(get).toHaveBeenLastCalledWith(`${DL}/DeskTick.exe`, {
      maxBytes: NEW_EXE.length,
      accept: "application/octet-stream",
      timeoutMs: 600_000,
      onProgress: expect.any(Function),
    });
    expect(files.stage).toHaveBeenCalledWith(EXE_PATH, NEW_EXE, sha256Hex(NEW_EXE));
    expect(files.swap).toHaveBeenCalledWith(EXE_PATH);
    expect(onStatus.mock.calls.map(([x]) => [x.state, x.progress])).toEqual([
      ["downloading", 0],
      ["downloading", 0.5],
      ["downloading", 1],
      ["ready", null],
    ]);
  });

  it("差し替えた後は、再起動するまで確認も差し替えもしない", async () => {
    const u = make();
    await u.check();
    await u.install();
    get.mockClear();
    await expect(u.check()).resolves.toMatchObject({ state: "ready" });
    await expect(u.install()).resolves.toMatchObject({ state: "ready" });
    expect(get).not.toHaveBeenCalled();
  });

  it("ダウンロードした内容がマニフェストと違えば差し替えない", async () => {
    routes.set(`${DL}/DeskTick.exe`, Buffer.from("evil DeskTick.exe"));
    const u = make();
    await u.check();
    const s = await u.install();
    expect(s).toMatchObject({ state: "available", error: "ダウンロードしたファイルが壊れています", progress: null });
    expect(files.stage).not.toHaveBeenCalled();
  });

  it("大きさが違っても差し替えない", async () => {
    routes.set(`${DL}/DeskTick.exe`, Buffer.from("short"));
    const u = make();
    await u.check();
    await expect(u.install()).resolves.toMatchObject({ error: "ダウンロードしたファイルが壊れています" });
  });

  it("差し替えに失敗したら理由を示し、もう一度試せるようにする", async () => {
    files.swap.mockRejectedValueOnce(new Error("EBUSY"));
    const u = make();
    await u.check();
    await expect(u.install()).resolves.toMatchObject({ state: "available", error: "EBUSY" });
    await expect(u.install()).resolves.toMatchObject({ state: "ready", error: null });
  });

  it("書き込めなくなっていたらダウンロードしない", async () => {
    const u = make();
    await u.check();
    files.canWrite.mockResolvedValue(false);
    await expect(u.install()).resolves.toMatchObject({ state: "available", installBlocked: NO_WRITE_BLOCKED });
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("開発モードでは差し替えない", async () => {
    const u = make({ exePath: null });
    await u.check();
    await expect(u.install()).resolves.toMatchObject({ state: "available", installBlocked: DEV_BLOCKED });
    expect(files.canWrite).not.toHaveBeenCalled();
  });
});

describe("start (定期的な確認)", () => {
  it("起動から少し待って残りファイルを片付けてから確認し、新しいバージョンを1度だけ知らせる", async () => {
    const u = make();
    u.start();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS - 1);
    expect(files.cleanup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(files.cleanup).toHaveBeenCalledWith(EXE_PATH);
    expect(u.status.state).toBe("available");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("DeskTick v1.3.0 があります", expect.stringContaining("更新"));

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS - 1);
    expect(apiCalls()).toBe(1);
    await vi.advanceTimersByTimeAsync(TICK_MS);
    expect(apiCalls()).toBe(2);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(files.cleanup).toHaveBeenCalledTimes(1);
    u.stop();
  });

  it("失敗したら1時間後にもう一度確認する", async () => {
    routes.set(LATEST_RELEASE_API, new Error("offline"));
    const u = make();
    u.start();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(u.status.state).toBe("error");
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS - TICK_MS);
    expect(apiCalls()).toBe(1);
    await vi.advanceTimersByTimeAsync(TICK_MS);
    expect(apiCalls()).toBe(2);
    expect(notify).not.toHaveBeenCalled();
    u.stop();
  });

  it("「自動では確認しない」なら確認しない（片付けはする）", async () => {
    settings.mode = "off";
    const u = make();
    u.start();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
    expect(files.cleanup).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
    u.stop();
  });

  it("開発モードでは片付けない", async () => {
    const u = make({ exePath: null });
    u.start();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(files.cleanup).not.toHaveBeenCalled();
    expect(u.status.state).toBe("available");
    u.stop();
  });

  it("トーストをオフにしていれば知らせない", async () => {
    settings.notify = false;
    const u = make();
    u.start();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(u.status.state).toBe("available");
    expect(notify).not.toHaveBeenCalled();
    u.stop();
  });

  it("知らせないことにしたバージョンは知らせない", async () => {
    settings.skipVersion = "1.3.0";
    const u = make();
    u.start();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(notify).not.toHaveBeenCalled();
    u.stop();
  });

  it("最新なら知らせない", async () => {
    publish({ tag: "v1.2.0", manifest: manifestBytes({ version: "1.2.0" }) });
    const u = make();
    u.start();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(u.status.state).toBe("latest");
    expect(notify).not.toHaveBeenCalled();
    u.stop();
  });

  it("自動で更新するなら差し替えまで行い、完了を知らせる", async () => {
    settings.mode = "auto";
    const u = make();
    u.start();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(u.status.state).toBe("ready");
    expect(files.swap).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("DeskTick v1.3.0 に更新しました", expect.any(String));

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
    expect(apiCalls()).toBe(1);
    expect(files.cleanup).toHaveBeenCalledTimes(1);
    u.stop();
  });

  it("自動の更新に失敗したら知らせる", async () => {
    settings.mode = "auto";
    files.swap.mockRejectedValue(new Error("EBUSY"));
    const u = make();
    u.start();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(u.status).toMatchObject({ state: "available", error: "EBUSY" });
    expect(notify).toHaveBeenCalledWith("DeskTick v1.3.0 への自動更新に失敗しました", "EBUSY");
    u.stop();
  });

  it("確認の後で書き込めなくなったら、その理由を知らせる", async () => {
    settings.mode = "auto";
    files.canWrite.mockResolvedValueOnce(true).mockResolvedValue(false);
    const u = make();
    u.start();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(notify).toHaveBeenCalledWith("DeskTick v1.3.0 への自動更新に失敗しました", NO_WRITE_BLOCKED);
    u.stop();
  });

  it("自動で更新してもトーストをオフにしていれば知らせない", async () => {
    settings.mode = "auto";
    settings.notify = false;
    const u = make();
    u.start();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(u.status.state).toBe("ready");
    expect(notify).not.toHaveBeenCalled();
    u.stop();
  });

  it("自動で更新する設定でも、差し替えられない環境なら知らせるだけにする", async () => {
    settings.mode = "auto";
    files.canWrite.mockResolvedValue(false);
    const u = make();
    u.start();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(u.status.state).toBe("available");
    expect(files.swap).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("DeskTick v1.3.0 があります", expect.any(String));
    u.stop();
  });

  it("ダウンロード中は片付けも確認もしない", async () => {
    let release: () => void = () => {};
    const u = make();
    await u.check();
    get.mockImplementationOnce(() => new Promise<Uint8Array>((r) => (release = () => r(NEW_EXE))));
    const installing = u.install();
    u.start();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(files.cleanup).not.toHaveBeenCalled();
    expect(apiCalls()).toBe(1);
    release();
    await installing;
    u.stop();
  });

  it("stopで定期的な確認を止める", async () => {
    const u = make();
    u.start();
    u.stop();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(get).not.toHaveBeenCalled();

    u.start();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    u.stop();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
    expect(apiCalls()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
