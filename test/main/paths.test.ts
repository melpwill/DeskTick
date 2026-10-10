import * as path from "path";
import { describe, expect, it, vi } from "vitest";
import { resolveConfigDir, resolveExePath } from "@/main/paths";

describe("resolveExePath", () => {
  it("PORTABLE_EXECUTABLE_FILEを優先する", () => {
    expect(resolveExePath({ PORTABLE_EXECUTABLE_FILE: "C:\\apps\\DeskTick.exe" }, "C:\\tmp\\x.exe")).toBe(
      "C:\\apps\\DeskTick.exe",
    );
  });

  it("未設定または空ならexecPathを使う", () => {
    expect(resolveExePath({}, "C:\\tmp\\x.exe")).toBe("C:\\tmp\\x.exe");
    expect(resolveExePath({ PORTABLE_EXECUTABLE_FILE: "" }, "C:\\tmp\\x.exe")).toBe("C:\\tmp\\x.exe");
  });
});

describe("resolveConfigDir", () => {
  const exe = path.join("C:\\apps", "DeskTick.exe");

  it("PORTABLE_EXECUTABLE_DIRを優先する", () => {
    const appPath = vi.fn(() => "dev");
    expect(resolveConfigDir({ PORTABLE_EXECUTABLE_DIR: "D:\\portable" }, true, exe, appPath)).toBe("D:\\portable");
    expect(appPath).not.toHaveBeenCalled();
  });

  it("パッケージ化されている場合はアプリのパスを読まずにexeのディレクトリを使う", () => {
    const appPath = vi.fn(() => "dev");
    expect(resolveConfigDir({}, true, exe, appPath)).toBe(path.dirname(exe));
    expect(appPath).not.toHaveBeenCalled();
  });

  it("開発時はアプリのパスを使う", () => {
    expect(resolveConfigDir({}, false, exe, () => "C:\\src\\clock")).toBe("C:\\src\\clock");
  });
});
