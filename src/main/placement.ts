import { type ClockSettings, type Corner } from "@/shared/settings";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export type Rect = Point & Size;

export type PositionSettings = Readonly<ClockSettings["position"]>;

/**
 * @description - 角が右側かどうかを判定する
 * @param {Corner} corner - 基準の角
 * @return {boolean} - 右側の角なら true
 */
export const isRightCorner = (corner: Corner): boolean => corner.endsWith("right");

/**
 * @description - 角が下側かどうかを判定する
 * @param {Corner} corner - 基準の角
 * @return {boolean} - 下側の角ならtrue
 */
export const isBottomCorner = (corner: Corner): boolean => corner.startsWith("bottom");

/**
 * @description - 設定のディスプレイ番号に対応するディスプレイを選ぶ
 * @param {readonly T[]} displays - 接続中の全ディスプレイ
 * @param {number} index - 設定のディスプレイ番号
 * @param {T} primary - メインディスプレイ
 * @return {T} - 時計を置くディスプレイ
 */
export const pickDisplay = <T>(displays: readonly T[], index: number, primary: T): T =>
  (index >= 0 && displays[index]) || primary;

/**
 * @description - 作業領域の指定の角から余白分だけ内側に置いたときの左上座標を求める
 * @param {Rect} workArea - ディスプレイの作業領域
 * @param {PositionSettings} position - 角と余白の設定
 * @param {Size} size - ウィンドウの大きさ
 * @return {Point} - ウィンドウの左上座標
 */
export const defaultPosition = (workArea: Rect, position: PositionSettings, size: Size): Point => ({
  x: isRightCorner(position.corner)
    ? workArea.x + workArea.width - size.width - position.marginX
    : workArea.x + position.marginX,
  y: isBottomCorner(position.corner)
    ? workArea.y + workArea.height - size.height - position.marginY
    : workArea.y + position.marginY,
});

/**
 * @description - 設定の角に近い辺を固定したままリサイズした矩形を求める
 * @param {Rect} current - 現在のウィンドウ矩形
 * @param {Size} size - 新しい大きさ
 * @param {Corner} corner - 固定する角
 * @return {Rect | null} - 新しい矩形
 */
export const anchoredBounds = (current: Rect, size: Size, corner: Corner): Rect | null =>
  current.width === size.width && current.height === size.height
    ? null
    : {
        x: isRightCorner(corner) ? current.x + current.width - size.width : current.x,
        y: isBottomCorner(corner) ? current.y + current.height - size.height : current.y,
        width: size.width,
        height: size.height,
      };

/**
 * @description - レンダラーが報告した内容サイズを、ウィンドウに使える1px以上の整数に丸める
 * @param {number} width - 報告された幅
 * @param {number} height - 報告された高さ
 * @return {Size} - 切り上げ済みの大きさ
 */
export const contentSize = (width: number, height: number): Size => ({
  width: Math.max(1, Math.ceil(width)),
  height: Math.max(1, Math.ceil(height)),
});

/**
 * @description - 作業領域の右下から上へ、ウィンドウを積み重ねた矩形を求める
 * @param {Rect} workArea - ディスプレイの作業領域
 * @param {readonly Size[]} sizes - 下から順のウィンドウの大きさ
 * @param {number} gap - 余白と間隔
 * @return {Rect[]} - sizesと同じ順の矩形
 */
export const stackBounds = (workArea: Rect, sizes: readonly Size[], gap: number): Rect[] =>
  sizes.reduce<Rect[]>((acc: Rect[], size: Size): Rect[] => {
    const bottom: number = acc.length ? acc[acc.length - 1].y : workArea.y + workArea.height;
    return [...acc, { x: workArea.x + workArea.width - size.width - gap, y: bottom - size.height - gap, ...size }];
  }, []);
