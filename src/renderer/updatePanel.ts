import type { Api } from "@/preload";
import { byId } from "@/renderer/dom";
import { bindReleaseNotes, notesBetween, type ReleaseNote } from "@/renderer/releaseNotes";
import { type UpdateStatus } from "@/shared/types";

/** 最後に表示した更新の状態（変更内容の範囲を決めるのに使う） */
let shown: UpdateStatus | null = null;

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
 * @description - 見つかった新しいバージョンの変更内容の折りたたみを出し分ける（別のバージョンになったら閉じる）
 * @param {UpdateStatus} s - 更新の状態
 * @return {void} - なし
 */
const renderNotesToggle = (s: UpdateStatus): void => {
  const details: HTMLDetailsElement = byId<HTMLDetailsElement>("updateNotes");
  const found: boolean = (s.state === "available" || s.state === "ready") && s.latestVersion !== null;
  details.hidden = !found;
  if (!found || s.latestVersion === shown?.latestVersion) return;
  details.open = false;
  byId("updateNotesSummary").textContent = `v${s.latestVersion} の変更内容を表示`;
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
  renderNotesToggle(s);
  shown = s;
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
  bindReleaseNotes(
    byId<HTMLDetailsElement>("updateNotes"),
    byId("updateNotesBody"),
    api,
    (notes: readonly ReleaseNote[]) =>
      shown?.latestVersion ? notesBetween(notes, shown.currentVersion, shown.latestVersion) : [],
  );
  api.onUpdateStatus(renderUpdateStatus);
  renderUpdateStatus(await api.getUpdateStatus());
};
