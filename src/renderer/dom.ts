export type Child = Node | string | null | false;
export type Props = Readonly<Record<string, unknown>>;
export type ValueElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * @description - idから要素を取得する
 * @param {string} id - 要素のid
 * @return {T} - 取得した要素
 */
export const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/**
 * @description - 描画対象となる子要素かを判定する
 * @param {Child} child - 判定する子要素
 * @return {boolean} - 描画対象ならtrue
 */
const isPresent = (child: Child): child is Node | string => child !== null && child !== false;

/**
 * @description - 条件付きで渡された子要素から描画対象だけを取り出す
 * @param {Child[]} children - 子要素の候補
 * @return {(Node | string)[]} - 描画対象の子要素
 */
export const present = (children: readonly Child[]): (Node | string)[] => children.filter(isPresent);

/**
 * @description - プロパティ1件を要素へ反映する
 * @param {HTMLElement} el - 対象の要素
 * @param {string} key - プロパティ名
 * @param {unknown} value - 設定する値
 * @return {void} - なし
 */
const applyProp = (el: HTMLElement, key: string, value: unknown): void => {
  if (value === undefined) return;
  if (key === "class") el.className = String(value);
  else if (key.startsWith("on")) el.addEventListener(key.slice(2), value as EventListener);
  else Reflect.set(el, key, value);
};

/**
 * @description - 小さなDOMビルダー
 * @param {K} tag - タグ名
 * @param {Props} props - プロパティ
 * @param {Child[]} children - 子要素
 * @return {HTMLElementTagNameMap[K]} - 生成した要素
 */
export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] => {
  const el: HTMLElementTagNameMap[K] = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => applyProp(el, key, value));
  el.append(...present(children));
  return el;
};

/**
 * @description - ラベル付きのフォーム行を生成する
 * @param {string} label - 行のラベル
 * @param {Child[]} content - 行の中身
 * @return {HTMLDivElement} - 生成した行
 */
export const row = (label: string, ...content: Child[]): HTMLDivElement =>
  h("div", { class: "row" }, h("label", {}, label), h("div", { class: "inline" }, ...content));

/**
 * @description - イベント発生元のフォーム部品の値を取得する
 * @param {Event} e - イベント
 * @return {string} - 入力値
 */
export const targetValue = (e: Event): string => (e.target as ValueElement).value;

/**
 * @description - イベント発生元のチェックボックスの状態を取得する
 * @param {Event} e - イベント
 * @return {boolean} - チェックされていればtrue
 */
export const targetChecked = (e: Event): boolean => (e.target as HTMLInputElement).checked;
