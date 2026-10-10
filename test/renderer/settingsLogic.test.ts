import { describe, expect, it } from "vitest";
import { autoStartNote } from "@/renderer/autoStart";
import { displayChoices, fontPlaceholder } from "@/renderer/choices";
import { formatNtpStatus, isSyncDisabled } from "@/renderer/ntpStatus";
import { buildPatch, formatPercent } from "@/renderer/settingsFields";
import { validateSetting } from "@/renderer/settingsValidation";
import { hasPreview, resolveTab } from "@/renderer/tabs";
import { msToNextSecond } from "@/renderer/timing";
import { ntpStatus } from "@test/renderer/helpers";

describe("settings pure helpers", () => {
  it("NTPの状態を文字列にする", () => {
    expect(formatNtpStatus(ntpStatus())).toBeNull();
    expect(formatNtpStatus(ntpStatus({ enabled: false }))).toBe("無効 (PCの時刻を表示)");
    expect(formatNtpStatus(ntpStatus({ error: "x", lastSync: 1, offsetMs: -3 }))).toBe(
      "同期失敗: x (前回のずれ -3 ms を使用中)",
    );
    expect(isSyncDisabled(ntpStatus())).toBe(false);
    expect(isSyncDisabled(ntpStatus({ syncing: true }))).toBe(true);
  });

  it("設定値を検証する", () => {
    expect(validateSetting("padding", 3)).toBeNull();
    expect(validateSetting("ntp.server", " ")).toBe("サーバ名を入力してください");
    expect(validateSetting("locale", "ja-JP")).toBeNull();
  });

  it("変更内容とパーセント表示を組み立てる", () => {
    expect(buildPatch("font.weight", 700)).toEqual({ font: { weight: 700 } });
    expect(buildPatch("shadow", false)).toEqual({ shadow: false });
    expect(formatPercent(0.204)).toBe("20%");
  });

  it("タブ名を解決する", () => {
    expect(resolveTab("ntp", () => true)).toBe("ntp");
    expect(resolveTab("nope", () => false)).toBe("display");
    expect(hasPreview("format")).toBe(true);
    expect(hasPreview("about")).toBe(false);
  });

  it("次の秒までの待ち時間を計算する", () => {
    expect(msToNextSecond(1500)).toBe(500);
    expect(msToNextSecond(2000)).toBe(1000);
  });

  it("選択肢と説明文を組み立てる", () => {
    expect(displayChoices([{ index: 0, label: "A" }])).toEqual([
      { index: -1, label: "メインディスプレイ" },
      { index: 0, label: "A" },
    ]);
    expect(fontPlaceholder(["Arial"])).toBe("");
    expect(fontPlaceholder([])).toBe("フォント一覧を取得できませんでした");
    expect(autoStartNote({ supported: false, enabled: false, path: "" })).toContain("開発モード");
    expect(autoStartNote({ supported: true, enabled: true, path: "C:/a.exe" })).toContain("C:/a.exe");
  });
});
