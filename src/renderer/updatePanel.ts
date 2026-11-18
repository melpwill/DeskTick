import type { Api } from "@/preload";
import { byId } from "@/renderer/dom";
import { type UpdateStatus } from "@/shared/types";

/**
 * @description - 確認した時刻を表示用にする
 * @param {number | null} t - エポックミリ秒
 * @return {string} - 「（HH:mm:ssに確認）」の形の文字列
 */
const checkedAt = (t: number | null): string =>
  t === null ? "" : `（${new Date(t).toLocaleTimeString("ja-JP")}に確認）`;

/**
 * @description - 更新の状態を表示用の文言にする
 * @param {UpdateStatus} s - 更新の状態
 * @return {string} - 文言
 */
export const formatUpdateStatus = (s: UpdateStatus): string => {
  switch (s.state) {
    case "checking":
      return "確認中...";
    case "latest":
      return `最新のバージョンです${checkedAt(s.lastChecked)}`;
    case "available":
      return `v${s.latestVersion} があります${checkedAt(s.lastChecked)}${s.error ? `\n更新に失敗しました: ${s.error}` : ""}`;
    case "downloading":
      return `ダウンロード中... ${Math.round((s.progress ?? 0) * 100)}%`;
    case "ready":
      return `v${s.latestVersion} に更新しました。再起動すると新しいバージョンになります`;
    case "error":
      return `確認できませんでした: ${s.error}${checkedAt(s.lastChecked)}`;
    default:
      return "まだ確認していません";
  }
};

/**
 * @description - 更新の状態を画面に反映する
 * @param {UpdateStatus} s - 更新の状態
 * @return {void} - なし
 */
export const renderUpdateStatus = (s: UpdateStatus): void => {
  const busy: boolean = s.state === "checking" || s.state === "downloading";
  byId("updateCurrent").textContent = `v${s.currentVersion}`;
  byId("updateState").textContent = formatUpdateStatus(s);
  byId<HTMLButtonElement>("updateCheck").disabled = busy || s.state === "ready";
  byId("updateInstall").hidden = s.state !== "available" || s.installBlocked !== null;
  byId("updateSkip").hidden = s.state !== "available";
  byId("updateRestart").hidden = s.state !== "ready";
  const blocked: HTMLElement = byId("updateBlocked");
  blocked.hidden = s.installBlocked === null;
  blocked.textContent = s.installBlocked ?? "";
};

/**
 * @description - 「更新」タブを初期化する
 * @param {Api} api - 通信API
 * @return {Promise<void>} - 初期化の完了
 */
export const initUpdatePanel = async (api: Api): Promise<void> => {
  byId("updateState").style.whiteSpace = "pre-line";
  byId("updateCheck").addEventListener("click", async () => renderUpdateStatus(await api.checkUpdate()));
  byId("updateInstall").addEventListener("click", async () => renderUpdateStatus(await api.installUpdate()));
  byId("updateRestart").addEventListener("click", () => api.restartToUpdate());
  byId("updateSkip").addEventListener("click", () => {
    api.skipUpdate();
    byId("updateSkip").hidden = true;
  });
  byId("updateRelease").addEventListener("click", () => api.openReleasePage());
  api.onUpdateStatus(renderUpdateStatus);
  renderUpdateStatus(await api.getUpdateStatus());
};
