import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AlertScheduler, createAlertScheduler, minuteKey } from "@/main/alertScheduler";
import { type AlertDef, DEFAULT_ALERTS, newCustomAlert } from "@/shared/alerts";

const at = (hhmm: string, sec = 0) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2026, 9, 7, h, m, sec);
};

const custom = (id: string, time: string, enabled = true): AlertDef => {
  const a = newCustomAlert(id);
  a.enabled = enabled;
  a.schedule = { ...a.schedule, times: { enabled: true, list: [time] } };
  return a;
};

let now: Date;
let alerts: AlertDef[];
let fire: ReturnType<typeof vi.fn<(a: AlertDef) => void>>;
let nowFn: ReturnType<typeof vi.fn<() => Date>>;

const make = (): AlertScheduler => createAlertScheduler({ alerts: () => alerts, now: nowFn, fire });

beforeEach(() => {
  fire = vi.fn<(a: AlertDef) => void>();
  nowFn = vi.fn(() => now);
  alerts = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("minuteKey", () => {
  it("時と分をゼロ埋めし、日付を含める", () => {
    expect(minuteKey(new Date(2026, 9, 7, 9, 5, 59))).toBe(`${new Date(2026, 9, 7).toDateString()} 09:05`);
  });
});

describe("AlertScheduler.check", () => {
  it("アプリを起動した分の間は通知しない", () => {
    now = at("12:00", 5);
    alerts = [DEFAULT_ALERTS.lunch];
    const s = make();
    s.check();
    now = at("12:00", 59);
    s.check();
    expect(fire).not.toHaveBeenCalled();
  });

  it("時刻が来たアラートを1分に1回だけ通知する", () => {
    now = at("11:59", 30);
    alerts = [DEFAULT_ALERTS.lunch, DEFAULT_ALERTS.dinner, custom("c1", "12:00")];
    const s = make();
    now = at("12:00", 0);
    s.check();
    expect(fire.mock.calls.map(([a]) => a.id)).toEqual(["lunch", "c1"]);
    now = at("12:00", 30);
    s.check();
    expect(fire).toHaveBeenCalledTimes(2);
  });

  it("無効なアラートと時刻前のアラートは通知しない", () => {
    now = at("08:00");
    alerts = [custom("off", "09:00", false), custom("later", "10:00")];
    const s = make();
    now = at("09:00");
    s.check();
    expect(fire).not.toHaveBeenCalled();
  });

  it("一定間隔のアラートは次の該当する分に再び通知する", () => {
    now = at("09:00");
    alerts = [DEFAULT_ALERTS.stand]; // every 30 min from 09:00 on weekdays
    const s = make();
    now = at("09:30");
    s.check();
    now = at("09:45");
    s.check();
    now = at("10:00");
    s.check();
    expect(fire).toHaveBeenCalledTimes(2);
    expect(fire).toHaveBeenNthCalledWith(1, DEFAULT_ALERTS.stand);
    expect(fire).toHaveBeenNthCalledWith(2, DEFAULT_ALERTS.stand);
  });

  it("IDが重複していても1分に1回だけ通知する", () => {
    now = at("11:00");
    alerts = [custom("dup", "12:00"), custom("dup", "12:00")];
    const s = make();
    now = at("12:00");
    s.check();
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("別の日の同じ時刻は別の分として扱う", () => {
    now = at("11:00");
    alerts = [DEFAULT_ALERTS.lunch];
    const s = make();
    now = at("12:00");
    s.check();
    now = new Date(2026, 9, 8, 12, 0);
    s.check();
    expect(fire).toHaveBeenCalledTimes(2);
  });
});

describe("AlertScheduler.start/stop", () => {
  it("動作中は毎秒判定する", () => {
    vi.useFakeTimers();
    now = at("11:59", 58);
    alerts = [DEFAULT_ALERTS.lunch];
    const s = make();
    const checks = () => nowFn.mock.calls.length - 1;
    s.start();
    s.start();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(checks()).toBe(1);
    expect(fire).not.toHaveBeenCalled();
    now = at("12:00", 0);
    vi.advanceTimersByTime(1000);
    expect(fire).toHaveBeenCalledWith(DEFAULT_ALERTS.lunch);

    s.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(checks()).toBe(2);
  });

  it("開始前のstopは安全で、stop後にstartで再開できる", () => {
    vi.useFakeTimers();
    now = at("10:00");
    const s = make();
    s.stop();
    s.start();
    s.stop();
    s.start();
    expect(vi.getTimerCount()).toBe(1);
    s.stop();
  });
});
