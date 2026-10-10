// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AlertDef, newCustomAlert } from "@/shared/alerts";
import type { ClockSettings } from "@/shared/settings";
import { type AlertsPanel, createAlertsPanel } from "@/renderer/alertsPanel";
import { asApi, defaultSettings, type MockApi, mockApi } from "@test/renderer/helpers";

let m: MockApi;
let listEl: HTMLElement;
let editorEl: HTMLElement;
let panel: AlertsPanel;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 10, 9, 0, 0));
  document.body.innerHTML = "";
  listEl = document.createElement("div");
  editorEl = document.createElement("div");
  document.body.append(listEl, editorEl);
  m = mockApi();
  panel = createAlertsPanel(asApi(m), listEl, editorEl);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * @description - カスタムアラートを含む設定を作る
 * @param {Partial<AlertDef>[]} customs - カスタムアラートの内容
 * @return {ClockSettings} - 設定
 */
const withCustom = (...customs: Partial<AlertDef>[]): ClockSettings => ({
  ...defaultSettings(),
  alerts: {
    ...defaultSettings().alerts,
    custom: customs.map((c, i) => ({ ...newCustomAlert(`c${i + 1}`), ...c })),
  },
});

const items = () => Array.from(listEl.querySelectorAll<HTMLButtonElement>(".alert-item"));
const item = (name: string) => items().find((b) => b.querySelector(".name")!.textContent!.startsWith(name))!;
const heading = () => editorEl.querySelector(".editor-head h3")!.textContent;
const message = () => editorEl.querySelector(".msg")!.textContent;
const rows = () => Array.from(editorEl.querySelectorAll<HTMLElement>(".row"));
const row = (label: string) => rows().find((r) => r.querySelector("label")!.textContent === label)!;
const nextRow = (label: string) => row(label).nextElementSibling as HTMLElement;
const inputs = (r: HTMLElement) => Array.from(r.querySelectorAll("input"));
const button = (text: string, root: HTMLElement = editorEl) =>
  Array.from(root.querySelectorAll("button")).find((b) => b.textContent === text)!;
const dayBox = (label: string) =>
  Array.from(editorEl.querySelectorAll(".days label"))
    .find((l) => l.textContent === label)!
    .querySelector("input")!;
const lastAlerts = () => (m.api.updateSettings.mock.lastCall![0] as { alerts: Record<string, unknown> }).alerts;

/**
 * @description - 値を入力してイベントを発火する
 * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} el - 入力欄
 * @param {string} value - 値
 * @param {string} ev - 発火するイベント名
 * @return {void} - なし
 */
const input = (
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
  ev: string = "input",
): void => {
  el.value = value;
  el.dispatchEvent(new Event(ev));
};

describe("list", () => {
  it("グループ・状態・要約を描画する", () => {
    panel.update(withCustom({ name: "", enabled: false }));
    expect(Array.from(listEl.querySelectorAll(".list-head")).map((x) => x.textContent)).toEqual([
      "基本",
      "食事",
      "カスタム",
    ]);
    expect(items().map((b) => b.querySelector(".name")!.textContent)).toEqual([
      "定時",
      "起立",
      "水分補給",
      "朝食 (オフ)",
      "昼食",
      "夕食 (オフ)",
      "(無題) (オフ)",
    ]);
    expect(item("定時").className).toBe("alert-item active");
    expect(item("朝食").className).toBe("alert-item off");
    expect(item("起立").className).toBe("alert-item");
    expect(item("定時").querySelector(".sum")!.textContent).toBe("18:00 / 平日");
    expect(item("起立").querySelector(".sum")!.textContent).toBe("30分ごと (09:00〜18:00) / 平日");
    expect(listEl.lastElementChild!.textContent).toBe("+ カスタムを追加");
  });

  it("項目を選ぶと対応する編集欄を表示する", () => {
    panel.update(defaultSettings());
    expect(heading()).toBe("定時");
    expect(editorEl.querySelector("p.note")!.textContent).toBe("指定した時刻に1日1回お知らせします。");

    item("起立").click();
    expect(item("起立").classList.contains("active")).toBe(true);
    expect(item("定時").classList.contains("active")).toBe(false);
    expect(heading()).toBe("起立");
    expect(editorEl.querySelector("p.note")!.textContent).toContain("Diaz et al.");

    // 食事には補足説明がなく、文言欄の注記だけが残る
    item("朝食").click();
    expect(heading()).toBe("朝食");
    expect(editorEl.querySelectorAll("p.note").length).toBe(1);
    expect(button("このアラートを削除")).toBeUndefined();
  });

  it("古い一覧項目のクリックは無視する", () => {
    panel.update(withCustom({ name: "Gone" }));
    const stale = item("Gone");
    panel.update(defaultSettings());
    stale.click();
    expect(heading()).toBe("定時");
    expect(listEl.querySelector(".active")!.textContent).toContain("定時");
  });
});

