import { sortBy } from "lodash-es";
import { type AlertDraft } from "@/renderer/alertDraft";
import { addTime, canAddTime, DAY_ORDER, onceDate, removeTime, toMinutes } from "@/renderer/alertLogic";
import { type Child, h, row, targetChecked, targetValue } from "@/renderer/dom";
import { type AlertSchedule, localDate } from "@/shared/alerts";

const DEFAULT_TEIJI_TIME: string = "18:00";

/**
 * @description - 曜日のチェックボックス群を作る
 * @param {readonly number[]} days - 選択中の曜日
 * @param {(days: number[]) => void} onChange - 変更後の曜日を受け取るコールバック
 * @return {HTMLElement} - 曜日選択の要素
 */
export const dayPicker = (days: readonly number[], onChange: (days: number[]) => void): HTMLElement => {
  const boxes: HTMLInputElement[] = DAY_ORDER.map(([day]) =>
    h("input", { type: "checkbox", checked: days.includes(day), value: String(day) }),
  );

  /**
   * @description - チェックされた曜日を昇順で通知する
   * @return {void} - なし
   */
  const emit = (): void => onChange(sortBy(boxes.filter((b) => b.checked).map((b) => Number(b.value))));

  boxes.forEach((b) => b.addEventListener("change", emit));
  return h("div", { class: "days" }, ...DAY_ORDER.map(([, label], i) => h("label", {}, boxes[i], label)));
};

/**
 * @description - 「曜日」行を作る
 * @param {AlertDraft} draft - 下書き
 * @return {HTMLDivElement} - 行
 */
const daysRow = (draft: AlertDraft): HTMLDivElement =>
  row(
    "曜日",
    dayPicker(draft.current().schedule.days, (days) => draft.change("schedule.days", days)),
  );

/**
 * @description - 定時アラート用の行を作る
 * @param {AlertDraft} draft - 下書き
 * @return {Child[]} - 行
 */
const teijiRows = (draft: AlertDraft): Child[] => [
  row(
    "時刻",
    h("input", {
      type: "time",
      value: draft.current().schedule.times.list[0] ?? DEFAULT_TEIJI_TIME,
      onchange: (e: Event) => {
        const v: string = targetValue(e);
        draft.change("schedule.times", { enabled: true, list: v ? [v] : [] });
      },
    }),
  ),
  daysRow(draft),
];

/**
 * @description - 相対指定の行を作る
 * @param {AlertDraft} draft - 下書き
 * @return {Child[]} - 行
 */
const intervalRows = (draft: AlertDraft): Child[] => {
  const iv: AlertSchedule["interval"] = draft.current().schedule.interval;
  const hours: HTMLInputElement = h("input", { type: "number", min: 0, max: 23, value: Math.floor(iv.minutes / 60) });
  const mins: HTMLInputElement = h("input", { type: "number", min: 0, max: 59, value: iv.minutes % 60 });
  const from: HTMLInputElement = h("input", { type: "time", value: iv.from });
  const to: HTMLInputElement = h("input", { type: "time", value: iv.to });

  /**
   * @description - 一定間隔がオフのときは入力欄を無効にする
   * @param {boolean} enabled - 一定間隔が有効か
   * @return {void} - なし
   */
  const sync = (enabled: boolean): void => [hours, mins, from, to].forEach((i) => (i.disabled = !enabled));

  /**
   * @description - 時間と分の入力から間隔を更新する
   * @return {void} - なし
   */
  const onDuration = (): void => draft.change("schedule.interval.minutes", toMinutes(hours.value, mins.value));

  hours.addEventListener("input", onDuration);
  mins.addEventListener("input", onDuration);
  from.addEventListener("change", () => draft.change("schedule.interval.from", from.value));
  to.addEventListener("change", () => draft.change("schedule.interval.to", to.value));
  sync(iv.enabled);

  const toggle: HTMLInputElement = h("input", {
    type: "checkbox",
    checked: iv.enabled,
    onchange: (e: Event) => {
      sync(targetChecked(e));
      draft.change("schedule.interval.enabled", targetChecked(e));
    },
  });
  return [
    row("一定間隔", toggle, hours, "時間", mins, "分ごと"),
    row("", from, "〜", to, h("span", { class: "hint" }, "の間 (開始時刻から数えます)")),
  ];
};

