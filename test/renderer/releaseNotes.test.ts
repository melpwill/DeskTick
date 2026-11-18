// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadAbout } from "@/renderer/about";
import {
  bindReleaseNotes,
  notesBetween,
  parseFeed,
  type ReleaseNote,
  sanitizeNote,
  showReleaseNotes,
} from "@/renderer/releaseNotes";
import { asApi, feed, feedEntry, flush, loadBody, type MockApi, mockApi } from "@test/renderer/helpers";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const FEED = feed(...["v1.4.0", "v1.3.0", "v1.2.3", "v1.2.0"].map((t) => feedEntry(t, `<p>${t}の変更</p>`)));

/**
 * @description - 作り直したノードをHTMLにする
 * @param {string} html - 元のHTML
 * @return {string} - 作り直した結果のHTML
 */
const clean = (html: string): string => {
  const div = document.createElement("div");
  div.append(...sanitizeNote(html));
  return div.innerHTML;
};

/**
 * @description - 表示されたリリースノートの見出しを返す
 * @param {HTMLElement} box - 表示先
 * @return {string[]} - 見出し
 */
const headings = (box: HTMLElement): string[] => Array.from(box.querySelectorAll("h4")).map((e) => e.textContent!);

/**
 * @description - 折りたたみを開く
 * @param {HTMLDetailsElement} details - 折りたたみ
 * @return {Promise<void>} - 表示の完了
 */
const open = async (details: HTMLDetailsElement): Promise<void> => {
  details.open = true;
  details.dispatchEvent(new Event("toggle"));
  await flush();
};

let m: MockApi;
let box: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = loadBody("settings.html");
  m = mockApi();
  m.api.getReleaseNotes.mockResolvedValue({ feed: FEED, error: null });
  box = document.createElement("div");
});

describe("parseFeed", () => {
  it("タグがバージョンのentryを、新しいバージョンから順に取り出す", () => {
    const notes = parseFeed(
      feed(
        feedEntry("v1.2.0", "<p>A &amp; B</p>", "2026-11-01T00:00:00Z"),
        feedEntry("v1.10.0", "<p>C</p>", "not a date"),
        feedEntry("v1.5.0-rc.1"),
        "<entry><title>idなし</title></entry>",
      ),
    );
    expect(notes).toEqual<ReleaseNote[]>([
      { version: "1.10.0", publishedAt: null, html: "<p>C</p>" },
      { version: "1.2.0", publishedAt: Date.UTC(2026, 10, 1), html: "<p>A &amp; B</p>" },
    ]);
  });

  it("XMLとして読めない・フィードでないものは読まない", () => {
    expect(parseFeed("<html><body>Rate limited")).toBeNull();
    expect(parseFeed("<html><body></body></html>")).toBeNull();
    expect(parseFeed(feed())).toEqual([]);
  });
});

describe("sanitizeNote", () => {
  it("見出し・段落・箇条書きなどを、属性を付けずに作り直す", () => {
    expect(
      clean('<h1 id="x">タイトル</h1><h3>小見出し</h3><p class="a" style="color:red">本文<b>太</b><i>斜</i></p>'),
    ).toBe("<h5>タイトル</h5><h5>小見出し</h5><p>本文<strong>太</strong><em>斜</em></p>");
    expect(clean("<ul><li>一<br>二</li></ul><ol><li><code>x</code></li></ol><hr><pre>a\n b</pre>")).toBe(
      "<ul><li>一<br>二</li></ul><ol><li><code>x</code></li></ol><hr><pre>a\n b</pre>",
    );
    expect(clean("<blockquote><s>旧</s></blockquote><table><tbody><tr><th>h</th><td>d</td></tr></tbody></table>")).toBe(
      "<blockquote><del>旧</del></blockquote><table><tr><th>h</th><td>d</td></tr></table>",
    );
  });

  it("リンクは文字だけ残し、スクリプト・画像・SVG・コメントは捨てる", () => {
    expect(
      clean(
        '<p><a href="javascript:alert(1)" onclick="x()">リンク</a></p><script>alert(1)</script>' +
          '<img src="https://evil.example/a.png" onerror="x()"><!-- c -->' +
          '<div class="markdown-alert"><p><svg><path d="M0"/></svg>Note</p></div>',
      ),
    ).toBe("<p>リンク</p><p>Note</p>");
  });
});

describe("notesBetween", () => {
  it("下限より新しく、上限までのバージョンを残す", () => {
    const notes = parseFeed(FEED)!;
    expect(notesBetween(notes, "1.2.3", "1.4.0").map((n) => n.version)).toEqual(["1.4.0", "1.3.0"]);
    expect(notesBetween(notes, null, "1.2.3").map((n) => n.version)).toEqual(["1.2.3", "1.2.0"]);
  });
});

describe("showReleaseNotes", () => {
  it("取得中を示し、選んだノートを日付付きで表示する", async () => {
    m.api.getReleaseNotes.mockResolvedValue({
      feed: feed(
        feedEntry("v1.3.0", "<h2>変更</h2><ul><li>A</li></ul>", new Date(2026, 10, 1, 12).toISOString()),
        feedEntry("v1.2.0", "<svg></svg>"),
      ),
      error: null,
    });
    const shown = showReleaseNotes(box, asApi(m), (n) => [...n]);
    expect(box.textContent).toBe("読み込み中...");
    await shown;
    expect(headings(box)).toEqual(["v1.3.0（2026/11/1）", "v1.2.0"]);
    const bodies = box.querySelectorAll(".release-body");
    expect(bodies[0].innerHTML).toBe("<h5>変更</h5><ul><li>A</li></ul>");
    expect(bodies[1].textContent).toBe("（説明はありません）");
  });

  it("該当するノートがない・読み取れない・取得できないときは、その旨を表示する", async () => {
    await showReleaseNotes(box, asApi(m), () => []);
    expect(box.textContent).toBe("リリースノートはありません");
    m.api.getReleaseNotes.mockResolvedValue({ feed: "<html>", error: null });
    await showReleaseNotes(box, asApi(m), (n) => [...n]);
    expect(box.textContent).toBe("リリースノートを読み取れませんでした");
    m.api.getReleaseNotes.mockResolvedValue({ feed: "", error: "offline" });
    await showReleaseNotes(box, asApi(m), (n) => [...n]);
    expect(box.textContent).toBe("リリースノートを取得できませんでした: offline");
  });
});

describe("bindReleaseNotes", () => {
  it("開いたときだけ読み込む", async () => {
    const details = document.createElement("details");
    bindReleaseNotes(details, box, asApi(m), (n) => [...n]);
    details.dispatchEvent(new Event("toggle"));
    await flush();
    expect(m.api.getReleaseNotes).not.toHaveBeenCalled();
    await open(details);
    expect(m.api.getReleaseNotes).toHaveBeenCalledTimes(1);
    expect(headings(box)).toEqual(["v1.4.0", "v1.3.0", "v1.2.3", "v1.2.0"]);
  });
});

describe("loadAbout", () => {
  it("情報タブでは今のバージョンまでのノートを表示する", async () => {
    await loadAbout(asApi(m));
    await open($<HTMLDetailsElement>("aboutNotes"));
    expect(headings($("aboutNotesBody"))).toEqual(["v1.2.3", "v1.2.0"]);
  });
});
