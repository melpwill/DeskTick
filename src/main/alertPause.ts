import { padNumber } from "@/shared/format";

const MS_PER_MINUTE: number = 60_000;

export interface PauseChoice {
  readonly label: string;
  readonly minutes: number | null;
}

export const PAUSE_CHOICES: readonly PauseChoice[] = [
  { label: "30分", minutes: 30 },
  { label: "1時間", minutes: 60 },
  { label: "2時間", minutes: 120 },
  { label: "再開するまで", minutes: null },
];

export interface AlertPauseOptions {
  /**
   * @description - 現在時刻を返す
   * @return {number} - エポックミリ秒
   */
  now(): number;
  /**
   * @description - 停止・再開の状態が変わったときに呼ばれる
   * @return {void} - なし
   */
  onChange(): void;
}

export interface AlertPause {
  readonly paused: boolean;
  readonly until: number | null;
  /**
   * @description - 通知を一時停止する
   * @param {number | null} minutes - 停止する分数（nullなら再開するまで）
   * @return {void} - なし
   */
  pause(minutes: number | null): void;
  /**
   * @description - 通知を再開する
   * @return {void} - なし
   */
  resume(): void;
}

/**
 * @description - 停止の終了時刻を表示用の文字列にする
 * @param {number | null} until - 終了時刻（nullなら再開するまで）
 * @return {string} - "15:30まで"または"再開するまで"
 */
export const pauseUntilText = (until: number | null): string => {
  if (until === null) return "再開するまで";
  const d: Date = new Date(until);
  return `${padNumber(d.getHours())}:${padNumber(d.getMinutes())}まで`;
};

/**
 * @description - アラートの通知を一時停止する状態を作る（アプリを終了すると解除される）
 * @param {AlertPauseOptions} opts - 依存
 * @return {AlertPause} - 一時停止の状態
 */
export const createAlertPause = (opts: AlertPauseOptions): AlertPause => {
  let paused: boolean = false;
  let until: number | null = null;
  let timer: NodeJS.Timeout | null = null;

  /**
   * @description - 自動再開のタイマーを止める
   * @return {void} - なし
   */
  const clearTimer = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  /**
   * @description - 通知を再開する
   * @return {void} - なし
   */
  const resume = (): void => {
    clearTimer();
    if (!paused) return;
    paused = false;
    until = null;
    opts.onChange();
  };

  /**
   * @description - 通知を一時停止する
   * @param {number | null} minutes - 停止する分数（nullなら再開するまで）
   * @return {void} - なし
   */
  const pause = (minutes: number | null): void => {
    clearTimer();
    paused = true;
    until = minutes === null ? null : opts.now() + minutes * MS_PER_MINUTE;
    if (minutes !== null) timer = setTimeout(resume, minutes * MS_PER_MINUTE);
    opts.onChange();
  };

  return {
    /**
     * @description - 停止中かどうかを返す
     * @return {boolean} - 停止中ならtrue
     */
    get paused(): boolean {
      return paused;
    },
    /**
     * @description - 停止の終了時刻を返す
     * @return {number | null} - エポックミリ秒（停止していないか、再開するまでならnull）
     */
    get until(): number | null {
      return until;
    },
    pause,
    resume,
  };
};
