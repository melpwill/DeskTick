import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canWriteBeside,
  cleanupUpdateFiles,
  NEW_SUFFIX,
  OLD_SUFFIX,
  powershellCommand,
  psQuote,
  stageExe,
  swapCommand,
  swapScript,
  SWAP_TIMEOUT_SEC,
} from "@/main/updateFiles";
import { sha256Hex } from "@/main/updateManifest";

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

describe("psQuote", () => {
  it("単一引用符で囲み、中の引用符（‘’‚‛を含む）を重ねる", () => {
    expect(psQuote("a'b’c‛d")).toBe("'a''b’’c‛‛d'");
    expect(psQuote("$env:X `n")).toBe("'$env:X `n'");
  });
});

describe("swapCommand", () => {
  const decode = (args: readonly string[]): string =>
    Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le");

  it("%SystemRoot%のPowerShellで、差し替え用のPowerShellをWMIで起動する", () => {
    const ps = path.win32.join(dir, "Win", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const cmd = swapCommand(exe, true, path.join(dir, "Win"));
    expect(cmd.file).toBe(ps);
    expect(cmd.args).toContain("-NoProfile");
    expect(decode(cmd.args)).toContain("Win32_Process");

    const inner = cmd.env.DESKTICK_SWAP_COMMAND;
    expect(inner.startsWith(`"${ps}" -NoProfile `)).toBe(true);
    const script = decode(inner.split(" "));
    expect(script).toContain(`$exe = ${psQuote(exe)}`);
    expect(script).toContain(`.AddSeconds(${SWAP_TIMEOUT_SEC})`);
    expect(script).toContain("if ($true -and");
  });

  it("%SystemRoot%がなければPATHから探し、起動し直さないこともできる", () => {
    const cmd = swapCommand(exe, false, undefined);
    expect(cmd.file).toBe("powershell.exe");
    expect(cmd.env.DESKTICK_SWAP_COMMAND.startsWith('"powershell.exe" ')).toBe(true);
    expect(swapScript(exe, false)).toContain("if ($false -and");
  });

  describe.runIf(process.platform === "win32")("PowerShellで実行する", () => {
    beforeEach(() => {
      // 空白と引用符を含むパスでも動くことを確かめる
      const quoted = path.join(dir, "Desk Tick's ’$x");
      fs.mkdirSync(quoted);
      fs.renameSync(exe, path.join(quoted, "DeskTick.exe"));
      exe = path.join(quoted, "DeskTick.exe");
    });

    const files = (): string[] => fs.readdirSync(path.dirname(exe));
    const run = (): void => {
      const cmd = powershellCommand(process.env.SystemRoot, swapScript(exe, false));
      execFileSync(cmd.file, cmd.args, { stdio: "ignore", timeout: 30_000 });
    };

    it("現在のexeを<exe>.oldに退避し、<exe>.newを元の名前にする", () => {
      fs.writeFileSync(`${exe}${NEW_SUFFIX}`, "new");
      fs.writeFileSync(`${exe}${OLD_SUFFIX}`, "older");
      run();
      expect(read(exe)).toBe("new");
      expect(read(`${exe}${OLD_SUFFIX}`)).toBe("old");
      expect(fs.existsSync(`${exe}${NEW_SUFFIX}`)).toBe(false);
    });

    it("<exe>.newがなければ何もしない", () => {
      run();
      expect(files()).toEqual(["DeskTick.exe"]);
      expect(read(exe)).toBe("old");
    });

    it("前回の途中で<exe>がなければ<exe>.oldから戻す", () => {
      fs.renameSync(exe, `${exe}${OLD_SUFFIX}`);
      run();
      expect(files()).toEqual(["DeskTick.exe"]);
      expect(read(exe)).toBe("old");
    });

    it("起動役はWMIで差し替え用のPowerShellを起動してすぐ終わり、差し替えはその後に行われる", async () => {
      fs.writeFileSync(`${exe}${NEW_SUFFIX}`, "new");
      const cmd = swapCommand(exe, false, process.env.SystemRoot);
      execFileSync(cmd.file, cmd.args, { env: { ...process.env, ...cmd.env }, stdio: "ignore", timeout: 30_000 });
      for (let i = 0; i < 100 && read(exe) !== "new"; i++) await new Promise((r) => setTimeout(r, 200));
      expect(read(exe)).toBe("new");
      expect(read(`${exe}${OLD_SUFFIX}`)).toBe("old");
    }, 30_000);
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
