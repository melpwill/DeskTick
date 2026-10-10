import { describe, expect, it } from "vitest";
import {
  type AlertDef,
  type AlertsSettings,
  alertText,
  allAlerts,
  DEFAULT_ALERTS,
  describeDays,
  describeSchedule,
  FIXED_ALERT_IDS,
  formatDuration,
  isDue,
  localDate,
  newCustomAlert,
  normalizeAlerts,
  parseHHMM,
} from "@/shared/alerts";

// 2026-10-12は月曜日、2026-10-10は土曜日
const at = (y: number, mo: number, d: number, h: number, mi: number): Date => new Date(y, mo - 1, d, h, mi, 30);
const MON = (h: number, m: number): Date => at(2026, 10, 12, h, m);
const SAT = (h: number, m: number): Date => at(2026, 10, 10, h, m);

const alert = (schedule: Partial<AlertDef["schedule"]>, extra: Partial<AlertDef> = {}): AlertDef => {
  const base: AlertDef = newCustomAlert("t");
  return { ...base, ...extra, schedule: { ...base.schedule, ...schedule } };
};

describe("defaults", () => {
  it("固定IDごとに1件あり、カスタムアラートはない", () => {
    for (const id of FIXED_ALERT_IDS) expect(DEFAULT_ALERTS[id].id).toBe(id);
    expect(DEFAULT_ALERTS.custom).toEqual([]);
  });

  it("食事は昼食だけを有効にする", () => {
    expect([DEFAULT_ALERTS.breakfast.enabled, DEFAULT_ALERTS.lunch.enabled, DEFAULT_ALERTS.dinner.enabled]).toEqual([
      false,
      true,
      false,
    ]);
  });
});

describe("normalizeAlerts", () => {
  it("足りない項目を補い、オブジェクト以外を除き、IDの重複をなくす", () => {
    const raw = { ...DEFAULT_ALERTS, custom: [{ id: "a", name: "A" }, null, "x", { id: "a" }, { name: "noid" }] };
    const out = normalizeAlerts(raw as unknown as AlertsSettings);
    expect(out.custom.map((c) => c.id)).toEqual(["a", "a_", "custom-2"]);
    expect(out.custom[0].name).toBe("A");
    expect(out.custom[1].title).toBe(newCustomAlert("x").title);
  });

  it("配列でないcustomは空として扱う", () => {
    const out = normalizeAlerts({ ...DEFAULT_ALERTS, custom: "x" } as unknown as AlertsSettings);
    expect(out.custom).toEqual([]);
  });
});

describe("allAlerts", () => {
  it("固定のアラート、カスタムアラートの順に並べる", () => {
    const c = newCustomAlert("c1");
    expect(allAlerts({ ...DEFAULT_ALERTS, custom: [c] }).map((a) => a.id)).toEqual([...FIXED_ALERT_IDS, "c1"]);
  });
});

