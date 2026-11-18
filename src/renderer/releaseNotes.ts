import type { Api } from "@/preload";
import { h } from "@/renderer/dom";
import { type ReleaseNotesResult } from "@/shared/types";
import { compareVersions, isNewerVersion, parseVersion, type Version } from "@/shared/version";

export interface ReleaseNote {
  /** "1.2.3"の形のバージョン */
  readonly version: string;
  /** 更新した日時（エポックミリ秒） */
  readonly publishedAt: number | null;
  /** GitHubがMarkdownから作ったHTML（そのまま画面に入れない） */
  readonly html: string;
}

export type NoteSelector = (notes: readonly ReleaseNote[]) => ReleaseNote[];

/** 中身ごと捨てる要素 */
const DROPPED: ReadonlySet<string> = new Set<string>([
  "script",
  "style",
  "template",
  "noscript",
  "svg",
  "math",
  "img",
  "picture",
  "video",
  "audio",
  "iframe",
  "object",
  "embed",
  "canvas",
  "form",
  "button",
  "input",
  "select",
  "textarea",
]);

/** 作り直して残す要素（属性は付けない）。ここにない要素は中身だけ残す */
const KEPT: Readonly<Record<string, keyof HTMLElementTagNameMap>> = {
  h1: "h5",
  h2: "h5",
  h3: "h5",
  h4: "h5",
  h5: "h5",
  h6: "h5",
  p: "p",
  ul: "ul",
  ol: "ol",
  li: "li",
  pre: "pre",
  code: "code",
  strong: "strong",
  b: "strong",
  em: "em",
  i: "em",
  del: "del",
  s: "del",
  blockquote: "blockquote",
  br: "br",
  hr: "hr",
  table: "table",
  tr: "tr",
  th: "th",
  td: "td",
};

/**
 * @description - フィードのentryの子要素の文字列を返す
 * @param {Element} entry - entry要素
 * @param {string} tag - 子要素の名前
 * @return {string} - 文字列（なければ空文字）
 */
const childText = (entry: Element, tag: string): string => entry.getElementsByTagName(tag)[0]?.textContent ?? "";

/**
 * @description - フィードのentry1件からリリースノートを取り出す
 * @param {Element} entry - entry要素
 * @return {[Version, ReleaseNote] | null} - [並べ替え用のバージョン, リリースノート]。タグがバージョンでなければnull
 */
const parseEntry = (entry: Element): [Version, ReleaseNote] | null => {
  const id: string = childText(entry, "id");
  const v: Version | null = parseVersion(id.slice(id.lastIndexOf("/") + 1));
  if (!v) return null;
  const updated: number = Date.parse(childText(entry, "updated"));
  return [
    v,
    { version: v.join("."), publishedAt: Number.isFinite(updated) ? updated : null, html: childText(entry, "content") },
  ];
};

/**
 * @description - GitHubのリリースのAtomフィードからリリースノートを取り出す
 * @param {string} xml - フィード
 * @return {ReleaseNote[] | null} - 新しいバージョンから順のリリースノート。フィードとして読めなければnull
 */
export const parseFeed = (xml: string): ReleaseNote[] | null => {
  const doc: Document = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0 || doc.documentElement.localName !== "feed") return null;
  return Array.from(doc.getElementsByTagName("entry"))
    .map(parseEntry)
    .filter((x: [Version, ReleaseNote] | null): x is [Version, ReleaseNote] => x !== null)
    .sort((a: [Version, ReleaseNote], b: [Version, ReleaseNote]) => compareVersions(b[0], a[0]))
    .map(([, note]: [Version, ReleaseNote]) => note);
};

/**
 * @description - HTMLのノードを、許可した要素と文字だけで作り直す
 * @param {Node} node - 元のノード
 * @return {Node[]} - 作り直したノード
 */
