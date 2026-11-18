import * as fs from "fs";
import { sha256Hex } from "@/main/updateManifest";

export const NEW_SUFFIX: string = ".new";
export const OLD_SUFFIX: string = ".old";
const PROBE_SUFFIX: string = ".write-test";

export interface RetryOptions {
  readonly attempts: number;
  readonly delayMs: number;
}

/** ウイルス対策ソフトがダウンロード直後のexeを検査中でロックしている間を待つ */
export const DEFAULT_RETRY: RetryOptions = { attempts: 20, delayMs: 500 };

/**
 * @description - 指定時間待つ
 * @param {number} ms - ミリ秒
 * @return {Promise<void>} - 待ち終わり
 */
const sleep = (ms: number): Promise<void> => new Promise<void>((r: () => void) => setTimeout(r, ms));

/**
 * @description - 失敗したら間を空けて何度か試す
 * @param {() => Promise<T>} fn - 処理
 * @param {RetryOptions} opts - 回数と間隔
 * @return {Promise<T>} - 処理の結果
 */
export const retry = async <T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> => {
  for (let i: number = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= opts.attempts) throw e;
      await sleep(opts.delayMs);
    }
  }
};

/**
 * @description - exeと同じディレクトリにファイルを作れるかを確かめる
 * @param {string} exe - exeのパス
 * @return {Promise<boolean>} - 作れればtrue
 */
export const canWriteBeside = async (exe: string): Promise<boolean> => {
  const probe: string = `${exe}${PROBE_SUFFIX}`;
  try {
    await fs.promises.writeFile(probe, "", { flag: "w" });
    await fs.promises.rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
};

/**
 * @description - 新しいexeを"<exe>.new"として書き込み、読み直して内容を確かめる
 * @param {string} exe - 現在のexeのパス
 * @param {Uint8Array} data - 新しいexeの内容
 * @param {string} sha256 - 期待するSHA-256
 * @return {Promise<string>} - 書き込んだファイルのパス
 */
export const stageExe = async (exe: string, data: Uint8Array, sha256: string): Promise<string> => {
  const staged: string = `${exe}${NEW_SUFFIX}`;
  await fs.promises.rm(staged, { force: true });
  await fs.promises.writeFile(staged, data, { flag: "wx" });
  if (sha256Hex(await fs.promises.readFile(staged)) !== sha256) {
    await fs.promises.rm(staged, { force: true });
    throw new Error("書き込んだファイルの内容が一致しません");
  }
  return staged;
};

/**
 * @description - 実行中のexeを"<exe>.old"に退避し、"<exe>.new"を元の名前にする（失敗したら元に戻す）
 * @param {string} exe - 現在のexeのパス
 * @param {RetryOptions} opts - 再試行の回数と間隔
 * @return {Promise<void>} - 完了
 */
export const swapExe = async (exe: string, opts: RetryOptions = DEFAULT_RETRY): Promise<void> => {
  const staged: string = `${exe}${NEW_SUFFIX}`;
  const old: string = `${exe}${OLD_SUFFIX}`;
  await retry(() => fs.promises.rm(old, { force: true }), opts);
  await retry(() => fs.promises.rename(exe, old), opts);
  try {
    await retry(() => fs.promises.rename(staged, exe), opts);
  } catch (e) {
    await retry(() => fs.promises.rename(old, exe), opts);
    throw e;
  }
};

/**
 * @description - 前回の更新で残った"<exe>.new"と"<exe>.old"を消す（消せなければ次回に回す）
 * @param {string} exe - 現在のexeのパス
 * @return {Promise<void>} - 完了
 */
export const cleanupUpdateFiles = async (exe: string): Promise<void> => {
  await Promise.all(
    [NEW_SUFFIX, OLD_SUFFIX, PROBE_SUFFIX].map((s: string) =>
      fs.promises.rm(`${exe}${s}`, { force: true }).catch(() => undefined),
    ),
  );
};
