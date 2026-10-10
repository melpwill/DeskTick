import { execFile } from "child_process";
import { compact, uniq } from "lodash-es";

/** インストール済みフォントのファミリー名を1行ずつ出力するPowerShellスクリプト */
const SCRIPT: string =
  "[Console]::OutputEncoding=[Text.Encoding]::UTF8;" +
  "Add-Type -AssemblyName System.Drawing;" +
  "(New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }";

/** PowerShellの起動引数 */
const ARGS: readonly string[] = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT];

/**
 * @description - PowerShellの出力をフォント名の一覧に変換する
 * @param {string} stdout - PowerShellの標準出力
 * @return {string[]} - フォント名の一覧
 */
export const parseFontList = (stdout: string): string[] =>
  uniq(compact(stdout.split(/\r?\n/).map((s: string) => s.trim()))).sort((a: string, b: string) => a.localeCompare(b));

/**
 * @description - フォント一覧を取得する関数を作る
 * @return {() => Promise<string[]>} - フォント一覧を返す関数
 */
export const createFontLister = (): (() => Promise<string[]>) => {
  let cache: Promise<string[]> | null = null;

  /**
   * @description - PowerShell を非表示で起動してフォント一覧を読み取る
   * @return {Promise<string[]>} - フォント名の一覧
   */
  const load = (): Promise<string[]> =>
    new Promise((resolve: (names: string[]) => void) => {
      execFile(
        "powershell.exe",
        [...ARGS],
        { windowsHide: true, encoding: "utf8", timeout: 20_000, maxBuffer: 4 * 1024 * 1024 },
        (err: Error | null, stdout: string) => {
          if (err) {
            cache = null;
            resolve([]);
            return;
          }
          resolve(parseFontList(stdout));
        },
      );
    });

  return (): Promise<string[]> => (cache ??= load());
};

/**
 * @description - インストール済みフォントのファミリー名を返す
 * @return {Promise<string[]>} - フォント名の一覧
 */
export const listFonts: () => Promise<string[]> = createFontLister();
