import { isObj, type Obj } from "@/shared/merge";

/** config.jsonの形の版。形を変えたら1つ上げ、MIGRATIONSに変換を足す */
export const CONFIG_VERSION: number = 1;

export type Migration = (raw: Readonly<Obj>) => Obj;

/**
 * キーnは、版nの設定を版n+1の形に変換する
 * 例: 2: (raw) => ({ ...omit(raw, "oldKey"), newKey: raw.oldKey })
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export interface MigrationResult {
  /** 変換後の内容 */
  readonly raw: unknown;
  /** ファイルに書かれていた版 */
  readonly from: number;
  /** 変換したかどうか */
  readonly migrated: boolean;
  /** このアプリより新しい版のファイルかどうか */
  readonly tooNew: boolean;
}

/**
 * @description - 設定ファイルの生JSONから版を読み取る（版がなければ1とみなす）
 * @param {unknown} raw - 設定ファイルの内容
 * @return {number} - 版
 */
export const configVersionOf = (raw: unknown): number => {
  const v: unknown = isObj(raw) ? raw.configVersion : undefined;
  return typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : 1;
};

/**
 * @description - 設定ファイルの生JSONを現在の版の形に変換する
 * @param {unknown} raw - 設定ファイルの内容
 * @param {number} current - 現在の版
 * @param {Readonly<Record<number, Migration>>} migrations - 版ごとの変換
 * @return {MigrationResult} - 変換結果
 */
export const migrateConfig = (
  raw: unknown,
  current: number = CONFIG_VERSION,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): MigrationResult => {
  const from: number = configVersionOf(raw);
  if (from > current) return { raw, from, migrated: false, tooNew: true };
  if (from === current || !isObj(raw)) return { raw, from, migrated: false, tooNew: false };
  let next: Obj = raw;
  for (let v: number = from; v < current; v++) next = (migrations[v] ?? ((r: Readonly<Obj>): Obj => ({ ...r })))(next);
  return { raw: { ...next, configVersion: current }, from, migrated: true, tooNew: false };
};
