import {
  LATEST_RELEASE_API,
  parseRelease,
  type ReleaseAsset,
  type ReleaseInfo,
  RELEASES_PAGE,
} from "@/main/githubRelease";
import { type HttpGetOptions } from "@/main/http";
import {
  MANIFEST_NAME,
  MAX_MANIFEST_BYTES,
  MAX_SIGNATURE_BYTES,
  parseManifest,
  sha256Hex,
  SIGNATURE_NAME,
  type UpdateManifest,
  verifySignature,
} from "@/main/updateManifest";
import { errorText } from "@/shared/format";
import { type UpdateSettings } from "@/shared/settings";
import { type UpdateStatus } from "@/shared/types";
import { isNewerVersion } from "@/shared/version";

const MS_PER_MINUTE: number = 60_000;
/** 起動直後は時計の表示を優先し、少し待ってから確認する */
export const FIRST_CHECK_DELAY_MS: number = MS_PER_MINUTE;
export const TICK_MS: number = 10 * MS_PER_MINUTE;
export const CHECK_INTERVAL_MS: number = 24 * 60 * MS_PER_MINUTE;
export const RETRY_INTERVAL_MS: number = 60 * MS_PER_MINUTE;
const API_TIMEOUT_MS: number = 15_000;
const EXE_TIMEOUT_MS: number = 10 * MS_PER_MINUTE;
const MAX_API_BYTES: number = 1024 * 1024;
const OCTET_STREAM: string = "application/octet-stream";

export const DEV_BLOCKED: string = "開発モード (pnpm start) では更新できません";
export const NO_WRITE_BLOCKED: string =
  "exeのあるフォルダーに書き込めないため、自動では更新できません。リリースページからダウンロードしてください";

export interface UpdateFiles {
  /**
   * @description - exeと同じディレクトリにファイルを作れるかを確かめる
   * @param {string} exe - exeのパス
   * @return {Promise<boolean>} - 作れればtrue
   */
  canWrite(exe: string): Promise<boolean>;
  /**
   * @description - 新しいexeを書き込む
   * @param {string} exe - exeのパス
   * @param {Uint8Array} data - 新しいexeの内容
   * @param {string} sha256 - 期待するSHA-256
   * @return {Promise<string>} - 書き込んだファイルのパス
   */
  stage(exe: string, data: Uint8Array, sha256: string): Promise<string>;
  /**
   * @description - 書き込んだexeと現在のexeを入れ替える
   * @param {string} exe - exeのパス
   * @return {Promise<void>} - 完了
   */
  swap(exe: string): Promise<void>;
  /**
   * @description - 前回の更新で残ったファイルを消す
   * @param {string} exe - exeのパス
   * @return {Promise<void>} - 完了
   */
  cleanup(exe: string): Promise<void>;
}

export interface UpdaterOptions {
  readonly productName: string;
  readonly currentVersion: string;
  /** 差し替えるexeのパス（開発モードなどで差し替えられないならnull） */
  readonly exePath: string | null;
  /** 信頼する署名の公開鍵（base64のSPKI） */
  readonly publicKeys: readonly string[];
  readonly files: UpdateFiles;
  /**
   * @description - HTTPS GETする
   * @param {string} url - URL
   * @param {HttpGetOptions} opts - オプション
   * @return {Promise<Uint8Array>} - 応答の本文
   */
  get(url: string, opts: HttpGetOptions): Promise<Uint8Array>;
  /**
   * @description - 現在の更新の設定を返す
   * @return {UpdateSettings} - 更新の設定
   */
  settings(): UpdateSettings;
  /**
   * @description - 現在時刻を返す
   * @return {number} - エポックミリ秒
   */
  now(): number;
  /**
   * @description - 状態が変わったときに呼ばれる
   * @param {UpdateStatus} s - 新しい状態
   * @return {void} - なし
   */
  onStatus(s: UpdateStatus): void;
  /**
   * @description - 利用者に知らせる
   * @param {string} title - タイトル
   * @param {string} body - 本文
   * @return {void} - なし
   */
  notify(title: string, body: string): void;
}

export interface Updater {
  readonly status: UpdateStatus;
  /**
   * @description - 定期的な確認を始める
   * @return {void} - なし
   */
  start(): void;
  /**
   * @description - 定期的な確認を止める
   * @return {void} - なし
   */
  stop(): void;
  /**
   * @description - 今すぐ新しいバージョンを確認する
   * @return {Promise<UpdateStatus>} - 確認後の状態
   */
  check(): Promise<UpdateStatus>;
  /**
   * @description - 見つかった新しいバージョンをダウンロードし、exeを差し替える
   * @return {Promise<UpdateStatus>} - 処理後の状態
   */
  install(): Promise<UpdateStatus>;
}

interface Pending {
  readonly manifest: UpdateManifest;
  readonly exe: ReleaseAsset;
}

