import { h } from "@/renderer/dom";

type TokenDoc = readonly [token: string, description: string];

export const TOKENS: readonly TokenDoc[] = [
  ["YYYY", "年 (2026)"],
  ["YY", "年 下2桁 (26)"],
  ["M / MM", "月 (1 / 01)"],
  ["MMM / MMMM", "月名 (Oct / October)"],
  ["D / DD", "日 (5 / 05)"],
  ["week / ddd", "曜日 短縮 (Sat / 土)"],
  ["dddd", "曜日 (Saturday / 土曜日)"],
  ["H / HH", "時 24時間制 (9 / 09)"],
  ["h / hh", "時 12時間制 (9 / 09)"],
  ["A", "午前/午後 (AM / 午前)"],
  ["m / mm", "分 (5 / 05)"],
  ["s / ss", "秒 (5 / 05)"],
  ["[文字]", "[ ] 内はそのまま表示"],
];

/**
 * @description - 早見表の1行を作る
 * @param {TokenDoc} doc - トークンと説明
 * @return {HTMLTableRowElement} - 表の行
 */
const tokenRow = ([token, description]: TokenDoc): HTMLTableRowElement =>
  h("tr", {}, h("th", {}, h("code", {}, token)), h("td", {}, description));

/**
 * @description - すべての早見表にトークン一覧を書き込む
 * @return {void} - なし
 */
export const fillTokenTables = (): void =>
  document.querySelectorAll("table.tokens").forEach((table) => table.append(...TOKENS.map(tokenRow)));