const rebuild = (node: Node): Node[] => {
  if (node.nodeType === Node.TEXT_NODE) return [document.createTextNode((node as Text).data)];
  if (node.nodeType !== Node.ELEMENT_NODE || DROPPED.has((node as Element).localName)) return [];
  const children: Node[] = Array.from(node.childNodes).flatMap(rebuild);
  const tag: keyof HTMLElementTagNameMap | undefined = KEPT[(node as Element).localName];
  return tag ? [h(tag, {}, ...children)] : children;
};

/**
 * @description - リリースノートのHTMLを、見出し・段落・箇条書きなどの要素と文字だけにする（属性・リンク・画像は捨てる）
 * @param {string} html - GitHubが作ったHTML
 * @return {Node[]} - 表示してよいノード
 */
export const sanitizeNote = (html: string): Node[] =>
  Array.from(new DOMParser().parseFromString(html, "text/html").body.childNodes).flatMap(rebuild);

/**
 * @description - 指定の範囲のバージョンのリリースノートだけを残す
 * @param {readonly ReleaseNote[]} notes - リリースノート
 * @param {string | null} after - このバージョンより新しいものだけ残す（nullなら下限なし）
 * @param {string} upTo - このバージョンまで残す
 * @return {ReleaseNote[]} - 範囲内のリリースノート
 */
export const notesBetween = (notes: readonly ReleaseNote[], after: string | null, upTo: string): ReleaseNote[] =>
  notes.filter(
    (n: ReleaseNote) => (after === null || isNewerVersion(n.version, after)) && !isNewerVersion(n.version, upTo),
  );

/**
 * @description - リリースノート1件の要素を作る
 * @param {ReleaseNote} n - リリースノート
 * @return {HTMLElement} - 要素
 */
const noteElement = (n: ReleaseNote): HTMLElement => {
  const body: HTMLDivElement = h("div", { class: "release-body" }, ...sanitizeNote(n.html));
  if (!body.textContent.trim()) body.textContent = "（説明はありません）";
  return h(
    "article",
    { class: "release-note" },
    h(
      "h4",
      {},
      `v${n.version}`,
      n.publishedAt !== null &&
        h("span", { class: "note" }, `（${new Date(n.publishedAt).toLocaleDateString("ja-JP")}）`),
    ),
    body,
  );
};

/**
 * @description - 文言を表示する
 * @param {HTMLElement} box - 表示先
 * @param {string} text - 文言
 * @return {void} - なし
 */
const showText = (box: HTMLElement, text: string): void => box.replaceChildren(h("p", { class: "note" }, text));

/**
 * @description - リリースノートを取得し、選んだものを表示する
 * @param {HTMLElement} box - 表示先
 * @param {Api} api - 通信API
 * @param {NoteSelector} select - 表示するリリースノートを選ぶ関数
 * @return {Promise<void>} - 表示の完了
 */
export const showReleaseNotes = async (box: HTMLElement, api: Api, select: NoteSelector): Promise<void> => {
  showText(box, "読み込み中...");
  const r: ReleaseNotesResult = await api.getReleaseNotes();
  if (r.error !== null) return showText(box, `リリースノートを取得できませんでした: ${r.error}`);
  const all: ReleaseNote[] | null = parseFeed(r.feed);
  if (!all) return showText(box, "リリースノートを読み取れませんでした");
  const notes: ReleaseNote[] = select(all);
  if (notes.length === 0) return showText(box, "リリースノートはありません");
  box.replaceChildren(...notes.map(noteElement));
};

/**
 * @description - 折りたたみを開いたときにリリースノートを読み込むようにする
 * @param {HTMLDetailsElement} details - 折りたたみ
 * @param {HTMLElement} box - 表示先
 * @param {Api} api - 通信API
 * @param {NoteSelector} select - 表示するリリースノートを選ぶ関数
 * @return {void} - なし
 */
export const bindReleaseNotes = (
  details: HTMLDetailsElement,
  box: HTMLElement,
  api: Api,
  select: NoteSelector,
): void => {
  details.addEventListener("toggle", () => {
    if (details.open) void showReleaseNotes(box, api, select);
  });
};
