import { describe, expect, it } from "vitest";
import {
  addTime,
  alertsPatchFor,
  canAddTime,
  createCustomAlert,
  displayName,
  groupAlerts,
  itemClass,
  noteFor,
  onceDate,
  parseEmojis,
  parseMessages,
  removeCustomAlert,
  removeTime,
  setIn,
  toMinutes,
  validateAlert,
  withAlertsPatch,
} from "@/renderer/alertLogic";
import { type AlertDef, newCustomAlert } from "@/shared/alerts";
import { defaultSettings } from "@test/renderer/helpers";

describe("alertLogic", () => {
  it("名前と説明文を返す", () => {
    expect(displayName("")).toBe("(無題)");
    expect(displayName("A")).toBe("A");
    expect(noteFor("teiji")).toBe("指定した時刻に1日1回お知らせします。");
    expect(noteFor("lunch")).toBeNull();
    expect(noteFor("custom-1")).toBeNull();
  });

  it("一覧項目のクラスを組み立てる", () => {
    const a: AlertDef = newCustomAlert("x");
    expect(itemClass(a, "x")).toBe("alert-item active");
    expect(itemClass({ ...a, enabled: false }, "y")).toBe("alert-item off");
  });

  it("アラートをグループに分ける", () => {
    const alerts = defaultSettings().alerts;
    expect(groupAlerts(alerts, { label: "x", ids: ["lunch"] })).toEqual([alerts.lunch]);
    expect(groupAlerts(alerts, { label: "x", ids: "custom" })).toBe(alerts.custom);
  });

  it("アラートを検証する", () => {
    const a: AlertDef = newCustomAlert("x");
    expect(validateAlert(a)).toBeNull();
    expect(validateAlert(setIn(a, "schedule.once", "bad"))).toBe("日付を入力してください。");
    expect(validateAlert(setIn(a, "schedule.times.list", ["99:99"]))).toBe("時刻が正しくありません。");
  });

  it("元のデータを書き換えずに編集中の値を更新する", () => {
    const a: AlertDef = newCustomAlert("x");
    const b: AlertDef = setIn(a, "schedule.interval.from", "08:00");
    expect(b.schedule.interval.from).toBe("08:00");
    expect(a.schedule.interval.from).toBe("09:00");
  });

  it("テキスト入力を解析する", () => {
    expect(parseMessages(" one \r\n\n two\n")).toEqual(["one", "two"]);
    expect(parseEmojis("  a  b ")).toEqual(["a", "b"]);
    expect(toMinutes("1", "30")).toBe(90);
    expect(toMinutes("", "x")).toBe(0);
  });

  it("時刻の一覧を編集する", () => {
    expect(canAddTime(["12:00"], "12:00")).toBe(false);
    expect(canAddTime(["12:00"], "")).toBe(false);
    expect(canAddTime(["12:00"], "08:00")).toBe(true);
    expect(addTime(["12:00"], "08:00")).toEqual(["08:00", "12:00"]);
    expect(addTime(["12:00"], "12:00")).toEqual(["12:00"]);
    expect(removeTime(["08:00", "12:00"], "08:00")).toEqual(["12:00"]);
  });

  it("繰り返しなしの日付を決める", () => {
    expect(onceDate(true, "", "2026-10-10")).toBe("2026-10-10");
    expect(onceDate(true, "2027-01-02", "2026-10-10")).toBe("2027-01-02");
    expect(onceDate(false, "2027-01-02", "2026-10-10")).toBe("");
  });

  it("アラートの変更内容を組み立てて適用する", () => {
    const s = defaultSettings();
    const c: AlertDef = newCustomAlert("c1");
    const withC = withAlertsPatch(s, { custom: [c] });
    expect(s.alerts.custom).toEqual([]);
    const renamed: AlertDef = { ...c, name: "B" };
    expect(alertsPatchFor(withC.alerts, renamed)).toEqual({ custom: [renamed] });
    const teiji: AlertDef = { ...s.alerts.teiji, enabled: false };
    expect(alertsPatchFor(s.alerts, teiji)).toEqual({ teiji });
    expect(removeCustomAlert([c, renamed], "c1")).toEqual([]);
  });

  it("番号付きのカスタムアラートを作る", () => {
    const a: AlertDef = createCustomAlert([newCustomAlert("x")], 36);
    expect(a.id).toBe("custom-10");
    expect(a.name).toBe("カスタム 2");
  });
});
