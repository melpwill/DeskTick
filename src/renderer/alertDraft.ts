import { setIn } from "@/renderer/alertLogic";
import { type AlertDef } from "@/shared/alerts";

export interface AlertDraft {
  /**
   * @description - 現在の下書きを返す
   * @return {AlertDef} - 下書き
   */
  current(): AlertDef;
  /**
   * @description - 指定パスの値を差し替えて、変更を通知する
   * @param {string} path - 変更するパス
   * @param {unknown} value - 新しい値
   * @return {void} - なし
   */
  change(path: string, value: unknown): void;
}

/**
 * @description - 下書きを作る
 * @param {AlertDef} src - 編集元のアラート
 * @param {(next: AlertDef) => void} onChange - 変更後の下書きを受け取るコールバック
 * @return {AlertDraft} - 下書き
 */
export const createDraft = (src: AlertDef, onChange: (next: AlertDef) => void): AlertDraft => {
  let draft: AlertDef = src;

  /**
   * @description - 現在の下書きを返す
   * @return {AlertDef} - 下書き
   */
  const current = (): AlertDef => draft;

  /**
   * @description - 指定パスの値を差し替えて、変更を通知する
   * @param {string} path - 変更するパス
   * @param {unknown} value - 新しい値
   * @return {void} - なし
   */
  const change = (path: string, value: unknown): void => {
    draft = setIn(draft, path, value);
    onChange(draft);
  };

  return { current, change };
};
