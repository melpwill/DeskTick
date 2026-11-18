import { isObj } from "@/shared/merge";
import { parseVersion, type Version } from "@/shared/version";

export const REPO: string = "melpwill/DeskTick";
export const LATEST_RELEASE_API: string = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE: string = `https://github.com/${REPO}/releases`;
/** リリースのAtomフィード（REST APIではないので、APIの回数制限を受けない） */
export const RELEASES_FEED: string = `${RELEASES_PAGE}.atom`;
const DOWNLOAD_PREFIX: string = `${RELEASES_PAGE}/download/`;

/** 更新の確認・ダウンロードで接続してよいホスト（リダイレクト先を含む） */
const ALLOWED_HOSTS: ReadonlySet<string> = new Set<string>([
  "api.github.com",
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

export interface ReleaseAsset {
  readonly url: string;
  readonly size: number;
}

export interface ReleaseInfo {
  /** "1.2.3"の形のバージョン */
  readonly version: string;
  readonly pageUrl: string;
  readonly assets: ReadonlyMap<string, ReleaseAsset>;
}

/**
 * @description - 更新のために接続してよいURLかを判定する
 * @param {string} url - URL
 * @return {boolean} - HTTPSで、許可したホストの既定ポートならtrue
 */
export const isAllowedUrl = (url: string): boolean => {
  try {
    const u: URL = new URL(url);
    return (
      u.protocol === "https:" &&
      u.port === "" &&
      u.username === "" &&
      u.password === "" &&
      ALLOWED_HOSTS.has(u.hostname)
    );
  } catch {
    return false;
  }
};

/**
 * @description - このリポジトリのリリース配下のURLかを判定する
 * @param {unknown} url - URL
 * @param {string} prefix - 先頭が一致すべき文字列
 * @return {boolean} - 一致すればtrue
 */
const isRepoUrl = (url: unknown, prefix: string): url is string =>
  typeof url === "string" && url.startsWith(prefix) && isAllowedUrl(url);

/**
 * @description - リリースの添付ファイル1つを読み取る
 * @param {unknown} a - GitHub APIのasset
 * @return {[string, ReleaseAsset] | null} - [ファイル名, 添付ファイル]。不正ならnull
 */
const parseAsset = (a: unknown): [string, ReleaseAsset] | null => {
  if (!isObj(a) || typeof a.name !== "string" || !Number.isSafeInteger(a.size) || (a.size as number) <= 0) return null;
  if (!isRepoUrl(a.browser_download_url, DOWNLOAD_PREFIX)) return null;
  return [a.name, { url: a.browser_download_url, size: a.size as number }];
};

/**
 * @description - GitHub APIの最新リリースの応答から、更新に必要な情報を取り出す
 * @param {unknown} json - APIの応答
 * @return {ReleaseInfo | null} - リリース情報。下書き・プレリリース・不正な形式ならnull
 */
export const parseRelease = (json: unknown): ReleaseInfo | null => {
  if (!isObj(json) || json.draft !== false || json.prerelease !== false || typeof json.tag_name !== "string")
    return null;
  const v: Version | null = parseVersion(json.tag_name);
  if (!v) return null;
  const assets: [string, ReleaseAsset][] = (Array.isArray(json.assets) ? json.assets : [])
    .map(parseAsset)
    .filter((x: [string, ReleaseAsset] | null): x is [string, ReleaseAsset] => x !== null);
  return {
    version: v.join("."),
    pageUrl: isRepoUrl(json.html_url, `${RELEASES_PAGE}/`) ? json.html_url : RELEASES_PAGE,
    assets: new Map<string, ReleaseAsset>(assets),
  };
};
