import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/shared/settings";

const electron = vi.hoisted(() => ({
  app: { isPackaged: false, getAppPath: vi.fn(() => "") },
}));
vi.mock("electron", () => electron);

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, watch: vi.fn(), writeFileSync: vi.fn(actual.writeFileSync) };
});

import { CONFIG_NAME, createSettingsStore } from "@/main/store";

type WatchListener = (ev: string, name: string | Buffer | null) => void;

let dir: string;
let file: string;

const watchListener = (): WatchListener => {
  const calls = vi.mocked(fs.watch).mock.calls;
  return calls[calls.length - 1][1] as unknown as WatchListener;
};

const readJson = (): unknown => JSON.parse(fs.readFileSync(file, "utf8"));

beforeEach(() => {
  vi.clearAllMocks();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "desktick-store-"));
  file = path.join(dir, CONFIG_NAME);
  process.env.PORTABLE_EXECUTABLE_DIR = dir;
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.PORTABLE_EXECUTABLE_DIR;
  electron.app.isPackaged = false;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("configPath", () => {
  it("PORTABLE_EXECUTABLE_DIRが設定されていればそれを使う", () => {
    const s = createSettingsStore(vi.fn());
    expect(s.file).toBe(file);
  });

  it("パッケージ化されている場合はexeのディレクトリを使う", () => {
    delete process.env.PORTABLE_EXECUTABLE_DIR;
    electron.app.isPackaged = true;
    const execPath = process.execPath;
    Object.defineProperty(process, "execPath", { value: path.join(dir, "DeskTick.exe"), configurable: true });
    try {
      const s = createSettingsStore(vi.fn());
      expect(s.file).toBe(file);
      expect(electron.app.getAppPath).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, "execPath", { value: execPath, configurable: true });
    }
  });

  it("パッケージ化されていない場合はアプリのパスを使う", () => {
    delete process.env.PORTABLE_EXECUTABLE_DIR;
    electron.app.getAppPath.mockReturnValue(dir);
    const s = createSettingsStore(vi.fn());
    expect(s.file).toBe(file);
    expect(electron.app.getAppPath).toHaveBeenCalled();
  });
});

describe("createSettingsStore construction", () => {
  it("config.jsonがなければ初期値で作成する", () => {
    const s = createSettingsStore(vi.fn());
    expect(s.value).toEqual(DEFAULT_SETTINGS);
    expect(s.value).not.toBe(DEFAULT_SETTINGS);
    expect(readJson()).toEqual(DEFAULT_SETTINGS);
    expect(fs.readFileSync(file, "utf8").endsWith("\n")).toBe(true);
  });

  it("既存の設定を読み込み、書き直さない", () => {
    fs.writeFileSync(file, JSON.stringify({ padding: 5 }));
    vi.mocked(fs.writeFileSync).mockClear();
    const s = createSettingsStore(vi.fn());
    expect(s.value.padding).toBe(5);
    expect(s.value.cornerRadius).toBe(DEFAULT_SETTINGS.cornerRadius);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("UTF-8のBOMを取り除く", () => {
    fs.writeFileSync(file, `\uFEFF${JSON.stringify({ shadow: false })}`);
    const s = createSettingsStore(vi.fn());
    expect(s.value.shadow).toBe(false);
  });

  it("JSONが不正なら初期値を使い、ファイルは上書きしない", () => {
    fs.writeFileSync(file, "{ not json");
    const s = createSettingsStore(vi.fn());
    expect(s.value).toEqual(DEFAULT_SETTINGS);
    expect(fs.readFileSync(file, "utf8")).toBe("{ not json");
  });

  it("fs.watchが例外を投げてもログに出して動き続ける", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fs.watch).mockImplementationOnce(() => {
      throw new Error("no watch");
    });
    const s = createSettingsStore(vi.fn());
    expect(s.value).toEqual(DEFAULT_SETTINGS);
    expect(err).toHaveBeenCalledWith("Failed to watch config:", expect.any(Error));
  });

  it("設定ファイルのディレクトリを監視する", () => {
    createSettingsStore(vi.fn());
    expect(fs.watch).toHaveBeenCalledWith(dir, expect.any(Function));
  });
});

