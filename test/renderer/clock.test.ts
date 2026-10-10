// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultSettings,
  flush,
  installApi,
  installFonts,
  loadBody,
  type MockApi,
  mockApi,
  ntpStatus,
} from "@test/renderer/helpers";

let m: MockApi;
let size = { width: 100.2, height: 50.7 };

/**
 * @description - 時計ウィンドウのスクリプトを読み込み直す
 * @return {Promise<void>} - 初期化の完了
 */
const load = async (): Promise<void> => {
  vi.resetModules();
  await import("@/renderer/clock");
  await flush();
};

const $ = (id: string) => document.getElementById(id)!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 10, 9, 8, 7, 500));
  document.body.innerHTML = loadBody("index.html");
  size = { width: 100.2, height: 50.7 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => size as DOMRect);
  installFonts();
  m = mockApi();
  m.api.getSettings.mockResolvedValue({
    ...defaultSettings(),
    locale: "en-US",
    format: { line1: "YYYY-MM-DD", line2: "HH:mm:ss" },
  });
  installApi(m);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("clock window", () => {
  it("時刻を描画してスタイルを適用し、サイズを1回だけ通知する", async () => {
    await load();
    expect($("line1").textContent).toBe("2026-10-10");
    expect($("line2").textContent).toBe("09:08:07");
    expect($("box").style.fontWeight).toBe("600");
    expect(m.api.reportSize).toHaveBeenCalledTimes(1);
    expect(m.api.reportSize).toHaveBeenCalledWith(101, 51);

    await vi.advanceTimersByTimeAsync(500);
    expect($("line2").textContent).toBe("09:08:08");
    expect(m.api.reportSize).toHaveBeenCalledTimes(1);

    size = { width: 120, height: 50.7 };
    await vi.advanceTimersByTimeAsync(1000);
    expect($("line2").textContent).toBe("09:08:09");
    expect(m.api.reportSize).toHaveBeenLastCalledWith(120, 51);

    size = { width: 120, height: 60 };
    await vi.advanceTimersByTimeAsync(1000);
    expect(m.api.reportSize).toHaveBeenLastCalledWith(120, 60);
    expect(m.api.reportSize).toHaveBeenCalledTimes(3);
  });

  it("最初の描画の前にフォントの読み込みを待つ", async () => {
    let ready!: () => void;
    installFonts(new Promise<void>((r) => (ready = r)));
    await load();
    expect($("box").style.fontWeight).toBe("600");
    expect($("line2").textContent).toBe("");
    ready();
    await flush();
    expect($("line2").textContent).toBe("09:08:07");
  });

  it("起動時からNTPのずれを反映する", async () => {
    m.api.getNtpStatus.mockResolvedValue(ntpStatus({ offsetMs: 3000 }));
    await load();
    expect($("line2").textContent).toBe("09:08:10");
  });

  it("秒の境界の直前でも最小の待ち時間を確保する", async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 9, 8, 7, 995));
    await load();
    expect($("line2").textContent).toBe("09:08:07");
    await vi.advanceTimersByTimeAsync(9);
    expect($("line2").textContent).toBe("09:08:07");
    await vi.advanceTimersByTimeAsync(1);
    expect($("line2").textContent).toBe("09:08:08");
  });

  it("設定が変わったら描画し、フォント読み込み後にもう一度描画する", async () => {
    await load();
    const s = { ...defaultSettings(), shadow: false, format: { line1: "", line2: "HH:mm" } };
    m.cb.settings!(s);
    expect($("box").style.textShadow).toBe("none");
    expect($("line1").hidden).toBe(true);
    expect($("line2").textContent).toBe("09:08");

    size = { width: 10, height: 10 };
    await flush();
    expect(m.api.reportSize).toHaveBeenLastCalledWith(10, 10);
  });

  it("NTPのずれが変わったら描画し直し、変わらなければ何もしない", async () => {
    await load();
    const spy = vi.spyOn(globalThis, "setTimeout");
    m.cb.ntp!(ntpStatus({ offsetMs: 0 }));
    expect(spy).not.toHaveBeenCalled();
    expect($("line2").textContent).toBe("09:08:07");

    m.cb.ntp!(ntpStatus({ offsetMs: -2000 }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect($("line2").textContent).toBe("09:08:05");
  });
});
