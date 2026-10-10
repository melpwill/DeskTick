// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyClockStyle, type ClockElements, renderClockText } from "@/shared/clockView";
import { type ClockSettings, DEFAULT_SETTINGS } from "@/shared/settings";

const makeEls = (): ClockElements => ({
  box: document.createElement("div"),
  line1: document.createElement("div"),
  line2: document.createElement("div"),
});

const settings = (patch: Partial<ClockSettings> = {}): ClockSettings => ({
  ...structuredClone(DEFAULT_SETTINGS),
  ...patch,
});

describe("applyClockStyle", () => {
  it("フォント・色・余白・影を適用する", () => {
    const el = makeEls();
    applyClockStyle(el, settings());
    expect(el.box.style.fontFamily).toBe('"UDEV Gothic", sans-serif');
    expect(el.box.style.fontWeight).toBe("600");
    expect(el.box.style.color).toBe("rgb(255, 255, 255)");
    expect(el.box.style.background).toContain("rgba(0, 0, 0, 0.2)");
    expect(el.box.style.padding).toBe("0px");
    expect(el.box.style.borderRadius).toBe("8px");
    expect(el.box.style.textShadow).toBe("0.7px 0.7px 4px rgba(0, 0, 0, 0.5)");
    expect(el.line1.style.fontSize).toBe("16px");
    expect(el.line2.style.fontSize).toBe("28px");
    expect(el.line1.hidden).toBe(false);
    expect(el.line2.hidden).toBe(false);
  });

  it("影を消し、空の行を隠す", () => {
    const el = makeEls();
    applyClockStyle(el, settings({ shadow: false, padding: 4, format: { line1: "", line2: "" } }));
    expect(el.box.style.textShadow).toBe("none");
    expect(el.box.style.padding).toBe("4px");
    expect(el.line1.hidden).toBe(true);
    expect(el.line2.hidden).toBe(true);
  });
});

describe("renderClockText", () => {
  it("指定時刻で2行とも書式どおりに表示する", () => {
    const el = makeEls();
    const s = settings({ timeZone: "UTC", format: { line1: "YYYY-MM-DD", line2: "HH:mm:ss" } });
    renderClockText(el, s, new Date(Date.UTC(2026, 9, 10, 13, 4, 5)));
    expect(el.line1.textContent).toBe("2026-10-10");
    expect(el.line2.textContent).toBe("13:04:05");
  });
});
