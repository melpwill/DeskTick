import { clamp, get, set } from "lodash-es";
import { type FieldValue, validateSetting } from "@/renderer/settingsValidation";
import { type ClockSettings, type DeepPartial } from "@/shared/settings";

export type Field = HTMLInputElement | HTMLSelectElement;

export type PatchHandler = (patch: DeepPartial<ClockSettings>) => void;

/**
 * @description - 入力欄が結び付く設定キーを返す
 * @param {Field} el - 入力欄
 * @return {string} - 設定キー
 */
const keyOf = (el: Field): string => el.dataset.key!;

/**
 * @description - チェックボックスかを判定する
 * @param {Field} el - 入力欄
 * @return {boolean} - チェックボックスならtrue
 */
const isCheckbox = (el: Field): el is HTMLInputElement => el instanceof HTMLInputElement && el.type === "checkbox";

/**
 * @description - 数値として扱う入力欄かを判定する
 * @param {Field} el - 入力欄
 * @return {boolean} - 数値ならtrue
 */
const isNumeric = (el: Field): boolean =>
  el.dataset.type === "number" || (el instanceof HTMLInputElement && (el.type === "number" || el.type === "range"));

/**
 * @description - 確定時に前後の空白を除くテキスト欄かを判定する
 * @param {Field} el - 入力欄
 * @return {boolean} - 空白を除くならtrue
 */
const isTrimmedText = (el: Field): boolean =>
  el instanceof HTMLInputElement && el.type === "text" && Boolean(el.dataset.commit);

/**
 * @description - ユーザーが入力中の欄かを判定する
 * @param {Field} el - 入力欄
 * @return {boolean} - 入力中ならtrue
 */
const isTyping = (el: Field): boolean =>
  el === document.activeElement && el instanceof HTMLInputElement && (el.type === "text" || el.type === "number");

/**
 * @description - 数値欄の値を読み取る
 * @param {Field} el - 入力欄
 * @return {number | undefined} - 数値
 */
const readNumber = (el: Field): number | undefined =>
  el.value === ""
    ? undefined
    : el instanceof HTMLInputElement
      ? clamp(Number(el.value), Number(el.min), Number(el.max))
      : Number(el.value);

/**
 * @description - 入力欄の種類に応じて値を読み取る
 * @param {Field} el - 入力欄
 * @return {FieldValue | undefined} - 読み取った値
 */
export const readField = (el: Field): FieldValue | undefined =>
  isCheckbox(el) ? el.checked : isNumeric(el) ? readNumber(el) : isTrimmedText(el) ? el.value.trim() : el.value;

/**
 * @description - 入力欄に値を書き込む
 * @param {Field} el - 入力欄
 * @param {unknown} value - 書き込む値
 * @return {void} - なし
 */
const writeField = (el: Field, value: unknown): void => {
  if (isCheckbox(el)) el.checked = Boolean(value);
  else el.value = String(value ?? "");
};

/**
 * @description - 入力欄のエラー表示を更新する
 * @param {Field} el - 入力欄
 * @param {string | null} error - エラーメッセージ
 * @return {void} - なし
 */
const showFieldError = (el: Field, error: string | null): void => {
  const msg: HTMLElement | null = document.querySelector<HTMLElement>(`[data-msg="${keyOf(el)}"]`);
  if (msg) msg.textContent = error ?? "";
  el.classList.toggle("invalid", error !== null);
};

/**
 * @description - 0〜1の割合をパーセント表記にする
 * @param {unknown} ratio - 割合
 * @return {string} - パーセント表記
 */
export const formatPercent = (ratio: unknown): string => `${Math.round(Number(ratio) * 100)}%`;

/**
 * @description - 設定キーと値から、その1項目だけを変更する差分を作る
 * @param {string} key - 設定キー
 * @param {FieldValue} value - 値
 * @return {DeepPartial<ClockSettings>} - 設定の差分
 */
export const buildPatch = (key: string, value: FieldValue): DeepPartial<ClockSettings> => set({}, key, value);

/**
 * @description - 設定の内容を全入力欄とパーセント表示に反映する
 * @param {readonly Field[]} fields - 入力欄
 * @param {ClockSettings} s - 設定
 * @return {void} - なし
 */
export const fillFields = (fields: readonly Field[], s: ClockSettings): void => {
  fields
    .filter((el) => !isTyping(el))
    .forEach((el) => {
      writeField(el, get(s, keyOf(el)));
      showFieldError(el, null);
    });
  document
    .querySelectorAll<HTMLElement>("[data-percent]")
    .forEach((out) => (out.textContent = formatPercent(get(s, out.dataset.percent!))));
};

/**
 * @description - 入力欄の値を検証し、問題なければ差分を通知する
 * @param {Field} el - 入力欄
 * @param {PatchHandler} onPatch - 差分の通知先
 * @return {void} - なし
 */
const commitField = (el: Field, onPatch: PatchHandler): void => {
  const value: FieldValue | undefined = readField(el);
  if (value === undefined) return;
  const error: string | null = validateSetting(keyOf(el), value);
  showFieldError(el, error);
  if (error === null) onPatch(buildPatch(keyOf(el), value));
};

/**
 * @description - 値を確定するイベント名を決める
 * @param {Field} el - 入力欄
 * @return {string} - イベント名
 */
const commitEventOf = (el: Field): string =>
  el.dataset.commit ?? (isCheckbox(el) || el instanceof HTMLSelectElement ? "change" : "input");

/**
 * @description - 全入力欄の変更を設定の差分として通知するようにする
 * @param {readonly Field[]} fields - 入力欄
 * @param {PatchHandler} onPatch - 差分の通知先
 * @return {void} - なし
 */
export const bindFields = (fields: readonly Field[], onPatch: PatchHandler): void =>
  fields.forEach((el) => el.addEventListener(commitEventOf(el), () => commitField(el, onPatch)));
