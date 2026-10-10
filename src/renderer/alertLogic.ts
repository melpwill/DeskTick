import { cloneDeep, compact, set, sortBy, uniq, without } from "lodash-es";
import {
  type AlertDef,
  type AlertsSettings,
  allAlerts,
  FIXED_ALERT_IDS,
  type FixedAlertId,
  newCustomAlert,
  parseHHMM,
} from "@/shared/alerts";
import { type ClockSettings } from "@/shared/settings";

export const DEFAULT_ALERT_ID: FixedAlertId = "teiji";
const UNTITLED: string = "(無題)";
const NOTES: Readonly<Partial<Record<FixedAlertId, string>>> = {
  teiji: "指定した時刻に1日1回お知らせします。",
  stand:
    "初期値の30分間隔は、座っている時間を30分未満で区切る人ほど死亡リスクが低かったという研究 " +
    "(Diaz et al., Annals of Internal Medicine, 2017) に基づいています。",
  water:
    "初期値の60分間隔は、飲み物からの1日の摂取目安 (EFSA: 約1.6〜2.0L) を、" +
    "活動時間中にコップ1杯ずつ摂るための目安です。",
};

export interface AlertGroup {
  label: string;
  ids: readonly FixedAlertId[] | "custom";
}

export const ALERT_GROUPS: readonly AlertGroup[] = [
  { label: "基本", ids: ["teiji", "stand", "water"] },
  { label: "食事", ids: ["breakfast", "lunch", "dinner"] },
  { label: "カスタム", ids: "custom" },
];

export const DAY_ORDER: readonly (readonly [day: number, label: string])[] = [
  [1, "月"],
  [2, "火"],
  [3, "水"],
  [4, "木"],
  [5, "金"],
  [6, "土"],
  [0, "日"],
];

const DATE_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @description - 固定アラートのidかを判定する
 * @param {string} id - アラートのid
 * @return {boolean} - 固定アラートならtrue
 */
export const isFixed = (id: string): id is FixedAlertId => (FIXED_ALERT_IDS as readonly string[]).includes(id);

/**
 * @description - 表示用の名前を返す
 * @param {string} name - アラートの名前
 * @return {string} - 表示名
 */
export const displayName = (name: string): string => name || UNTITLED;

/**
 * @description - アラートの補足説明を返す
 * @param {string} id - アラートのid
 * @return {string | null} - 補足説明
 */
export const noteFor = (id: string): string | null => (isFixed(id) ? (NOTES[id] ?? null) : null);

/**
 * @description - idでアラートを探す
 * @param {AlertsSettings} alerts - アラート設定
 * @param {string} id - アラートのid
 * @return {AlertDef | undefined} - 見つかったアラート
 */
export const findAlert = (alerts: AlertsSettings, id: string): AlertDef | undefined =>
  allAlerts(alerts).find((a) => a.id === id);

/**
 * @description - グループに属するアラートを返す
 * @param {AlertsSettings} alerts - アラート設定
 * @param {AlertGroup} group - グループ
 * @return {AlertDef[]} - アラート
 */
export const groupAlerts = (alerts: AlertsSettings, group: AlertGroup): AlertDef[] =>
  group.ids === "custom" ? alerts.custom : group.ids.map((id) => alerts[id]);

/**
 * @description - 一覧の項目のclass属性を作る
 * @param {AlertDef} a - アラート
 * @param {string} selectedId - 選択中のアラートのid
 * @return {string} - class属性
 */
export const itemClass = (a: AlertDef, selectedId: string): string =>
  compact(["alert-item", a.id === selectedId && "active", !a.enabled && "off"]).join(" ");

/**
 * @description - アラートの設定内容を検証する
 * @param {AlertDef} a - アラート
 * @return {string | null} - エラーメッセージ
 */
export const validateAlert = (a: AlertDef): string | null => {
  const { interval, times, once } = a.schedule;
  if (interval.enabled) {
    if (!(interval.minutes >= 1)) return "間隔は1分以上にしてください。";
    const from: number | null = parseHHMM(interval.from);
    const to: number | null = parseHHMM(interval.to);
    if (from === null || to === null) return "時間帯を入力してください。";
    if (from >= to) return "時間帯の開始は終了より前にしてください。";
  }
  if (times.enabled && times.list.some((t) => parseHHMM(t) === null)) return "時刻が正しくありません。";
  if (once && !DATE_PATTERN.test(once)) return "日付を入力してください。";
  return null;
};

