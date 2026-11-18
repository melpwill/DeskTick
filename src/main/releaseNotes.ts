import { RELEASES_FEED } from "@/main/githubRelease";
import { type HttpGetOptions } from "@/main/http";
import { type ReleaseNotesResult } from "@/shared/types";

/** 取得したフィードを使い回す時間 */
export const CACHE_MS: number = 10 * 60_000;
const TIMEOUT_MS: number = 15_000;
const MAX_BYTES: number = 2 * 1024 * 1024;

export interface ReleaseNotesOptions {
  /**
   * @description - HTTPS GETする
   * @param {string} url - URL
   * @param {HttpGetOptions} opts - オプション
   * @return {Promise<Uint8Array>} - 応答の本文
   */
  get(url: string, opts: HttpGetOptions): Promise<Uint8Array>;
  /**
   * @description - 現在時刻を返す
   * @return {number} - エポックミリ秒
   */
  now(): number;
}

export interface ReleaseNotesSource {
  /**
   * @description - リリースのフィードを返す（しばらくは前回の結果を使う）
   * @return {Promise<ReleaseNotesResult>} - フィードか、取得できなかった理由
   */
  get(): Promise<ReleaseNotesResult>;
}

/**
 * @description - GitHubのリリースのAtomフィードを取得するSourceを作る（読み取りは表示する側で行う）
 * @param {ReleaseNotesOptions} opts - 依存
 * @return {ReleaseNotesSource} - Source
 */
export const createReleaseNotesSource = (opts: ReleaseNotesOptions): ReleaseNotesSource => {
  let cache: { at: number; feed: string } | null = null;
  let loading: Promise<ReleaseNotesResult> | null = null;

  /**
   * @description - フィードを取得し、成功したら覚えておく
   * @return {Promise<ReleaseNotesResult>} - 結果
   */
  const load = async (): Promise<ReleaseNotesResult> => {
    try {
      const body: Uint8Array = await opts.get(RELEASES_FEED, {
        maxBytes: MAX_BYTES,
        accept: "application/atom+xml",
        timeoutMs: TIMEOUT_MS,
      });
      const feed: string = Buffer.from(body).toString("utf8");
      cache = { at: opts.now(), feed };
      return { feed, error: null };
    } catch (e) {
      return { feed: "", error: e instanceof Error ? e.message : String(e) };
    } finally {
      loading = null;
    }
  };

  return {
    /**
     * @description - リリースのフィードを返す（取得中なら、その結果を待つ）
     * @return {Promise<ReleaseNotesResult>} - フィードか、取得できなかった理由
     */
    get(): Promise<ReleaseNotesResult> {
      if (cache && opts.now() - cache.at < CACHE_MS) return Promise.resolve({ feed: cache.feed, error: null });
      loading ??= load();
      return loading;
    },
  };
};