describe("teiji editor", () => {
  beforeEach(() => panel.update(defaultSettings()));

  it("新しい時刻を保存する", () => {
    const time = inputs(row("時刻"))[0];
    expect(time.value).toBe("18:00");
    input(time, "17:30", "change");
    const teiji = lastAlerts().teiji as AlertDef;
    expect(teiji.schedule.times).toEqual({ enabled: true, list: ["17:30"] });
    expect(item("定時").querySelector(".sum")!.textContent).toBe("17:30 / 平日");
  });

  it("時刻を空にしたら消す", () => {
    input(inputs(row("時刻"))[0], "", "change");
    expect((lastAlerts().teiji as AlertDef).schedule.times).toEqual({ enabled: true, list: [] });
    expect(item("定時").querySelector(".sum")!.textContent).toBe("スケジュールなし");
  });

  it("時刻が未設定なら入力欄に既定値を入れる", () => {
    const s = defaultSettings();
    s.alerts.teiji.schedule.times.list = [];
    panel.update(s);
    expect(inputs(row("時刻"))[0].value).toBe("18:00");
  });

  it("曜日の変更を並べ替えて保存する", () => {
    expect(dayBox("月").checked).toBe(true);
    expect(dayBox("日").checked).toBe(false);
    dayBox("日").click();
    expect((lastAlerts().teiji as AlertDef).schedule.days).toEqual([0, 1, 2, 3, 4, 5]);
    dayBox("月").click();
    expect((lastAlerts().teiji as AlertDef).schedule.days).toEqual([0, 2, 3, 4, 5]);
  });

  it("有効/無効を切り替える", () => {
    editorEl.querySelector<HTMLInputElement>(".editor-head input")!.click();
    expect((lastAlerts().teiji as AlertDef).enabled).toBe(false);
    expect(item("定時").className).toBe("alert-item active off");
  });

  it("テスト通知を送る", () => {
    button("テスト通知").click();
    expect(m.api.testAlert).toHaveBeenCalledWith("teiji");
  });
});

describe("interval rows", () => {
  beforeEach(() => {
    panel.update(defaultSettings());
    item("起立").click();
  });

  const [toggle, hours, mins] = [0, 1, 2].map((i) => () => inputs(row("一定間隔"))[i]);
  const from = () => inputs(nextRow("一定間隔"))[0];
  const to = () => inputs(nextRow("一定間隔"))[1];
  const stand = () => lastAlerts().stand as AlertDef;

  it("現在の間隔を表示する", () => {
    expect(toggle().checked).toBe(true);
    expect(hours().value).toBe("0");
    expect(mins().value).toBe("30");
    expect(from().value).toBe("09:00");
    expect(to().value).toBe("18:00");
    expect(message()).toBe("");
  });

  it("オフにしたら入力欄を無効にする", () => {
    toggle().click();
    expect([hours(), mins(), from(), to()].every((i) => i.disabled)).toBe(true);
    expect(stand().schedule.interval.enabled).toBe(false);
    toggle().click();
    expect([hours(), mins(), from(), to()].some((i) => i.disabled)).toBe(false);
    expect(stand().schedule.interval.enabled).toBe(true);
  });

  it("時間と分を保存する", () => {
    input(hours(), "1");
    expect(stand().schedule.interval.minutes).toBe(90);
    input(mins(), "");
    expect(stand().schedule.interval.minutes).toBe(60);
  });

  it("時間帯を保存する", () => {
    input(from(), "08:00", "change");
    expect(stand().schedule.interval.from).toBe("08:00");
    input(to(), "20:00", "change");
    expect(stand().schedule.interval).toEqual({ enabled: true, minutes: 30, from: "08:00", to: "20:00" });
  });

  it.each([
    ["a zero interval", () => input(mins(), "0"), "間隔は1分以上にしてください。"],
    ["an empty window", () => input(from(), "", "change"), "時間帯を入力してください。"],
    ["an empty end", () => input(to(), "", "change"), "時間帯を入力してください。"],
    ["a reversed window", () => input(from(), "19:00", "change"), "時間帯の開始は終了より前にしてください。"],
  ])("%sは保存しない", (_name, act, error) => {
    act();
    expect(message()).toBe(error);
    expect(m.api.updateSettings).not.toHaveBeenCalled();
  });

  it("一定間隔がオフなら間隔の検証をしない", () => {
    toggle().click();
    input(mins(), "0");
    expect(message()).toBe("");
    expect(stand().schedule.interval).toMatchObject({ enabled: false, minutes: 0 });
  });
});

