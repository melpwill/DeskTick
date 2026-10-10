import type { Api } from "@/preload";
import { byId } from "@/renderer/dom";
import { type AutoStartInfo } from "@/shared/types";

/**
 * @description - 自動起動の説明文を作る
 * @param {AutoStartInfo} a - 自動起動の情報
 * @return {string} - 説明文
 */
export const autoStartNote = (a: AutoStartInfo): string =>
  a.supported
    ? `登録される実行ファイル: ${a.path}\nexe を移動した場合は、一度オフにしてからオンにし直してください。`
    : "開発モード (npm start) では使えません。ビルドした exe から設定してください。";

/**
 * @description - 自動起動の状態をチェックボックスと説明文に反映する
 * @param {HTMLInputElement} chk - チェックボックス
 * @param {HTMLElement} note - 説明文の表示先
 * @param {AutoStartInfo} a - 自動起動の情報
 * @return {void} - なし
 */
const renderAutoStart = (chk: HTMLInputElement, note: HTMLElement, a: AutoStartInfo): void => {
  chk.checked = a.enabled;
  chk.disabled = !a.supported;
  note.textContent = autoStartNote(a);
};

/**
 * @description - 自動起動の設定欄を初期化する
 * @param {Api} api - 通信API
 * @return {Promise<void>} - 初期化の完了
 */
export const initAutoStart = async (api: Api): Promise<void> => {
  const chk: HTMLInputElement = byId<HTMLInputElement>("autoStart");
  const note: HTMLElement = byId("autoStartNote");
  note.style.whiteSpace = "pre-line";
  renderAutoStart(chk, note, await api.getAutoStart());
  chk.addEventListener("change", async () => renderAutoStart(chk, note, await api.setAutoStart(chk.checked)));
};
