const SECOND_MS: number = 1000;

/**
 * @description - 次の秒の境界までの残りミリ秒を計算する
 * @param {number} nowMs - 現在時刻
 * @return {number} - 次の秒までのミリ秒
 */
export const msToNextSecond = (nowMs: number): number => SECOND_MS - (nowMs % SECOND_MS);
