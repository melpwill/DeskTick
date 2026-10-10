import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, fontStack, normalizeSettings, settingsFromConfig, toRgba } from "@/shared/settings";

describe("settingsFromConfig", () => {
  it("オブジェクト以外の入力では初期値を返す", () => {
    expect(settingsFromConfig(null)).toEqual(DEFAULT_SETTINGS);
    expect(settingsFromConfig([1, 2])).toEqual(DEFAULT_SETTINGS);
  });

  it("一部だけの設定を初期値にマージする", () => {
    const s = settingsFromConfig({ locale: "ja-JP", font: { line1Size: 20 } });
    expect(s.locale).toBe("ja-JP");
    expect(s.font).toEqual({ ...DEFAULT_SETTINGS.font, line1Size: 20 });
  });

  it("カスタムアラートを正規化する", () => {
    const s = settingsFromConfig({ alerts: { custom: [{ name: "会議" }, 3] } });
    expect(s.alerts.custom).toHaveLength(1);
    expect(s.alerts.custom[0]).toMatchObject({ id: "custom-0", name: "会議" });
  });
});

describe("normalizeSettings", () => {
  it("アラートを正規化し、他の設定はそのままにする", () => {
    const raw = { ...DEFAULT_SETTINGS, alerts: { ...DEFAULT_SETTINGS.alerts, custom: [{ id: "a" }] } };
    const s = normalizeSettings(raw as typeof DEFAULT_SETTINGS);
    expect(s.alerts.custom[0].name).toBe("カスタム");
    expect(s.font).toBe(DEFAULT_SETTINGS.font);
  });
});

describe("toRgba", () => {
  it("16進の色と不透明度を変換する", () => {
    expect(toRgba({ color: "#ff8000", alpha: 0.5 })).toBe("rgba(255, 128, 0, 0.5)");
    expect(toRgba({ color: "00FF00", alpha: 1 })).toBe("rgba(0, 255, 0, 1)");
  });

  it("不正な色は白にし、不透明度を範囲内に収める", () => {
    expect(toRgba({ color: "red", alpha: 2 })).toBe("rgba(255, 255, 255, 1)");
    expect(toRgba({ color: "#000000", alpha: -1 })).toBe("rgba(0, 0, 0, 0)");
  });
});

describe("fontStack", () => {
  it("フォント名を引用符で囲み、引用符とバックスラッシュを取り除く", () => {
    expect(fontStack(' My "Font"\\ ')).toBe('"My Font", sans-serif');
  });

  it("フォント名が空ならsans-serifを使う", () => {
    expect(fontStack("  ")).toBe("sans-serif");
  });
});