/**
 * @description - 絶対指定の行を作る
 * @param {AlertDraft} draft - 下書き
 * @return {Child[]} - 行
 */
const timesRows = (draft: AlertDraft): Child[] => {
  const chips: HTMLDivElement = h("div", { class: "chips" });
  const input: HTMLInputElement = h("input", { type: "time", value: "" });
  const add: HTMLButtonElement = h("button", { class: "btn small" }, "追加");

  /**
   * @description - 時刻を一覧から削除する
   * @param {string} time - 削除する時刻
   * @return {void} - なし
   */
  const remove = (time: string): void => {
    draft.change("schedule.times.list", removeTime(draft.current().schedule.times.list, time));
    renderChips();
  };

  /**
   * @description - 時刻1件分のチップを作る
   * @param {string} time - 時刻
   * @param {boolean} enabled - 指定時刻が有効か
   * @return {HTMLSpanElement} - チップ
   */
  const chip = (time: string, enabled: boolean): HTMLSpanElement =>
    h(
      "span",
      { class: "chip" },
      time,
      h("button", { title: "削除", disabled: !enabled, onclick: () => remove(time) }, "×"),
    );

  /**
   * @description - 時刻のチップと入力欄の有効/無効を描画し直す
   * @return {void} - なし
   */
  const renderChips = (): void => {
    const { enabled, list }: AlertSchedule["times"] = draft.current().schedule.times;
    chips.replaceChildren(
      ...(list.length ? list.map((t) => chip(t, enabled)) : [h("span", { class: "hint" }, "時刻がありません")]),
    );
    input.disabled = !enabled;
    add.disabled = !enabled;
  };

  add.addEventListener("click", () => {
    const { list }: AlertSchedule["times"] = draft.current().schedule.times;
    if (!canAddTime(list, input.value)) return;
    const next: string[] = addTime(list, input.value);
    input.value = "";
    draft.change("schedule.times.list", next);
    renderChips();
  });
  renderChips();

  const toggle: HTMLInputElement = h("input", {
    type: "checkbox",
    checked: draft.current().schedule.times.enabled,
    onchange: (e: Event) => {
      draft.change("schedule.times.enabled", targetChecked(e));
      renderChips();
    },
  });
  return [row("指定時刻", toggle, chips), row("", input, add)];
};

/**
 * @description - カスタムアラート用の繰り返し指定の行を作る
 * @param {AlertDraft} draft - 下書き
 * @return {Child[]} - 行
 */
const repeatRows = (draft: AlertDraft): Child[] => {
  const once: string = draft.current().schedule.once;
  const date: HTMLInputElement = h("input", {
    type: "date",
    value: once,
    onchange: (e: Event) => draft.change("schedule.once", targetValue(e)),
  });
  const days: HTMLDivElement = daysRow(draft);
  const dateRow: HTMLDivElement = row("日付", date);

  /**
   * @description - 繰り返しの種類に応じて曜日行と日付行を出し分ける
   * @param {string} value - schedule.onceの値
   * @return {void} - なし
   */
  const sync = (value: string): void => {
    days.hidden = Boolean(value);
    dateRow.hidden = !value;
  };

  const mode: HTMLSelectElement = h(
    "select",
    {
      onchange: (e: Event) => {
        const next: string = onceDate(targetValue(e) === "once", date.value, localDate(new Date()));
        date.value = next;
        sync(next);
        draft.change("schedule.once", next);
      },
    },
    h("option", { value: "weekly", selected: !once }, "毎週 (曜日を指定)"),
    h("option", { value: "once", selected: Boolean(once) }, "繰り返しなし (日付を指定)"),
  );
  sync(once);
  return [row("繰り返し", mode), days, dateRow];
};

/**
 * @description - アラートの種類に応じたスケジュール欄の行を作る
 * @param {AlertDraft} draft - 下書き
 * @param {boolean} custom - カスタムアラートか
 * @return {Child[]} - 行
 */
export const scheduleRows = (draft: AlertDraft, custom: boolean): Child[] =>
  draft.current().id === "teiji"
    ? teijiRows(draft)
    : [...intervalRows(draft), ...timesRows(draft), ...(custom ? repeatRows(draft) : [daysRow(draft)])];
