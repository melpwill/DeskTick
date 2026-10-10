import * as path from "path";

export type Env = Readonly<Record<string, string | undefined>>;

/**
 * @description - 実際の.exe のパスを返す
 * @param {Env} env - 環境変数
 * @param {string} execPath - 実行中プロセスのパス
 * @return {string} - 自動起動やショートカットに使うexeのパス
 */
export const resolveExePath = (env: Env, execPath: string): string => env.PORTABLE_EXECUTABLE_FILE || execPath;

/**
 * @description - config.jsonを置くディレクトリを返す
 * @param {Env} env - 環境変数
 * @param {boolean} isPackaged - パッケージ済みかどうか
 * @param {string} execPath - 実行中プロセスのパス
 * @param {() => string} appPath - 開発時のアプリディレクトリを返す関数
 * @return {string} - 設定ファイルのディレクトリ
 */
export const resolveConfigDir = (env: Env, isPackaged: boolean, execPath: string, appPath: () => string): string =>
  env.PORTABLE_EXECUTABLE_DIR ?? (isPackaged ? path.dirname(execPath) : appPath());
