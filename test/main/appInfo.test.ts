import { describe, expect, it, vi } from "vitest";
import { buildAppInfo, buildAutoStartInfo } from "@/main/appInfo";

describe("buildAppInfo", () => {
  it("ランタイムのバージョンを平坦にまとめる", () => {
    expect(
      buildAppInfo({
        productName: "DeskTick",
        version: "1.0.0",
        versions: { electron: "44.0.0", chrome: "140.0", node: "22.1.0" },
        settingsPath: "C:\\apps\\config.json",
        exePath: "C:\\apps\\DeskTick.exe",
      }),
    ).toEqual({
      productName: "DeskTick",
      version: "1.0.0",
      electron: "44.0.0",
      chrome: "140.0",
      node: "22.1.0",
      settingsPath: "C:\\apps\\config.json",
      exePath: "C:\\apps\\DeskTick.exe",
    });
  });
});

describe("buildAutoStartInfo", () => {
  const exe = "C:\\apps\\DeskTick.exe";

  it("パッケージ化されていない場合は非対応とし、ログイン項目を読まない", () => {
    const openAtLogin = vi.fn(() => true);
    expect(buildAutoStartInfo(false, openAtLogin, exe)).toEqual({ supported: false, enabled: false, path: exe });
    expect(openAtLogin).not.toHaveBeenCalled();
  });

  it.each([true, false])("パッケージ化されている場合はexeのopenAtLogin=%sを返す", (enabled) => {
    const openAtLogin = vi.fn(() => enabled);
    expect(buildAutoStartInfo(true, openAtLogin, exe)).toEqual({ supported: true, enabled, path: exe });
    expect(openAtLogin).toHaveBeenCalledWith(exe);
  });
});