describe("times rows", () => {
  const toggle = () => inputs(row("指定時刻"))[0];
  const timeInput = () => inputs(nextRow("指定時刻"))[0];
  const add = () => button("追加");
  const chips = () => Array.from(editorEl.querySelectorAll(".chip")).map((c) => c.firstChild!.textContent);
  const lunch = () => lastAlerts().lunch as AlertDef;

  it("オフで時刻がなければ無効にして案内を表示する", () => {
    panel.update(defaultSettings());
    item("起立").click();
    expect(toggle().checked).toBe(false);
    expect(timeInput().disabled).toBe(true);
    expect(add().disabled).toBe(true);
    expect(editorEl.querySelector(".chips .hint")!.textContent).toBe("時刻がありません");

    toggle().click();
    expect(timeInput().disabled).toBe(false);
    expect(add().disabled).toBe(false);
    expect((lastAlerts().stand as AlertDef).schedule.times.enabled).toBe(true);
  });

  it("時刻を追加し、重複・不正な時刻は拒否し、チップを削除できる", () => {
    panel.update(defaultSettings());
    item("昼食").click();
    expect(chips()).toEqual(["12:00"]);

    input(timeInput(), "08:15", "change");
    add().click();
    expect(chips()).toEqual(["08:15", "12:00"]);
    expect(timeInput().value).toBe("");
    expect(lunch().schedule.times.list).toEqual(["08:15", "12:00"]);
    expect(m.api.updateSettings).toHaveBeenCalledTimes(1);

    input(timeInput(), "12:00", "change");
    add().click();
    timeInput().value = "";
    add().click();
    expect(m.api.updateSettings).toHaveBeenCalledTimes(1);
    expect(chips()).toEqual(["08:15", "12:00"]);

    editorEl.querySelector<HTMLButtonElement>(".chip button")!.click();
    expect(chips()).toEqual(["12:00"]);
    expect(lunch().schedule.times.list).toEqual(["12:00"]);
  });

  it("オフならチップの削除を無効にする", () => {
    panel.update(defaultSettings());
    item("昼食").click();
    toggle().click();
    expect(editorEl.querySelector<HTMLButtonElement>(".chip button")!.disabled).toBe(true);
    expect(lunch().schedule.times.enabled).toBe(false);
    // 定時以外の固定アラートの曜日選択
    dayBox("日").click();
    expect(lunch().schedule.days).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("保存済みの不正な時刻はエラーにする", () => {
    const s = defaultSettings();
    s.alerts.lunch.schedule.times.list = ["25:00"];
    panel.update(s);
    item("昼食").click();
    expect(message()).toBe("時刻が正しくありません。");
    input(editorEl.querySelector<HTMLInputElement>(".row input[type=text]")!, "Lunch!");
    expect(m.api.updateSettings).not.toHaveBeenCalled();
  });
});

describe("text fields", () => {
  beforeEach(() => panel.update(defaultSettings()));

  it("タイトル・メッセージ・絵文字を保存する", () => {
    input(inputs(row("タイトル"))[0], "Go home");
    expect((lastAlerts().teiji as AlertDef).title).toBe("Go home");

    input(row("メッセージ").querySelector("textarea")!, " one \r\n\n two\n");
    expect((lastAlerts().teiji as AlertDef).messages).toEqual(["one", "two"]);

    input(inputs(row("絵文字"))[0], "  a  b ");
    expect((lastAlerts().teiji as AlertDef).emojis).toEqual(["a", "b"]);
  });

  it("現在の文言を表示する", () => {
    expect(inputs(row("タイトル"))[0].value).toBe("定時になりました {emoji}");
    expect(row("メッセージ").querySelector("textarea")!.value).toBe(defaultSettings().alerts.teiji.messages.join("\n"));
    expect(inputs(row("絵文字"))[0].value).toBe("🌇 🛀 ✨ 🍵 😌");
  });
});

describe("custom alerts", () => {
  it("カスタムアラートを追加し、反映されたら開く", () => {
    const s = defaultSettings();
    panel.update(s);
    button("+ カスタムを追加", listEl).click();
    const custom = (lastAlerts().custom as AlertDef[])[0];
    expect(lastAlerts().custom).toHaveLength(1);
    expect(custom.id).toBe(`custom-${Date.now().toString(36)}`);
    expect(custom.name).toBe("カスタム 1");
    // 編集画面は返事を待ってから開く
    expect(heading()).toBe("定時");

    panel.update({ ...s, alerts: { ...s.alerts, custom: [custom] } });
    expect(heading()).toBe("カスタム 1");
    expect(item("カスタム 1").classList.contains("active")).toBe(true);
    expect(inputs(row("名前"))[0].value).toBe("カスタム 1");
  });

  it("追加の反映待ちの間は古い編集欄の変更を無視する", () => {
    panel.update(defaultSettings());
    const title = inputs(row("タイトル"))[0];
    button("+ カスタムを追加", listEl).click();
    m.api.updateSettings.mockClear();
    input(title, "late edit");
    expect(m.api.updateSettings).not.toHaveBeenCalled();
  });

  it("新しいアラートには既存の後に続く番号を付ける", () => {
    panel.update(withCustom({ name: "A" }));
    button("+ カスタムを追加", listEl).click();
    const custom = lastAlerts().custom as AlertDef[];
    expect(custom.map((c) => c.name)).toEqual(["A", "カスタム 2"]);
  });

  it("名前を編集し、他のカスタムアラートは保持する", () => {
    panel.update(withCustom({ name: "A" }, { name: "B" }));
    item("B").click();
    const name = inputs(row("名前"))[0];
    input(name, "Bee");
    expect(heading()).toBe("Bee");
    expect((lastAlerts().custom as AlertDef[]).map((c) => c.name)).toEqual(["A", "Bee"]);
    expect(item("Bee").classList.contains("active")).toBe(true);

    input(name, "");
    expect(heading()).toBe("(無題)");
    expect((lastAlerts().custom as AlertDef[]).map((c) => c.name)).toEqual(["A", ""]);
  });

  it("毎週と繰り返しなしを切り替える", () => {
    panel.update(withCustom({ name: "A" }));
    item("A").click();
    const mode = row("繰り返し").querySelector("select")!;
    const date = inputs(row("日付"))[0];
    expect(mode.value).toBe("weekly");
    expect(row("曜日").hidden).toBe(false);
    expect(row("日付").hidden).toBe(true);

    input(mode, "once", "change");
    expect(date.value).toBe("2026-10-10");
    expect(row("曜日").hidden).toBe(true);
    expect(row("日付").hidden).toBe(false);
    expect((lastAlerts().custom as AlertDef[])[0].schedule.once).toBe("2026-10-10");

    input(date, "2026-12-24", "change");
    expect((lastAlerts().custom as AlertDef[])[0].schedule.once).toBe("2026-12-24");

    input(mode, "weekly", "change");
    expect(date.value).toBe("");
    expect(row("曜日").hidden).toBe(false);
    expect((lastAlerts().custom as AlertDef[])[0].schedule.once).toBe("");

    // 非表示の間に選んだ日付は「繰り返しなし」に切り替えたときに使われる
    date.value = "2027-01-02";
    input(mode, "once", "change");
    expect((lastAlerts().custom as AlertDef[])[0].schedule.once).toBe("2027-01-02");

    dayBox("土").click();
    expect((lastAlerts().custom as AlertDef[])[0].schedule.days).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("日付指定のアラートは繰り返しなしで表示する", () => {
    const base = newCustomAlert("x");
    panel.update(withCustom({ name: "Dated", schedule: { ...base.schedule, once: "2026-11-01" } }));
    item("Dated").click();
    expect(row("繰り返し").querySelector("select")!.value).toBe("once");
    expect(inputs(row("日付"))[0].value).toBe("2026-11-01");
    expect(row("曜日").hidden).toBe(true);
  });

  it("不正な日付は保存しない", () => {
    const base = newCustomAlert("x");
    panel.update(withCustom({ name: "Bad", schedule: { ...base.schedule, once: "someday" } }));
    item("Bad").click();
    expect(message()).toBe("日付を入力してください。");
    input(inputs(row("名前"))[0], "Still bad");
    expect(m.api.updateSettings).not.toHaveBeenCalled();
    expect(message()).toBe("日付を入力してください。");
  });

  it("削除をキャンセルしたらアラートを残す", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    panel.update(withCustom({ name: "A" }));
    item("A").click();
    button("このアラートを削除").click();
    expect(confirm).toHaveBeenCalledWith("このアラートを削除しますか?");
    expect(m.api.updateSettings).not.toHaveBeenCalled();
    expect(heading()).toBe("A");
  });

  it("アラートを削除し、定時の表示に戻る", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const s = withCustom({ name: "A" }, { name: "B" });
    panel.update(s);
    item("A").click();
    button("このアラートを削除").click();
    expect(lastAlerts().custom).toEqual([s.alerts.custom[1]]);

    panel.update({ ...s, alerts: { ...s.alerts, custom: [s.alerts.custom[1]] } });
    expect(heading()).toBe("定時");
    expect(item("定時").classList.contains("active")).toBe(true);
  });
});

describe("rendering edge cases", () => {
  it("名前のないアラートの見出しには（無題）と表示する", () => {
    panel.update(withCustom({ name: "" }));
    item("(無題)").click();
    expect(heading()).toBe("(無題)");
    expect(inputs(row("名前"))[0].value).toBe("");
  });

  it("選択中のアラートが外部でなくなったら定時の表示に戻る", () => {
    panel.update(withCustom({ name: "A" }));
    item("A").click();
    panel.update(defaultSettings());
    expect(heading()).toBe("定時");
    expect(item("定時").classList.contains("active")).toBe(true);
  });

  it("undefinedのプロパティは設定しない", () => {
    const s = defaultSettings();
    (s.alerts.teiji as Partial<AlertDef>).title = undefined;
    panel.update(s);
    expect(inputs(row("タイトル"))[0].value).toBe("");
  });
});

describe("update", () => {
  it("自分の変更の反映では編集欄を描画し直さない", () => {
    const s = defaultSettings();
    panel.update(s);
    const title = inputs(row("タイトル"))[0];
    input(title, "A");
    input(title, "AB");
    expect(m.api.updateSettings).toHaveBeenCalledTimes(2);

    // 古い返事 ("A") が届く: 一覧は更新し、編集画面はそのまま
    const echo1 = defaultSettings();
    echo1.alerts.teiji.title = "A";
    echo1.alerts.teiji.name = "Echo";
    panel.update(echo1);
    expect(inputs(row("タイトル"))[0]).toBe(title);
    expect(title.value).toBe("AB");
    expect(item("Echo")).toBeDefined();

    // 最後の返事は下書きと一致: 編集画面はそのまま
    const echo2 = defaultSettings();
    echo2.alerts.teiji.title = "AB";
    panel.update(echo2);
    expect(inputs(row("タイトル"))[0]).toBe(title);

    // 返事待ちがなく内容も同じ: 編集画面はそのまま
    panel.update(structuredClone(echo2));
    expect(inputs(row("タイトル"))[0]).toBe(title);

    // 外部からの変更: 編集画面を描画し直す
    const ext = defaultSettings();
    ext.alerts.teiji.title = "External";
    panel.update(ext);
    expect(inputs(row("タイトル"))[0]).not.toBe(title);
    expect(inputs(row("タイトル"))[0].value).toBe("External");
  });
});
