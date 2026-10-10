import { describe, expect, it } from "vitest";
import { diffSettings } from "@/main/settingsChanges";
import { DEFAULT_SETTINGS } from "@/shared/settings";

describe("diffSettings", () => {
  it("内容が同じ設定なら別オブジェクトでも変更なしとする", () => {
    expect(diffSettings(DEFAULT_SETTINGS, structuredClone(DEFAULT_SETTINGS))).toEqual({
      alwaysOnTop: false,
      position: false,
    });
  });

  it("alwaysOnTopの変更を検出する", () => {
    const next = { ...DEFAULT_SETTINGS, alwaysOnTop: !DEFAULT_SETTINGS.alwaysOnTop };
    expect(diffSettings(DEFAULT_SETTINGS, next)).toEqual({ alwaysOnTop: true, position: false });
  });

  it("positionの深い階層の変更を検出する", () => {
    const next = { ...DEFAULT_SETTINGS, position: { ...DEFAULT_SETTINGS.position, marginX: 99 } };
    expect(diffSettings(DEFAULT_SETTINGS, next)).toEqual({ alwaysOnTop: false, position: true });
  });
});
