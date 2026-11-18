import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canWriteBeside,
  cleanupUpdateFiles,
  DEFAULT_RETRY,
  NEW_SUFFIX,
  OLD_SUFFIX,
  retry,
  stageExe,
  swapExe,
} from "@/main/updateFiles";
import { sha256Hex } from "@/main/updateManifest";

const FAST = { attempts: 3, delayMs: 0 };

let dir: string;
let exe: string;

const read = (p: string): string => fs.readFileSync(p, "utf8");

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "desktick-update-"));
  exe = path.join(dir, "DeskTick.exe");
  fs.writeFileSync(exe, "old");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("retry", () => {
  it("成功するまで試し、回数を使い切ったら最後の例外を投げる", async () => {
    const ok = vi.fn().mockRejectedValueOnce(new Error("busy")).mockResolvedValue(1);
    await expect(retry(ok, FAST)).resolves.toBe(1);
    expect(ok).toHaveBeenCalledTimes(2);

    const ng = vi.fn().mockRejectedValue(new Error("busy"));
    await expect(retry(ng, FAST)).rejects.toThrow("busy");
    expect(ng).toHaveBeenCalledTimes(3);
  });

  it("既定では10秒ほど待つ", () => {
    expect(DEFAULT_RETRY.attempts * DEFAULT_RETRY.delayMs).toBe(10_000);
  });
});

describe("canWriteBeside", () => {
  it("書き込めるディレクトリならtrueを返し、確認用のファイルを残さない", async () => {
    await expect(canWriteBeside(exe)).resolves.toBe(true);
    expect(fs.readdirSync(dir)).toEqual(["DeskTick.exe"]);
  });

  it("書き込めなければfalse", async () => {
    await expect(canWriteBeside(path.join(dir, "missing", "DeskTick.exe"))).resolves.toBe(false);
  });
});

describe("stageExe", () => {
  it("<exe>.newに書き込み、前回の残りは置き換える", async () => {
    fs.writeFileSync(`${exe}${NEW_SUFFIX}`, "stale");
    const data = Buffer.from("new");
    await expect(stageExe(exe, data, sha256Hex(data))).resolves.toBe(`${exe}${NEW_SUFFIX}`);
    expect(read(`${exe}${NEW_SUFFIX}`)).toBe("new");
  });

  it("読み直した内容が一致しなければ消して失敗にする", async () => {
    await expect(stageExe(exe, Buffer.from("new"), "0".repeat(64))).rejects.toThrow("一致しません");
    expect(fs.existsSync(`${exe}${NEW_SUFFIX}`)).toBe(false);
  });
});

describe("swapExe", () => {
  it("現在のexeを<exe>.oldに退避し、<exe>.newを元の名前にする", async () => {
    fs.writeFileSync(`${exe}${NEW_SUFFIX}`, "new");
    fs.writeFileSync(`${exe}${OLD_SUFFIX}`, "older");
    await swapExe(exe, FAST);
    expect(read(exe)).toBe("new");
    expect(read(`${exe}${OLD_SUFFIX}`)).toBe("old");
    expect(fs.existsSync(`${exe}${NEW_SUFFIX}`)).toBe(false);
  });

  it("新しいexeを置けなければ元のexeに戻す", async () => {
    await expect(swapExe(exe, FAST)).rejects.toThrow();
    expect(read(exe)).toBe("old");
    expect(fs.existsSync(`${exe}${OLD_SUFFIX}`)).toBe(false);
  });

  it("一時的に失敗しても再試行する", async () => {
    fs.writeFileSync(`${exe}${NEW_SUFFIX}`, "new");
    const rename = vi
      .spyOn(fs.promises, "rename")
      .mockRejectedValueOnce(Object.assign(new Error("EBUSY"), { code: "EBUSY" }));
    await swapExe(exe, FAST);
    expect(rename).toHaveBeenCalledTimes(3);
    expect(read(exe)).toBe("new");
  });
});

describe("cleanupUpdateFiles", () => {
  it("<exe>.newと<exe>.oldを消し、なくても失敗しない", async () => {
    fs.writeFileSync(`${exe}${NEW_SUFFIX}`, "new");
    fs.writeFileSync(`${exe}${OLD_SUFFIX}`, "old");
    await cleanupUpdateFiles(exe);
    expect(fs.readdirSync(dir)).toEqual(["DeskTick.exe"]);
    await expect(cleanupUpdateFiles(exe)).resolves.toBeUndefined();
  });

  it("消せないファイルは次回に回す", async () => {
    vi.spyOn(fs.promises, "rm").mockRejectedValue(new Error("EPERM"));
    await expect(cleanupUpdateFiles(exe)).resolves.toBeUndefined();
  });
});