/**
 * @description - リリースから指定の名前の添付ファイルを探す
 * @param {ReleaseInfo} r - リリース
 * @param {string} name - ファイル名
 * @return {ReleaseAsset} - 添付ファイル
 */
const assetOf = (r: ReleaseInfo, name: string): ReleaseAsset => {
  const a: ReleaseAsset | undefined = r.assets.get(name);
  if (!a) throw new Error(`リリースに${name}がありません`);
  return a;
};

/**
 * @description - GitHubのリリースから署名付きで更新するUpdaterを作る
 * @param {UpdaterOptions} opts - 依存
 * @return {Updater} - Updater
 */
export const createUpdater = (opts: UpdaterOptions): Updater => {
  let status: UpdateStatus = {
    state: "idle",
    currentVersion: opts.currentVersion,
    latestVersion: null,
    releaseUrl: RELEASES_PAGE,
    progress: null,
    error: null,
    lastChecked: null,
    installBlocked: opts.exePath === null ? DEV_BLOCKED : null,
  };
  let pending: Pending | null = null;
  let nextCheckAt: number = 0;
  let firstTimer: NodeJS.Timeout | null = null;
  let tickTimer: NodeJS.Timeout | null = null;
  const notified: Set<string> = new Set<string>();

  /**
   * @description - 状態を更新して知らせる
   * @param {Partial<UpdateStatus>} patch - 変更内容
   * @return {void} - なし
   */
  const setStatus = (patch: Partial<UpdateStatus>): void => {
    status = { ...status, ...patch };
    opts.onStatus(status);
  };

  /**
   * @description - 小さなファイルを取得する
   * @param {string} url - URL
   * @param {number} maxBytes - 最大バイト数
   * @param {string} accept - Acceptヘッダー
   * @return {Promise<Uint8Array>} - 内容
   */
  const fetchSmall = (url: string, maxBytes: number, accept: string): Promise<Uint8Array> =>
    opts.get(url, { maxBytes, accept, timeoutMs: API_TIMEOUT_MS });

  /**
   * @description - 最新のリリースの情報を取得する
   * @return {Promise<ReleaseInfo>} - リリース情報
   */
  const fetchRelease = async (): Promise<ReleaseInfo> => {
    const body: Uint8Array = await fetchSmall(LATEST_RELEASE_API, MAX_API_BYTES, "application/vnd.github+json");
    let json: unknown = null;
    try {
      json = JSON.parse(Buffer.from(body).toString("utf8"));
    } catch {
      // 下でまとめて扱う
    }
    const r: ReleaseInfo | null = parseRelease(json);
    if (!r) throw new Error("リリース情報を読み取れませんでした");
    return r;
  };

  /**
   * @description - リリースの署名付きマニフェストを検証し、ダウンロードするexeを決める
   * @param {ReleaseInfo} r - リリース
   * @return {Promise<Pending>} - 検証済みの更新内容
   */
  const verifyRelease = async (r: ReleaseInfo): Promise<Pending> => {
    const [data, sig] = await Promise.all([
      fetchSmall(assetOf(r, MANIFEST_NAME).url, MAX_MANIFEST_BYTES, OCTET_STREAM),
      fetchSmall(assetOf(r, SIGNATURE_NAME).url, MAX_SIGNATURE_BYTES, OCTET_STREAM),
    ]);
    if (!verifySignature(data, sig, opts.publicKeys)) throw new Error("更新ファイルの署名を確認できませんでした");
    const manifest: UpdateManifest | null = parseManifest(data, opts.productName);
    if (!manifest || manifest.version !== r.version) throw new Error("更新ファイルの内容がリリースと一致しません");
    const exe: ReleaseAsset = assetOf(r, manifest.file);
    if (exe.size !== manifest.size) throw new Error("更新ファイルの内容がリリースと一致しません");
    return { manifest, exe };
  };

  /**
   * @description - exeを差し替えられない理由を調べ直す
   * @return {Promise<string | null>} - 理由（差し替えられるならnull）
   */
  const refreshBlocked = async (): Promise<string | null> => {
    if (opts.exePath === null) return DEV_BLOCKED;
    const blocked: string | null = (await opts.files.canWrite(opts.exePath)) ? null : NO_WRITE_BLOCKED;
    if (blocked !== status.installBlocked) setStatus({ installBlocked: blocked });
    return blocked;
  };

  /**
   * @description - 確認中・ダウンロード中・差し替え済み（再起動待ち）かを判定する
   * @return {boolean} - 新たな確認や差し替えをしない状態ならtrue
   */
  const isBusy = (): boolean =>
    status.state === "checking" || status.state === "downloading" || status.state === "ready";

  /**
   * @description - 新しいバージョンがあるかを確認する
   * @return {Promise<void>} - 完了
   */
  const runCheck = async (): Promise<void> => {
    setStatus({ state: "checking", error: null });
    const now: number = opts.now();
    try {
      const r: ReleaseInfo = await fetchRelease();
      pending = isNewerVersion(r.version, opts.currentVersion) ? await verifyRelease(r) : null;
      nextCheckAt = now + CHECK_INTERVAL_MS;
      if (pending) await refreshBlocked();
      setStatus({
        state: pending ? "available" : "latest",
        latestVersion: pending ? r.version : null,
        releaseUrl: r.pageUrl,
        lastChecked: now,
      });
    } catch (e) {
      pending = null;
      nextCheckAt = now + RETRY_INTERVAL_MS;
      setStatus({ state: "error", latestVersion: null, error: errorText(e), lastChecked: now });
    }
  };

  /**
   * @description - 今すぐ新しいバージョンを確認する（確認中・ダウンロード中・差し替え済みなら何もしない）
   * @return {Promise<UpdateStatus>} - 確認後の状態
   */
  const check = async (): Promise<UpdateStatus> => {
    if (!isBusy()) await runCheck();
    return status;
  };

  /**
   * @description - ダウンロードの進み具合を1%刻みで知らせる関数を作る
   * @param {number} size - 全体のバイト数
   * @return {(received: number) => void} - 受信したバイト数を受け取る関数
   */
  const progressReporter = (size: number): ((received: number) => void) => {
    let last: number = 0;
    return (received: number): void => {
      const pct: number = Math.floor((received / size) * 100);
      if (pct === last) return;
      last = pct;
      setStatus({ progress: pct / 100 });
    };
  };

  /**
   * @description - 見つかった新しいバージョンをダウンロードし、exeを差し替える
   * @return {Promise<UpdateStatus>} - 処理後の状態
   */
  const install = async (): Promise<UpdateStatus> => {
    if (status.state !== "available" || !pending) return status;
    const { manifest, exe } = pending;
    if (await refreshBlocked()) return status;
    const target: string = opts.exePath!;
    setStatus({ state: "downloading", progress: 0, error: null });
    try {
      const data: Uint8Array = await opts.get(exe.url, {
        maxBytes: manifest.size,
        accept: OCTET_STREAM,
        timeoutMs: EXE_TIMEOUT_MS,
        onProgress: progressReporter(manifest.size),
      });
      if (data.length !== manifest.size || sha256Hex(data) !== manifest.sha256) {
        throw new Error("ダウンロードしたファイルが壊れています");
      }
      await opts.files.stage(target, data, manifest.sha256);
      await opts.files.swap(target);
      pending = null;
      setStatus({ state: "ready", progress: null });
    } catch (e) {
      setStatus({ state: "available", progress: null, error: errorText(e) });
    }
    return status;
  };

  /**
   * @description - 自動の確認で見つかった新しいバージョンを、設定に従って更新または通知する
   * @return {Promise<void>} - 完了
   */
  const handleFound = async (): Promise<void> => {
    const v: string | null = status.latestVersion;
    const s: UpdateSettings = opts.settings();
    if (status.state !== "available" || v === null || v === s.skipVersion || notified.has(v)) return;
    notified.add(v);
    if (s.mode === "auto" && status.installBlocked === null) {
      const after: UpdateStatus = await install();
      if (!s.notify) return;
      if (after.state === "ready") {
        opts.notify(
          `DeskTick v${v} に更新しました`,
          "メニューから再起動するか、次に起動したときに新しいバージョンになります。",
        );
      } else {
        opts.notify(`DeskTick v${v} への自動更新に失敗しました`, `${after.error ?? after.installBlocked}`);
      }
    } else if (s.notify) {
      opts.notify(`DeskTick v${v} があります`, "メニューの「更新」または設定画面の「更新」タブから更新できます。");
    }
  };

  /**
   * @description - 定期的な確認の1回分
   * @param {boolean} first - 起動後の最初の1回か
   * @return {Promise<void>} - 完了
   */
  const tick = async (first: boolean): Promise<void> => {
    if (isBusy()) return;
    if (first && opts.exePath !== null) await opts.files.cleanup(opts.exePath);
    if (opts.settings().mode === "off" || opts.now() < nextCheckAt) return;
    await runCheck();
    await handleFound();
  };

  /**
   * @description - 定期的な確認を始める
   * @return {void} - なし
   */
  const start = (): void => {
    firstTimer = setTimeout(() => {
      firstTimer = null;
      void tick(true);
      tickTimer = setInterval(() => void tick(false), TICK_MS);
    }, FIRST_CHECK_DELAY_MS);
  };

  /**
   * @description - 定期的な確認を止める
   * @return {void} - なし
   */
  const stop = (): void => {
    if (firstTimer) clearTimeout(firstTimer);
    if (tickTimer) clearInterval(tickTimer);
    firstTimer = null;
    tickTimer = null;
  };

  return {
    /**
     * @description - 現在の状態を返す
     * @return {UpdateStatus} - 状態
     */
    get status(): UpdateStatus {
      return status;
    },
    start,
    stop,
    check,
    install,
  };
};
