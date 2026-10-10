import { type AlertDef, isDue } from "@/shared/alerts";

const CHECK_INTERVAL_MS: number = 1000;

/**
 * @description - 数値を2桁にゼロ埋めする
 * @param {number} n - 数値
 * @return {string} - 2桁の文字列
 */
const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * @description - 日付と時:分から「分」単位の一意なキーを作る
 * @param {Date} d - 時刻
 * @return {string} - 分単位のキー
 */
export const minuteKey = (d: Date): string => `${d.toDateString()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

export interface AlertSchedulerOptions {
  /**
   * @description - 判定対象のアラート一覧を返す
   * @return {readonly AlertDef[]} - アラート一覧
   */
  alerts(): readonly AlertDef[];
  /**
   * @description - 現在時刻を返す
   * @return {Date} - 現在時刻
   */
  now(): Date;
  /**
   * @description - アラートを通知する
   * @param {AlertDef} alert - 通知するアラート
   * @return {void} - なし
   */
  fire(alert: AlertDef): void;
}

export interface AlertScheduler {
  /**
   * @description - 毎秒の判定を開始する
   * @return {void} - なし
   */
  start(): void;
  /**
   * @description - 判定を停止する
   * @return {void} - なし
   */
  stop(): void;
  /**
   * @description - 現在時刻で期限が来たアラートを通知する
   * @return {void} - なし
   */
  check(): void;
}

/**
 * @description - 毎秒判定し、アプリ起動中に時刻が来たアラートを通知するスケジューラを作る
 * @param {AlertSchedulerOptions} opts - 依存
 * @return {AlertScheduler} - スケジューラ
 */
export const createAlertScheduler = (opts: AlertSchedulerOptions): AlertScheduler => {
  const startedMinute: string = minuteKey(opts.now());
  const lastFired: Map<string, string> = new Map<string, string>();
  let timer: NodeJS.Timeout | null = null;

  /**
   * @description - 現在時刻で期限が来たアラートを通知する
   * @return {void} - なし
   */
  const check = (): void => {
    const now: Date = opts.now();
    const key: string = minuteKey(now);
    if (key === startedMinute) return;
    opts.alerts().forEach((a: AlertDef) => {
      if (lastFired.get(a.id) === key || !isDue(a, now)) return;
      lastFired.set(a.id, key);
      opts.fire(a);
    });
  };

  /**
   * @description - 毎秒の判定を開始する
   * @return {void} - なし
   */
  const start = (): void => {
    timer ??= setInterval(check, CHECK_INTERVAL_MS);
  };

  /**
   * @description - 判定を停止する
   * @return {void} - なし
   */
  const stop = (): void => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  return { start, stop, check };
};
