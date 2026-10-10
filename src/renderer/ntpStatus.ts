import { type NtpStatus } from "@/shared/types";

/**
 * @description - NTPの状態を表示用の文言にする
 * @param {NtpStatus} s - NTPの状態
 * @return {string | null} - 表示する文言
 */
export const formatNtpStatus = (s: NtpStatus): string | null => {
  if (!s.enabled) return "無効 (PCの時刻を表示)";
  if (s.syncing) return "同期中...";
  const offset: string = `ずれ ${s.offsetMs >= 0 ? "+" : ""}${s.offsetMs.toFixed(0)} ms`;
  if (s.error) return `同期失敗: ${s.error}${s.lastSync ? ` (前回の${offset} を使用中)` : " (PCの時刻を表示)"}`;
  if (!s.lastSync) return null;
  const rtt: string = s.rttMs === null ? "" : ` / 往復 ${s.rttMs.toFixed(0)} ms`;
  return `${new Date(s.lastSync).toLocaleTimeString("ja-JP")} に同期 / ${offset}${rtt}`;
};

/**
 * @description - 「今すぐ同期」ボタンを無効にすべきかを判定する
 * @param {NtpStatus} s - NTPの状態
 * @return {boolean} - 無効にするならtrue
 */
export const isSyncDisabled = (s: NtpStatus): boolean => !s.enabled || s.syncing;

/**
 * @description - NTPの状態を画面に反映する
 * @param {HTMLElement} out - 状態の表示先
 * @param {HTMLButtonElement} button - 同期ボタン
 * @param {NtpStatus} s - NTPの状態
 * @return {void} - なし
 */
export const renderNtpStatus = (out: HTMLElement, button: HTMLButtonElement, s: NtpStatus): void => {
  button.disabled = isSyncDisabled(s);
  const text: string | null = formatNtpStatus(s);
  if (text !== null) out.textContent = text;
};
