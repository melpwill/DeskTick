import { msToNextSecond } from "@/renderer/timing";
import { applyClockStyle, type ClockElements, renderClockText } from "@/shared/clockView";
import { type ClockSettings } from "@/shared/settings";

const TICK_MARGIN_MS: number = 5;

export interface PreviewState {
  settings: ClockSettings;
  ntpOffsetMs: number;
}

export interface Preview {
  /**
   * @description - 現在の状態でプレビューを描画する
   * @return {void} - なし
   */
  render(): void;
  /**
   * @description - 1秒ごとの描画を開始する
   * @return {void} - なし
   */
  start(): void;
}

/**
 * @description - 時計プレビューを作る
 * @param {ClockElements} el - プレビューの要素
 * @param {() => PreviewState} state - 最新の状態を返す関数
 * @return {Preview} - プレビュー
 */
export const createPreview = (el: ClockElements, state: () => PreviewState): Preview => {
  /**
   * @description - スタイルと時刻を描画する
   * @return {void} - なし
   */
  const render = (): void => {
    const { settings, ntpOffsetMs }: PreviewState = state();
    applyClockStyle(el, settings);
    renderClockText(el, settings, new Date(Date.now() + ntpOffsetMs));
  };

  /**
   * @description - 描画して、次の秒の直後に再実行を予約する
   * @return {void} - なし
   */
  const start = (): void => {
    render();
    setTimeout(start, msToNextSecond(Date.now() + state().ntpOffsetMs) + TICK_MARGIN_MS);
  };

  return { render, start };
};
