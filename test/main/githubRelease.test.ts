import { describe, expect, it } from "vitest";
import { isAllowedUrl, LATEST_RELEASE_API, parseRelease, RELEASES_PAGE } from "@/main/githubRelease";

const DL = `${RELEASES_PAGE}/download/v1.2.0`;

const release = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  tag_name: "v1.2.0",
  draft: false,
  prerelease: false,
  html_url: `${RELEASES_PAGE}/tag/v1.2.0`,
  assets: [
    { name: "DeskTick.exe", browser_download_url: `${DL}/DeskTick.exe`, size: 1000 },
    { name: "DeskTick-update.json", browser_download_url: `${DL}/DeskTick-update.json`, size: 100 },
  ],
  ...patch,
});

describe("isAllowedUrl", () => {
  it("GitHubのAPI・リリース・配布用ホストのHTTPSだけを許可する", () => {
    expect(isAllowedUrl(LATEST_RELEASE_API)).toBe(true);
    expect(isAllowedUrl(`${DL}/DeskTick.exe`)).toBe(true);
    expect(isAllowedUrl("https://objects.githubusercontent.com/x")).toBe(true);
    expect(isAllowedUrl("https://release-assets.githubusercontent.com/x")).toBe(true);
  });

  it("HTTP・別ホスト・ポート指定・認証情報付き・不正なURLは許可しない", () => {
    for (const url of [
      "http://github.com/x",
      "https://raw.githubusercontent.com/x",
      "https://github.com.evil.example/x",
      "https://evil.example/github.com",
      "https://github.com:8443/x",
      "https://user:pass@github.com/x",
      "not a url",
    ]) {
      expect(isAllowedUrl(url)).toBe(false);
    }
  });
});

describe("parseRelease", () => {
  it("バージョン・ページ・添付ファイルを取り出す", () => {
    const r = parseRelease(release())!;
    expect(r.version).toBe("1.2.0");
    expect(r.pageUrl).toBe(`${RELEASES_PAGE}/tag/v1.2.0`);
    expect(r.assets.get("DeskTick.exe")).toEqual({ url: `${DL}/DeskTick.exe`, size: 1000 });
    expect(r.assets.size).toBe(2);
  });

  it("下書き・プレリリース・不正なタグ・オブジェクト以外は読まない", () => {
    expect(parseRelease(release({ draft: true }))).toBeNull();
    expect(parseRelease(release({ prerelease: true }))).toBeNull();
    expect(parseRelease(release({ prerelease: undefined }))).toBeNull();
    expect(parseRelease(release({ tag_name: "v1.2.0-rc.1" }))).toBeNull();
    expect(parseRelease(release({ tag_name: 120 }))).toBeNull();
    expect(parseRelease("release")).toBeNull();
  });

  it("このリポジトリのリリース以外を指す添付ファイルや不正な添付ファイルは捨てる", () => {
    const r = parseRelease(
      release({
        assets: [
          { name: "a.exe", browser_download_url: "https://github.com/other/repo/releases/download/v1/a.exe", size: 1 },
          { name: "b.exe", browser_download_url: "https://evil.example/b.exe", size: 1 },
          { name: "c.exe", browser_download_url: `${DL}/c.exe`, size: 0 },
          { name: "d.exe", browser_download_url: `${DL}/d.exe`, size: 1.5 },
          { name: 5, browser_download_url: `${DL}/e.exe`, size: 1 },
          "f.exe",
          { name: "ok.exe", browser_download_url: `${DL}/ok.exe`, size: 2 },
        ],
      }),
    )!;
    expect([...r.assets.keys()]).toEqual(["ok.exe"]);
  });

  it("添付ファイルがなくても読み、ページのURLがおかしければリリース一覧にする", () => {
    const r = parseRelease(release({ assets: undefined, html_url: "https://evil.example/" }))!;
    expect(r.assets.size).toBe(0);
    expect(r.pageUrl).toBe(RELEASES_PAGE);
  });
});