describe("parseHHMM / localDate", () => {
  it("正しい時刻を解析する", () => {
    expect(parseHHMM("00:00")).toBe(0);
    expect(parseHHMM("9:05")).toBe(545);
    expect(parseHHMM("23:59")).toBe(1439);
  });

  it("不正な時刻はnullにする", () => {
    expect(parseHHMM("24:00")).toBeNull();
    expect(parseHHMM("12:60")).toBeNull();
    expect(parseHHMM("1200")).toBeNull();
  });

  it("ローカルの日付を文字列にする", () => {
    expect(localDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("isDue", () => {
  it("既定の定時は平日の18:00だけ通知する", () => {
    expect(isDue(DEFAULT_ALERTS.teiji, MON(18, 0))).toBe(true);
    expect(isDue(DEFAULT_ALERTS.teiji, MON(18, 1))).toBe(false);
    expect(isDue(DEFAULT_ALERTS.teiji, SAT(18, 0))).toBe(false);
  });

  it("無効なら通知しない", () => {
    expect(isDue({ ...DEFAULT_ALERTS.teiji, enabled: false }, MON(18, 0))).toBe(false);
  });

  it("間隔は時間帯の開始から数え、開始時刻は含めず終了時刻は含める", () => {
    const stand = DEFAULT_ALERTS.stand;
    expect(isDue(stand, MON(9, 0))).toBe(false);
    expect(isDue(stand, MON(9, 30))).toBe(true);
    expect(isDue(stand, MON(9, 45))).toBe(false);
    expect(isDue(stand, MON(18, 0))).toBe(true);
    expect(isDue(stand, MON(18, 30))).toBe(false);
    expect(isDue(stand, MON(8, 30))).toBe(false);
  });

  it("指定時刻と一定間隔を併用できる", () => {
    const a = alert({
      interval: { enabled: true, minutes: 90, from: "09:00", to: "18:00" },
      times: { enabled: true, list: ["08:15", "12:00"] },
      days: [1],
    });
    expect(isDue(a, MON(8, 15))).toBe(true);
    expect(isDue(a, MON(10, 30))).toBe(true);
    expect(isDue(a, MON(11, 0))).toBe(false);
    expect(isDue(a, at(2026, 10, 13, 8, 15))).toBe(false);
  });

  it("オフのモードは無視する", () => {
    const a = alert({
      interval: { enabled: false, minutes: 30, from: "09:00", to: "18:00" },
      times: { enabled: false, list: ["09:30"] },
    });
    expect(isDue(a, MON(9, 30))).toBe(false);
  });

  it("不正な間隔や時間帯は無視する", () => {
    const iv = (minutes: number, from: string, to: string): AlertDef =>
      alert({ interval: { enabled: true, minutes, from, to }, times: { enabled: false, list: [] } });
    expect(isDue(iv(0, "09:00", "18:00"), MON(10, 0))).toBe(false);
    expect(isDue(iv(30, "bad", "18:00"), MON(10, 0))).toBe(false);
    expect(isDue(iv(30, "09:00", "bad"), MON(10, 0))).toBe(false);
  });

  it("繰り返しなしのアラートは曜日ではなく日付で判定する", () => {
    const a = alert({ times: { enabled: true, list: ["12:00"] }, days: [], once: "2026-10-20" });
    expect(isDue(a, at(2026, 10, 20, 12, 0))).toBe(true);
    expect(isDue(a, at(2026, 10, 21, 12, 0))).toBe(false);
  });
});

describe("alertText", () => {
  it("タイトルと本文の{emoji}を置き換える", () => {
    const a = alert({}, { title: "Hi {emoji}", messages: ["", "msg {emoji}"], emojis: ["🔔", 1 as unknown as string] });
    expect(alertText(a, "App")).toEqual({ title: "Hi 🔔", body: "msg 🔔" });
  });

  it("タイトルが空ならアラート名、それも空ならアプリ名を使い、本文は空にする", () => {
    const a = alert({}, { title: " {emoji} ", messages: [], emojis: [] });
    expect(alertText(a, "App")).toEqual({ title: a.name, body: "" });
    expect(alertText({ ...a, name: "" }, "App").title).toBe("App");
  });
});

describe("formatDuration / describeDays / describeSchedule", () => {
  it("時間の長さを文字列にする", () => {
    expect(formatDuration(30)).toBe("30分");
    expect(formatDuration(60)).toBe("1時間");
    expect(formatDuration(90)).toBe("1時間30分");
    expect(formatDuration(0)).toBe("0分");
  });

  it("よく使う曜日の組み合わせに名前を付ける", () => {
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe("毎日");
    expect(describeDays([])).toBe("曜日なし");
    expect(describeDays([5, 4, 3, 2, 1])).toBe("平日");
    expect(describeDays([6, 0])).toBe("土日");
    expect(describeDays([0, 1, 2, 3, 4])).toBe("月・火・水・木・日");
    expect(describeDays([0, 5])).toBe("金・日");
  });

  it("スケジュールを要約する", () => {
    expect(describeSchedule(DEFAULT_ALERTS.stand)).toBe("30分ごと (09:00〜18:00) / 平日");
    expect(describeSchedule(DEFAULT_ALERTS.lunch)).toBe("12:00 / 毎日");
    const both = alert({
      interval: { enabled: true, minutes: 90, from: "09:00", to: "18:00" },
      times: { enabled: true, list: ["08:15", "12:00"] },
      days: [1],
    });
    expect(describeSchedule(both)).toBe("1時間30分ごと (09:00〜18:00) + 08:15, 12:00 / 月");
    expect(describeSchedule({ ...both, schedule: { ...both.schedule, once: "2026-10-20" } })).toBe(
      "1時間30分ごと (09:00〜18:00) + 08:15, 12:00 / 2026-10-20 のみ",
    );
  });

  it("スケジュールがなければその旨を表示する", () => {
    expect(describeSchedule(alert({ times: { enabled: true, list: [] } }))).toBe("スケジュールなし");
  });
});