/**
 * @description - 下書きの指定パスの値を差し替えた新しいアラートを返す
 * @param {AlertDef} a - 元のアラート
 * @param {string} path - 変更するパス
 * @param {unknown} value - 新しい値
 * @return {AlertDef} - 変更後のアラート
 */
export const setIn = (a: AlertDef, path: string, value: unknown): AlertDef => set(cloneDeep(a), path, value);

/**
 * @description - メッセージ欄のテキストを1行1メッセージに分ける
 * @param {string} text - 入力テキスト
 * @return {string[]} - メッセージ
 */
export const parseMessages = (text: string): string[] => compact(text.split(/\r?\n/).map((x) => x.trim()));

/**
 * @description - 絵文字欄のテキストを空白で区切る
 * @param {string} text - 入力テキスト
 * @return {string[]} - 絵文字
 */
export const parseEmojis = (text: string): string[] => compact(text.split(/\s+/));

/**
 * @description - 時間と分の入力から合計の分数を求める
 * @param {string} hours - 時間の入力値
 * @param {string} minutes - 分の入力値
 * @return {number} - 合計の分数
 */
export const toMinutes = (hours: string, minutes: string): number => (Number(hours) || 0) * 60 + (Number(minutes) || 0);

/**
 * @description - 時刻を一覧に追加できるかを判定する
 * @param {readonly string[]} list - 時刻一覧
 * @param {string} time - 追加する時刻
 * @return {boolean} - 追加できるならtrue
 */
export const canAddTime = (list: readonly string[], time: string): boolean =>
  parseHHMM(time) !== null && !list.includes(time);

/**
 * @description - 時刻を一覧に追加し、昇順に並べる
 * @param {readonly string[]} list - 時刻一覧
 * @param {string} time - 追加する時刻
 * @return {string[]} - 追加後の時刻一覧
 */
export const addTime = (list: readonly string[], time: string): string[] => sortBy(uniq([...list, time]));

/**
 * @description - 時刻を一覧から取り除く
 * @param {readonly string[]} list - 時刻一覧
 * @param {string} time - 取り除く時刻
 * @return {string[]} - 削除後の時刻一覧
 */
export const removeTime = (list: readonly string[], time: string): string[] => without(list, time);

/**
 * @description - 「繰り返しなし」の日付を決める
 * @param {boolean} once - 「繰り返しなし」を選んだか
 * @param {string} picked - 日付欄の値
 * @param {string} today - 今日の日付
 * @return {string} - schedule.onceに入れる値
 */
export const onceDate = (once: boolean, picked: string, today: string): string => (once ? picked || today : "");

/**
 * @description - 1件のアラートを保存するための設定差分を作る
 * @param {AlertsSettings} alerts - 現在のアラート設定
 * @param {AlertDef} a - 保存するアラート
 * @return {Partial<AlertsSettings>} - アラート設定の差分
 */
export const alertsPatchFor = (alerts: AlertsSettings, a: AlertDef): Partial<AlertsSettings> =>
  isFixed(a.id) ? { [a.id]: a } : { custom: alerts.custom.map((c) => (c.id === a.id ? a : c)) };

/**
 * @description - 設定にアラート設定の差分を適用した新しい設定を返す
 * @param {ClockSettings} s - 設定
 * @param {Partial<AlertsSettings>} patch - アラート設定の差分
 * @return {ClockSettings} - 適用後の設定
 */
export const withAlertsPatch = (s: ClockSettings, patch: Partial<AlertsSettings>): ClockSettings => ({
  ...s,
  alerts: { ...s.alerts, ...patch },
});

/**
 * @description - 新しいカスタムアラートを作る
 * @param {readonly AlertDef[]} custom - 既存のカスタムアラート
 * @param {number} nowMs - 現在時刻
 * @return {AlertDef} - 新しいカスタムアラート
 */
export const createCustomAlert = (custom: readonly AlertDef[], nowMs: number): AlertDef => ({
  ...newCustomAlert(`custom-${nowMs.toString(36)}`),
  name: `カスタム ${custom.length + 1}`,
});

/**
 * @description - カスタムアラートをidで取り除く
 * @param {readonly AlertDef[]} custom - カスタムアラート
 * @param {string} id - 取り除くアラートのid
 * @return {AlertDef[]} - 削除後のカスタムアラート
 */
export const removeCustomAlert = (custom: readonly AlertDef[], id: string): AlertDef[] =>
  custom.filter((c) => c.id !== id);
