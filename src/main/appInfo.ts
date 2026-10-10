import { type AppInfo, type AutoStartInfo } from "@/shared/types";

export interface RuntimeVersions {
  readonly electron: string;
  readonly chrome: string;
  readonly node: string;
}

export interface AppInfoSource {
  readonly productName: string;
  readonly version: string;
  readonly versions: RuntimeVersions;
  readonly settingsPath: string;
  readonly exePath: string;
}

/**
 * @description - 設定画面の「バージョン情報」に出すAppInfoを組み立てる
 * @param {AppInfoSource} src - 元になる値
 * @return {AppInfo} - アプリ情報
 */
export const buildAppInfo = (src: AppInfoSource): AppInfo => ({
  productName: src.productName,
  version: src.version,
  electron: src.versions.electron,
  chrome: src.versions.chrome,
  node: src.versions.node,
  settingsPath: src.settingsPath,
  exePath: src.exePath,
});

/**
 * @description - 自動起動の状態を組み立てる
 * @param {boolean} isPackaged - パッケージ済みかどうか
 * @param {(exePath: string) => boolean} openAtLogin - 指定exeがログイン時に起動するかを返す関数
 * @param {string} exePath - exeのパス
 * @return {AutoStartInfo} - 自動起動の状態
 */
export const buildAutoStartInfo = (
  isPackaged: boolean,
  openAtLogin: (exePath: string) => boolean,
  exePath: string,
): AutoStartInfo => ({
  supported: isPackaged,
  enabled: isPackaged && openAtLogin(exePath),
  path: exePath,
});
