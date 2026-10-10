import { type AlertDraft, createDraft } from "@/renderer/alertDraft";
import { displayName, isFixed, noteFor, parseEmojis, parseMessages, validateAlert } from "@/renderer/alertLogic";
import { scheduleRows } from "@/renderer/alertScheduleRows";
import { type Child, h, present, row, targetChecked, targetValue } from "@/renderer/dom";
import { type AlertDef } from "@/shared/alerts";

export interface AlertEditorHandlers {
  /**
   * @description - 下書きが変更されたときに呼ばれる
   * @param {AlertDef} next - 変更後の下書き
   * @param {boolean} valid - 検証を通ったか
   * @return {void} - なし
   */
  onEdit(next: AlertDef, valid: boolean): void;
  /**
   * @description - 「テスト通知」が押されたときに呼ばれる
   * @param {string} id - アラートのid
   * @return {void} - なし
   */
  onTest(id: string): void;
  /**
   * @description - 「このアラートを削除」が押されたときに呼ばれる
   * @param {string} id - アラートのid
   * @return {void} - なし
   */
  onRemove(id: string): void;
}

/**
 * @description - 見出しを作る
 * @param {AlertDraft} draft - 下書き
 * @param {HTMLHeadingElement} title - 名前を表示する見出し
 * @return {HTMLDivElement} - 見出し部分
 */
const headSection = (draft: AlertDraft, title: HTMLHeadingElement): HTMLDivElement =>
  h(
    "div",
    { class: "editor-head" },
    title,
    h(
      "label",
      { class: "toggle" },
      h("input", {
        type: "checkbox",
        checked: draft.current().enabled,
        onchange: (e: Event) => draft.change("enabled", targetChecked(e)),
      }),
      "有効",
    ),
  );

/**
 * @description - カスタムアラートの「名前」行を作る
 * @param {AlertDraft} draft - 下書き
 * @param {HTMLHeadingElement} title - 名前を表示する見出し
 * @return {HTMLDivElement} - 行
 */
const nameRow = (draft: AlertDraft, title: HTMLHeadingElement): HTMLDivElement =>
  row(
    "名前",
    h("input", {
      type: "text",
      value: draft.current().name,
      oninput: (e: Event) => {
        title.textContent = displayName(targetValue(e));
        draft.change("name", targetValue(e));
      },
    }),
  );

/**
 * @description - 「文言」欄を作る
 * @param {AlertDraft} draft - 下書き
 * @return {Child[]} - 行
 */
const textRows = (draft: AlertDraft): Child[] => {
  const a: AlertDef = draft.current();
  return [
    row(
      "タイトル",
      h("input", { type: "text", value: a.title, oninput: (e: Event) => draft.change("title", targetValue(e)) }),
    ),
    row(
      "メッセージ",
      h("textarea", {
        rows: 4,
        value: a.messages.join("\n"),
        oninput: (e: Event) => draft.change("messages", parseMessages(targetValue(e))),
      }),
    ),
    row(
      "絵文字",
      h("input", {
        type: "text",
        value: a.emojis.join(" "),
        oninput: (e: Event) => draft.change("emojis", parseEmojis(targetValue(e))),
      }),
    ),
    h(
      "p",
      { class: "note" },
      "メッセージは1行に1つ。通知のたびにランダムで1つ選ばれます。",
      h("br"),
      "絵文字はスペース区切り。タイトルやメッセージ中の {emoji} がランダムな1つに置き換わります。",
    ),
  ];
};

/**
 * @description - 選択中のアラートの編集画面を描画する
 * @param {HTMLElement} root - 描画先
 * @param {AlertDef} src - 編集するアラート
 * @param {AlertEditorHandlers} handlers - 通知先
 * @return {void} - なし
 */
export const renderAlertEditor = (root: HTMLElement, src: AlertDef, handlers: AlertEditorHandlers): void => {
  const custom: boolean = !isFixed(src.id);
  const msg: HTMLDivElement = h("div", { class: "msg" });

  /**
   * @description - 検証結果をメッセージ欄に表示する
   * @param {AlertDef} a - 検証するアラート
   * @return {boolean} - 検証を通ったらtrue
   */
  const check = (a: AlertDef): boolean => {
    const error: string | null = validateAlert(a);
    msg.textContent = error ?? "";
    return error === null;
  };

  const draft: AlertDraft = createDraft(src, (next) => handlers.onEdit(next, check(next)));
  const title: HTMLHeadingElement = h("h3", {}, displayName(src.name));
  const note: string | null = noteFor(src.id);

  root.replaceChildren(
    ...present([
      headSection(draft, title),
      custom && nameRow(draft, title),
      note !== null && h("p", { class: "note" }, note),
      h("h3", {}, "スケジュール"),
      ...scheduleRows(draft, custom),
      msg,
      h("h3", {}, "文言"),
      ...textRows(draft),
      h(
        "div",
        { class: "editor-foot" },
        h("button", { class: "btn", onclick: () => handlers.onTest(src.id) }, "テスト通知"),
        custom && h("button", { class: "btn danger", onclick: () => handlers.onRemove(src.id) }, "このアラートを削除"),
      ),
    ]),
  );
  check(src);
};
