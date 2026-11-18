import { type ClientRequest, type IncomingMessage, net } from "electron";
import { isAllowedUrl } from "@/main/githubRelease";

const MAX_REDIRECTS: number = 5;
const USER_AGENT: string = "DeskTick-Updater";

export interface HttpGetOptions {
  /** 受け取る最大バイト数（超えたら中断する） */
  readonly maxBytes: number;
  readonly accept: string;
  readonly timeoutMs: number;
  /**
   * @description - 受信したバイト数を知らせる
   * @param {number} received - これまでに受信したバイト数
   * @return {void} - なし
   */
  readonly onProgress?: (received: number) => void;
}

/**
 * @description - HTTPの状態コードを利用者向けの文言にする
 * @param {number} status - 状態コード
 * @return {string} - 文言
 */
export const httpErrorText = (status: number): string =>
  status === 403 || status === 429
    ? "GitHubへのアクセスが一時的に制限されています。しばらくしてから試してください"
    : `サーバーがエラーを返しました (HTTP ${status})`;

/**
 * @description - ヘッダーの値を1つの文字列にする
 * @param {string | string[] | undefined} v - ヘッダーの値
 * @return {string | undefined} - 最初の値
 */
const headerValue = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * @description - 許可したホストだけを通してHTTPS GETする（OSのプロキシ設定に従い、Cookieは送らない）
 * @param {string} url - URL
 * @param {HttpGetOptions} opts - オプション
 * @return {Promise<Buffer>} - 応答の本文
 */
export const httpGet = (url: string, opts: HttpGetOptions): Promise<Buffer> =>
  new Promise<Buffer>((resolve, reject) => {
    if (!isAllowedUrl(url)) return reject(new Error(`許可されていないURLです: ${url}`));
    const req: ClientRequest = net.request({
      url,
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      useSessionCookies: false,
      cache: "no-store",
      headers: { Accept: opts.accept, "User-Agent": USER_AGENT },
    });
    const chunks: Buffer[] = [];
    let received: number = 0;
    let redirects: number = 0;
    let settled: boolean = false;

    /**
     * @description - 結果を確定する（2回目以降は無視する）
     * @param {Error | null} err - 失敗の理由
     * @return {void} - なし
     */
    const finish = (err: Error | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!err) return resolve(Buffer.concat(chunks));
      req.abort();
      reject(err);
    };

    const timer: NodeJS.Timeout = setTimeout(() => finish(new Error("通信がタイムアウトしました")), opts.timeoutMs);

    /**
     * @description - 受信したデータをためる
     * @param {Buffer} chunk - 受信したデータ
     * @return {void} - なし
     */
    const onData = (chunk: Buffer): void => {
      if (settled) return;
      received += chunk.length;
      if (received > opts.maxBytes) return finish(new Error("想定より大きなファイルです"));
      chunks.push(chunk);
      opts.onProgress?.(received);
    };

    req.on("redirect", (_status: number, _method: string, redirectUrl: string) => {
      redirects += 1;
      if (redirects > MAX_REDIRECTS) return finish(new Error("転送が多すぎます"));
      if (!isAllowedUrl(redirectUrl)) return finish(new Error(`許可されていない転送先です: ${redirectUrl}`));
      req.followRedirect();
    });
    req.on("response", (res: IncomingMessage) => {
      if (res.statusCode !== 200) return finish(new Error(httpErrorText(res.statusCode)));
      if (Number(headerValue(res.headers["content-length"])) > opts.maxBytes) {
        return finish(new Error("想定より大きなファイルです"));
      }
      res.on("data", onData);
      res.on("end", () => finish(null));
      res.on("aborted", () => finish(new Error("通信が中断されました")));
      res.on("error", (e: Error) => finish(e));
    });
    req.on("error", (e: Error) => finish(e));
    req.end();
  });
