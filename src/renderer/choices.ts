import type { Api } from "@/preload";
import { byId, h } from "@/renderer/dom";
import { type DisplayInfo } from "@/shared/types";

const MAIN_DISPLAY: DisplayInfo = { index: -1, label: "メインディスプレイ" };

/**
 * @description - <datalist>の候補を差し替える
 * @param {string} id - datalistのid
 * @param {readonly string[]} values - 候補
 * @return {void} - なし
 */
export const fillDatalist = (id: string, values: readonly string[]): void =>
  byId(id).replaceChildren(...values.map((value) => h("option", { value })));

/**
 * @description - ディスプレイの選択肢を作る
 * @param {readonly DisplayInfo[]} displays - 接続中のディスプレイ
 * @return {DisplayInfo[]} - 選択肢
 */
export const displayChoices = (displays: readonly DisplayInfo[]): DisplayInfo[] => [MAIN_DISPLAY, ...displays];

/**
 * @description - フォント欄のプレースホルダーを決める
 * @param {readonly string[]} fonts - 取得できたフォント
 * @return {string} - プレースホルダー
 */
export const fontPlaceholder = (fonts: readonly string[]): string =>
  fonts.length ? "" : "フォント一覧を取得できませんでした";

/**
 * @description - ディスプレイ一覧を取得して選択肢に反映する
 * @param {Api} api - 通信API
 * @return {Promise<void>} - 反映の完了
 */
export const loadDisplays = async (api: Api): Promise<void> => {
  const choices: DisplayInfo[] = displayChoices(await api.listDisplays());
  byId<HTMLSelectElement>("display").replaceChildren(
    ...choices.map((d) => h("option", { value: String(d.index), textContent: d.label })),
  );
};

/**
 * @description - フォント一覧を取得して候補に反映する
 * @param {Api} api - 通信API
 * @return {Promise<void>} - 反映の完了
 */
export const loadFonts = async (api: Api): Promise<void> => {
  const fonts: string[] = await api.listFonts();
  fillDatalist("fontList", fonts);
  byId<HTMLInputElement>("fontFamily").placeholder = fontPlaceholder(fonts);
};
