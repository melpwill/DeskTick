import { formatClock } from "@/shared/format";
import { type ClockSettings, fontStack, toRgba } from "@/shared/settings";

export interface ClockElements {
  box: HTMLElement;
  line1: HTMLElement;
  line2: HTMLElement;
}

const TEXT_SHADOW: string = "0.7px 0.7px 4px rgba(0, 0, 0, 0.5)";

/**
 * @description - 設定から外枠に適用するスタイルを組み立てる
 * @param {Readonly<ClockSettings>} s - 時計の設定
 * @return {Partial<CSSStyleDeclaration>} - 適用するスタイル
 */
const boxStyle = (s: Readonly<ClockSettings>): Partial<CSSStyleDeclaration> => ({
  fontFamily: fontStack(s.font.family),
  fontWeight: String(s.font.weight),
  color: toRgba(s.foreground),
  background: toRgba(s.background),
  padding: `${s.padding}px`,
  borderRadius: `${s.cornerRadius}px`,
  textShadow: s.shadow ? TEXT_SHADOW : "none",
});

/**
 * @description - 1 行分の文字サイズと表示/非表示を適用する
 * @param {HTMLElement} line - 行の要素
 * @param {number} size - 文字サイズ
 * @param {string} pattern - その行の書式パターン
 * @return {void} - なし
 */
const applyLineStyle = (line: HTMLElement, size: number, pattern: string): void => {
  line.style.fontSize = `${size}px`;
  line.hidden = pattern === "";
};

/**
 * @description - 時計の見た目をDOMに適用する
 * @param {ClockElements} el - 時計のDOM要素
 * @param {ClockSettings} s - 時計の設定
 * @return {void} - なし
 */
export const applyClockStyle = (el: ClockElements, s: ClockSettings): void => {
  Object.assign(el.box.style, boxStyle(s));
  applyLineStyle(el.line1, s.font.line1Size, s.format.line1);
  applyLineStyle(el.line2, s.font.line2Size, s.format.line2);
};

/**
 * @description - 現在時刻を書式に従って2行に描画する
 * @param {ClockElements} el - 時計のDOM要素
 * @param {ClockSettings} s - 時計の設定
 * @param {Date} now - 表示する日時
 * @return {void} - なし
 */
export const renderClockText = (el: ClockElements, s: ClockSettings, now: Date): void => {
  el.line1.textContent = formatClock(now, s.format.line1, s.locale, s.timeZone);
  el.line2.textContent = formatClock(now, s.format.line2, s.locale, s.timeZone);
};
