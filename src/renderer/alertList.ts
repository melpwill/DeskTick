import { ALERT_GROUPS, type AlertGroup, displayName, groupAlerts, itemClass } from "@/renderer/alertLogic";
import { h } from "@/renderer/dom";
import { type AlertDef, type AlertsSettings, describeSchedule } from "@/shared/alerts";

export interface AlertListHandlers {
  /**
   * @description - アラートが選択されたときに呼ばれる
   * @param {string} id - アラートのid
   * @return {void} - なし
   */
  onSelect(id: string): void;
  /**
   * @description - 「+ カスタムを追加」が押されたときに呼ばれる
   * @return {void} - なし
   */
  onAdd(): void;
}

/**
 * @description - 一覧の項目を作る
 * @param {AlertDef} a - アラート
 * @param {string} selectedId - 選択中のアラートのid
 * @param {AlertListHandlers} handlers - 通知先
 * @return {HTMLButtonElement} - 項目
 */
const alertItem = (a: AlertDef, selectedId: string, handlers: AlertListHandlers): HTMLButtonElement =>
  h(
    "button",
    { class: itemClass(a, selectedId), onclick: () => handlers.onSelect(a.id) },
    h("div", { class: "name" }, displayName(a.name), a.enabled ? "" : " (オフ)"),
    h("div", { class: "sum" }, describeSchedule(a)),
  );

/**
 * @description - 1グループ分の要素を作る
 * @param {AlertGroup} group - グループ
 * @param {AlertsSettings} alerts - アラート設定
 * @param {string} selectedId - 選択中のアラートのid
 * @param {AlertListHandlers} handlers - 通知先
 * @return {HTMLElement[]} - 要素
 */
const groupNodes = (
  group: AlertGroup,
  alerts: AlertsSettings,
  selectedId: string,
  handlers: AlertListHandlers,
): HTMLElement[] => [
  h("div", { class: "list-head" }, group.label),
  ...groupAlerts(alerts, group).map((a) => alertItem(a, selectedId, handlers)),
  ...(group.ids === "custom"
    ? [h("button", { class: "btn add", onclick: () => handlers.onAdd() }, "+ カスタムを追加")]
    : []),
];

/**
 * @description - アラート一覧を描画する
 * @param {HTMLElement} root - 描画先
 * @param {AlertsSettings} alerts - アラート設定
 * @param {string} selectedId - 選択中のアラートのid
 * @param {AlertListHandlers} handlers - 通知先
 * @return {void} - なし
 */
export const renderAlertList = (
  root: HTMLElement,
  alerts: AlertsSettings,
  selectedId: string,
  handlers: AlertListHandlers,
): void => root.replaceChildren(...ALERT_GROUPS.flatMap((g) => groupNodes(g, alerts, selectedId, handlers)));
