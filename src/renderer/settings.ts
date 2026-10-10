import type { Api } from "@/preload";
import { loadAbout } from "@/renderer/about";
import { type AlertsPanel, createAlertsPanel } from "@/renderer/alertsPanel";
import { getApi } from "@/renderer/api";
import { initAutoStart } from "@/renderer/autoStart";
import { fillDatalist, loadDisplays, loadFonts } from "@/renderer/choices";
import { byId } from "@/renderer/dom";
import { renderNtpStatus } from "@/renderer/ntpStatus";
import { createPreview, type Preview } from "@/renderer/preview";
import { bindFields, type Field, fillFields } from "@/renderer/settingsFields";
import { initTabs } from "@/renderer/tabs";
import { fillTokenTables } from "@/renderer/tokens";
import { type ClockSettings } from "@/shared/settings";
import { type NtpStatus } from "@/shared/types";

const api: Api = getApi();
const fields: Field[] = Array.from(document.querySelectorAll<Field>("[data-key]"));

let settings: ClockSettings;
let ntpOffsetMs: number = 0;

const preview: Preview = createPreview({ box: byId("preview"), line1: byId("pv1"), line2: byId("pv2") }, () => ({
  settings,
  ntpOffsetMs,
}));

/**
 * @description - 設定を保持し、入力欄とプレビューに反映する
 * @param {ClockSettings} s - 設定
 * @return {void} - なし
 */
const applySettings = (s: ClockSettings): void => {
  settings = s;
  fillFields(fields, s);
  preview.render();
};

/**
 * @description - NTPの状態を保持し、表示に反映する
 * @param {NtpStatus} s - NTPの状態
 * @return {void} - なし
 */
const applyNtpStatus = (s: NtpStatus): void => {
  ntpOffsetMs = s.offsetMs;
  renderNtpStatus(byId("ntpStatus"), byId<HTMLButtonElement>("ntpSync"), s);
};

/**
 * @description - 確認のうえ、すべての設定を初期値に戻す
 * @return {Promise<void>} - 処理の完了
 */
const resetAll = async (): Promise<void> => {
  if (!confirm("すべての設定を初期値に戻しますか?")) return;
  applySettings(await api.resetSettings());
};

/**
 * @description - 画面下部などのボタンに処理を結び付ける
 * @return {void} - なし
 */
const bindButtons = (): void => {
  byId("ntpSync").addEventListener("click", () => void api.syncNtp());
  byId("moveToDefault").addEventListener("click", () => api.moveToDefault());
  byId("openFolder").addEventListener("click", () => api.openSettingsFolder());
  byId("close").addEventListener("click", () => window.close());
  byId("reset").addEventListener("click", resetAll);
};

/**
 * @description - 設定画面を初期化する
 * @return {Promise<void>} - 初期化の完了
 */
const init = async (): Promise<void> => {
  fillTokenTables();
  fillDatalist("tzList", Intl.supportedValuesOf("timeZone"));
  initTabs(api);

  await loadDisplays(api);
  const initial: ClockSettings = await api.getSettings();
  const alertsPanel: AlertsPanel = createAlertsPanel(api, byId("alertList"), byId("alertEditor"));
  alertsPanel.update(initial);
  applySettings(initial);
  bindFields(fields, (patch) => api.updateSettings(patch));

  api.onSettings((s) => {
    alertsPanel.update(s);
    applySettings(s);
  });

  applyNtpStatus(await api.getNtpStatus());
  api.onNtpStatus(applyNtpStatus);
  bindButtons();

  preview.start();

  void loadAbout(api);
  void initAutoStart(api);
  void loadFonts(api);
};

void init();
