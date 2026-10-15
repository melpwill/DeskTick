import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AlertPause, createAlertPause, PAUSE_CHOICES, pauseUntilText } from "@/main/alertPause";

const BASE = new Date(2026, 9, 15, 15, 0).getTime();

let onChange: ReturnType<typeof vi.fn<() => void>>;

const make = (): AlertPause => createAlertPause({ now: () => Date.now(), onChange });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
  onChange = vi.fn<() => void>();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PAUSE_CHOICES", () => {
  it("最後の選択肢は再開するまで止める", () => {
    expect(PAUSE_CHOICES.at(-1)).toEqual({ label: "再開するまで", minutes: null });
  });
});

describe("pauseUntilText", () => {
  it("終了時刻を時:分で表す", () => {
    expect(pauseUntilText(new Date(2026, 9, 15, 9, 5).getTime())).toBe("09:05まで");
  });

  it("終了時刻がなければ再開するまでと表す", () => {
    expect(pauseUntilText(null)).toBe("再開するまで");
  });
});

describe("AlertPause", () => {
  it("初期状態は停止していない", () => {
    const p = make();
    expect(p.paused).toBe(false);
    expect(p.until).toBeNull();
  });

  it("分数を指定すると、その時間が過ぎたら自動で再開する", () => {
    const p = make();
    p.pause(30);
    expect(p.paused).toBe(true);
    expect(p.until).toBe(BASE + 30 * 60_000);
    expect(onChange).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30 * 60_000 - 1);
    expect(p.paused).toBe(true);
    vi.advanceTimersByTime(1);
    expect(p.paused).toBe(false);
    expect(p.until).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("再開するまでを選ぶと、resumeを呼ぶまで止まったままになる", () => {
    const p = make();
    p.pause(null);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect(p.paused).toBe(true);
    expect(p.until).toBeNull();
    p.resume();
    expect(p.paused).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("停止中に選び直すと、新しい終了時刻に置き換わる", () => {
    const p = make();
    p.pause(30);
    p.pause(120);
    expect(vi.getTimerCount()).toBe(1);
    expect(p.until).toBe(BASE + 120 * 60_000);
    vi.advanceTimersByTime(30 * 60_000);
    expect(p.paused).toBe(true);
    p.pause(null);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("手動で再開すると自動再開のタイマーを止める", () => {
    const p = make();
    p.pause(60);
    p.resume();
    expect(p.paused).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("停止していないときのresumeは何もしない", () => {
    const p = make();
    p.resume();
    expect(onChange).not.toHaveBeenCalled();
  });
});