describe("update / reset / flush", () => {
  it("書き込みをまとめ、変更をマージする", () => {
    vi.useFakeTimers();
    const s = createSettingsStore(vi.fn());
    s.update({ padding: 3 });
    s.update({ cornerRadius: 1 });
    expect(s.value.padding).toBe(3);
    expect(s.value.cornerRadius).toBe(1);
    expect(readJson()).toMatchObject({ padding: 0 });
    vi.advanceTimersByTime(299);
    expect(readJson()).toMatchObject({ padding: 0 });
    vi.advanceTimersByTime(1);
    expect(readJson()).toMatchObject({ padding: 3, cornerRadius: 1 });
  });

  it("resetは初期値に戻し、少し待ってから保存する", () => {
    vi.useFakeTimers();
    fs.writeFileSync(file, JSON.stringify({ padding: 9 }));
    const s = createSettingsStore(vi.fn());
    expect(s.value.padding).toBe(9);
    s.reset();
    expect(s.value).toEqual(DEFAULT_SETTINGS);
    vi.advanceTimersByTime(300);
    expect(readJson()).toEqual(DEFAULT_SETTINGS);
  });

  it("flushは保留中の変更をすぐ書き込み、タイマーを止める", () => {
    vi.useFakeTimers();
    const s = createSettingsStore(vi.fn());
    s.update({ padding: 7 });
    vi.mocked(fs.writeFileSync).mockClear();
    s.flush();
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(readJson()).toMatchObject({ padding: 7 });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  it("flushを2回呼んでも書き込みは1回だけ", () => {
    vi.useFakeTimers();
    const s = createSettingsStore(vi.fn());
    s.update({ padding: 8 });
    vi.mocked(fs.writeFileSync).mockClear();
    s.flush();
    s.flush();
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  it("保留中の変更がなければflushは何もしない", () => {
    const s = createSettingsStore(vi.fn());
    vi.mocked(fs.writeFileSync).mockClear();
    s.flush();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("書き込みの失敗をログに出す", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = createSettingsStore(vi.fn());
    vi.useFakeTimers();
    vi.mocked(fs.writeFileSync).mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    s.update({ padding: 2 });
    expect(() => s.flush()).not.toThrow();
    expect(err).toHaveBeenCalledWith("Failed to save config:", expect.any(Error));
    expect(readJson()).toMatchObject({ padding: 0 });
  });
});

describe("watch", () => {
  it("外部で編集されたら読み直し、変更前の値を通知する", () => {
    vi.useFakeTimers();
    const onExternal = vi.fn();
    const s = createSettingsStore(onExternal);
    const prev = s.value;
    fs.writeFileSync(file, JSON.stringify({ padding: 42 }));
    const listener = watchListener();
    listener("change", CONFIG_NAME.toUpperCase());
    vi.advanceTimersByTime(100);
    listener("change", Buffer.from(CONFIG_NAME)); // debounce restarts
    vi.advanceTimersByTime(199);
    expect(onExternal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExternal).toHaveBeenCalledTimes(1);
    expect(onExternal).toHaveBeenCalledWith(prev);
    expect(s.value.padding).toBe(42);
  });

  it("自分の書き込みは無視する", () => {
    vi.useFakeTimers();
    const onExternal = vi.fn();
    const s = createSettingsStore(onExternal);
    s.update({ padding: 4 });
    s.flush();
    watchListener()("change", CONFIG_NAME);
    vi.advanceTimersByTime(200);
    expect(onExternal).not.toHaveBeenCalled();
    expect(s.value.padding).toBe(4);
  });

  it("編集途中の不正なJSONは無視する", () => {
    vi.useFakeTimers();
    const onExternal = vi.fn();
    const s = createSettingsStore(onExternal);
    fs.writeFileSync(file, "{ broken");
    watchListener()("change", CONFIG_NAME);
    vi.advanceTimersByTime(200);
    expect(onExternal).not.toHaveBeenCalled();
    expect(s.value).toEqual(DEFAULT_SETTINGS);
  });

  it("他のファイルとファイル名なしの通知は無視する", () => {
    vi.useFakeTimers();
    const onExternal = vi.fn();
    createSettingsStore(onExternal);
    fs.writeFileSync(file, JSON.stringify({ padding: 1 }));
    const listener = watchListener();
    listener("change", "other.json");
    listener("rename", null);
    vi.advanceTimersByTime(1000);
    expect(onExternal).not.toHaveBeenCalled();
  });

  it("ファイルの削除は無視する", () => {
    vi.useFakeTimers();
    const onExternal = vi.fn();
    const s = createSettingsStore(onExternal);
    fs.rmSync(file);
    watchListener()("rename", CONFIG_NAME);
    vi.advanceTimersByTime(200);
    expect(onExternal).not.toHaveBeenCalled();
    expect(s.value).toEqual(DEFAULT_SETTINGS);
  });
});
