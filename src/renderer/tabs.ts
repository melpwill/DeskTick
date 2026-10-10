import type { Api } from "@/preload";
import { byId } from "@/renderer/dom";

const DEFAULT_TAB: string = "display";

const PREVIEW_TABS: ReadonlySet<string> = new Set(["display", "format"]);

/**
 * @description - 表示するタブ名を決める
 * @param {string} name - 要求されたタブ名
 * @param {(name: string) => boolean} exists - タブが存在するかの判定
 * @return {string} - 表示するタブ名
 */
export const resolveTab = (name: string, exists: (name: string) => boolean): string =>
  exists(name) ? name : DEFAULT_TAB;

/**
 * @description - プレビューを表示するタブかを判定する
 * @param {string} name - タブ名
 * @return {boolean} - 表示するならtrue
 */
export const hasPreview = (name: string): boolean => PREVIEW_TABS.has(name);

/**
 * @description - タブのパネルがHTML上に存在するかを判定する
 * @param {string} name - タブ名
 * @return {boolean} - 存在すればtrue
 */
const panelExists = (name: string): boolean => document.querySelector(`[data-panel="${name}"]`) !== null;

/**
 * @description - ナビゲーションのタブボタンを取得する
 * @return {HTMLElement[]} - タブボタン
 */
const navButtons = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>("nav button"));

/**
 * @description - 指定したタブを表示する
 * @param {string} requested - 表示したいタブ名
 * @return {void} - なし
 */
export const showTab = (requested: string): void => {
  const name: string = resolveTab(requested, panelExists);
  navButtons().forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll<HTMLElement>("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== name));
  byId("previewWrap").hidden = !hasPreview(name);
};

/**
 * @description - タブの切り替えを初期化し、URLの?tab=で指定されたタブを開く
 * @param {Api} api - 通信API
 * @return {void} - なし
 */
export const initTabs = (api: Api): void => {
  navButtons().forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab!)));
  showTab(new URLSearchParams(location.search).get("tab") ?? DEFAULT_TAB);
  api.onShowTab(showTab);
};
