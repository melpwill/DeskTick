import { isEqual } from "lodash-es";
import type { Api } from "@/preload";
import { renderAlertEditor } from "@/renderer/alertEditor";
import { renderAlertList } from "@/renderer/alertList";
import {
  alertsPatchFor,
  createCustomAlert,
  DEFAULT_ALERT_ID,
  findAlert,
  removeCustomAlert,
  withAlertsPatch,
} from "@/renderer/alertLogic";
import { type AlertDef, type AlertsSettings } from "@/shared/alerts";
import { type ClockSettings } from "@/shared/settings";

export interface AlertsPanel {
  /**
   * @description - メインプロセスから届いた設定で表示を更新する
   * @param {ClockSettings} s - 設定
   * @return {void} - なし
   */
  update(s: ClockSettings): void;
}

/**
 * @description - 「通知」タブを作る
 * @param {Api} api - 通信API
 * @param {HTMLElement} listEl - 一覧の描画先
 * @param {HTMLElement} editorEl - 編集画面の描画先
 * @return {AlertsPanel} - 「通知」タブ
 */
export const createAlertsPanel = (api: Api, listEl: HTMLElement, editorEl: HTMLElement): AlertsPanel => {
  let settings: ClockSettings;
  let selectedId: string = DEFAULT_ALERT_ID;
  let draft: AlertDef | null = null;
  let pendingEchoes: number = 0;

  /**
   * @description - 一覧を描画する
   * @return {void} - なし
   */
  const renderList = (): void =>
    renderAlertList(listEl, settings.alerts, selectedId, { onSelect: select, onAdd: addCustom });

  /**
   * @description - 編集画面を描画し、その内容を下書きとする
   * @param {AlertDef} a - 編集するアラート
   * @return {void} - なし
   */
  const renderEditor = (a: AlertDef): void => {
    draft = a;
    renderAlertEditor(editorEl, a, { onEdit: edit, onTest: (id) => api.testAlert(id), onRemove: removeCustom });
  };

  /**
   * @description - アラートを選択して編集画面を開く
   * @param {string} id - アラートのid
   * @return {void} - なし
   */
  const select = (id: string): void => {
    const a: AlertDef | undefined = findAlert(settings.alerts, id);
    if (!a) return;
    selectedId = id;
    renderList();
    renderEditor(a);
  };

  /**
   * @description - アラートを保存し、返事を待たずに一覧へ反映する
   * @param {AlertDef} a - 保存するアラート
   * @return {void} - なし
   */
  const commit = (a: AlertDef): void => {
    const alerts: Partial<AlertsSettings> = alertsPatchFor(settings.alerts, a);
    pendingEchoes += 1;
    api.updateSettings({ alerts });
    settings = withAlertsPatch(settings, alerts);
    renderList();
  };

  /**
   * @description - 編集画面での変更を受け取り、検証を通っていれば保存する
   * @param {AlertDef} next - 変更後の下書き
   * @param {boolean} valid - 検証を通ったか
   * @return {void} - なし
   */
  const edit = (next: AlertDef, valid: boolean): void => {
    if (draft === null) return;
    draft = next;
    if (valid) commit(next);
  };

  /**
   * @description - カスタムアラートを追加する
   * @return {void} - なし
   */
  const addCustom = (): void => {
    const a: AlertDef = createCustomAlert(settings.alerts.custom, Date.now());
    selectedId = a.id;
    draft = null;
    api.updateSettings({ alerts: { custom: [...settings.alerts.custom, a] } });
  };

  /**
   * @description - 確認のうえ、カスタムアラートを削除する
   * @param {string} id - アラートのid
   * @return {void} - なし
   */
  const removeCustom = (id: string): void => {
    if (!confirm("このアラートを削除しますか?")) return;
    selectedId = DEFAULT_ALERT_ID;
    draft = null;
    api.updateSettings({ alerts: { custom: removeCustomAlert(settings.alerts.custom, id) } });
  };

  /**
   * @description - 設定で表示を更新する
   * @param {ClockSettings} s - 設定
   * @return {void} - なし
   */
  const update = (s: ClockSettings): void => {
    settings = s;
    if (pendingEchoes > 0) {
      pendingEchoes -= 1;
      renderList();
      return;
    }
    const current: AlertDef = findAlert(s.alerts, selectedId) ?? s.alerts.teiji;
    selectedId = current.id;
    renderList();
    if (draft === null || !isEqual(current, draft)) renderEditor(current);
  };

  return { update };
};
