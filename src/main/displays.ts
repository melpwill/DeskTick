import { type DisplayInfo } from "@/shared/types";

export interface DisplayLike {
  readonly id: number;
  readonly label: string;
  readonly size: Readonly<{ width: number; height: number }>;
}

/**
 * @description - 設定画面に出すディスプレイの表示名を作る
 * @param {DisplayLike} display - 対象のディスプレイ
 * @param {number} index - 0始まりの並び順
 * @param {number} primaryId - メインディスプレイのID
 * @return {string} - 表示名
 */
export const displayLabel = (display: DisplayLike, index: number, primaryId: number): string => {
  const name: string = display.label || "ディスプレイ";
  const mark: string = display.id === primaryId ? " [メイン]" : "";
  return `${index + 1}: ${name} (${display.size.width}x${display.size.height})${mark}`;
};

/**
 * @description - ディスプレイ一覧を設定画面用のDisplayInfo配列に変換する
 * @param {readonly DisplayLike[]} displays - 接続中の全ディスプレイ
 * @param {number} primaryId - メインディスプレイのID
 * @return {DisplayInfo[]} - 番号と表示名の一覧
 */
export const toDisplayInfos = (displays: readonly DisplayLike[], primaryId: number): DisplayInfo[] =>
  displays.map((display: DisplayLike, index: number) => ({ index, label: displayLabel(display, index, primaryId) }));
