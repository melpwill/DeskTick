export const DEFAULT_SETTINGS_TAB: string = "display";

const SETTINGS_FLAG: string = "--settings";

/**
 * @description - コマンドラインの"--settings" / "--settings=<tab>"を解釈し、開く設定タブを返す
 * @param {readonly string[]} argv - プロセスのコマンドライン引数
 * @return {string | null} - 開くタブ名
 */
export const settingsArg = (argv: readonly string[]): string | null => {
  const arg: string | undefined = argv.find((x: string) => x === SETTINGS_FLAG || x.startsWith(`${SETTINGS_FLAG}=`));
  if (arg === undefined) return null;
  return arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : DEFAULT_SETTINGS_TAB;
};
