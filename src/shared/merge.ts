import { isPlainObject, mapValues } from "lodash-es";

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type Obj = Record<string, unknown>;

/**
 * @description - 値がプレーンオブジェクトかどうかを判定する
 * @param {unknown} v - 判定する値
 * @return {boolean} - プレーンオブジェクトならtrue
 */
export const isObj = (v: unknown): v is Obj => isPlainObject(v);

/**
 * @description - 配列のパッチから、既定値の要素と同じ型の要素だけを残す
 * @param {readonly unknown[]} base - 既定値の配列
 * @param {readonly unknown[]} patch - 上書きする配列
 * @return {unknown[]} - フィルタ済みの新しい配列
 */
const filterArray = (base: readonly unknown[], patch: readonly unknown[]): unknown[] =>
  patch.filter((x: unknown): boolean => base.length === 0 || typeof x === typeof base[0]);

/**
 * @description - 配列は丸ごと置き換える
 * @param {readonly unknown[]} base - 既定値の配列
 * @param {unknown} patch - 上書きする値
 * @return {readonly unknown[]} - マージ後の配列
 */
const mergeArray = (base: readonly unknown[], patch: unknown): readonly unknown[] =>
  Array.isArray(patch) ? filterArray(base, patch) : base;

/**
 * @description - 1つのキーについて、既定値とパッチの値をマージした結果を返す
 * @param {unknown} base - 既定値
 * @param {unknown} patch - 上書きする値
 * @return {unknown} - マージ後の値
 */
const mergeValue = (base: unknown, patch: unknown): unknown => {
  if (patch === undefined) return base;
  if (Array.isArray(base)) return mergeArray(base, patch);
  if (isObj(base)) return mergeSettings(base, patch);
  return typeof patch === typeof base ? patch : base;
};

/**
 * @description - 既定値に存在し、かつ型が一致するキーだけをパッチから取り込む
 * @param {T} base - 既定値
 * @param {unknown} patch - 上書きする値
 * @return {T} - マージ結果の新しいオブジェクト
 */
export const mergeSettings = <T>(base: T, patch: unknown): T => {
  const b: Obj = base as Obj;
  return (isObj(patch) ? mapValues(b, (v: unknown, k: string): unknown => mergeValue(v, patch[k])) : { ...b }) as T;
};
