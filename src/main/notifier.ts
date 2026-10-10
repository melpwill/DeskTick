import { execFile } from "child_process";
import { app, dialog, Notification, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import { toastXml } from "@/main/toastXml";

export interface NotifierOptions {
  readonly productName: string;
  readonly appUserModelId: string;
  readonly exePath: string;
  readonly iconPath: string;
}

export interface Notifier {
  readonly activeCount: number;
  /**
   * @description - AppUserModelIDに対するトーストの見出し名とアイコンをレジストリに登録する
   * @return {void} - なし
   */
  registerAppId(): void;
  /**
   * @description - 通知を表示する
   * @param {string} title - タイトル
   * @param {string} body - 本文
   * @return {void} - なし
   */
  show(title: string, body: string): void;
}

/**
 * @description - Windows上で実行中かどうかを判定する
 * @return {boolean} - Windowsならtrue
 */
const isWindows = (): boolean => process.platform === "win32";

/**
 * @description - アプリ内のアイコンをWindowsが読める場所へコピーし、そのパスを返す
 * @param {string} iconPath - アプリ内のアイコンのパス
 * @return {string} - コピー先のパス
 */
const exportToastIcon = (iconPath: string): string => {
  const icon: string = path.join(app.getPath("userData"), "toast-icon.png");
  try {
    fs.mkdirSync(path.dirname(icon), { recursive: true });
    fs.writeFileSync(icon, fs.readFileSync(iconPath));
  } catch (e) {
    console.error("Failed to write toast icon:", e);
  }
  return icon;
};

/**
 * @description - reg.exeでレジストリに文字列値を書き込む
 * @param {string} key - レジストリキー
 * @param {string} name - 値の名前
 * @param {string} value - 値
 * @return {void} - なし
 */
const regAdd = (key: string, name: string, value: string): void => {
  execFile(
    "reg.exe",
    ["add", key, "/v", name, "/t", "REG_SZ", "/d", value, "/f"],
    { windowsHide: true },
    (err: Error | null) => {
      if (err) console.error(`Failed to register ${name}:`, err);
    },
  );
};

/**
 * @description - スタートメニューのショートカットのパスを返す
 * @param {string} productName - 製品名
 * @return {string} - .lnkのパス
 */
const shortcutPath = (productName: string): string =>
  path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", `${productName}.lnk`);

/**
 * @description - 既存のショートカットが現在のexeとAppUserModelIDを指しているかを判定する
 * @param {string} lnk - ショートカットのパス
 * @param {NotifierOptions} opts - アプリ情報
 * @return {boolean} - 一致していればtrue
 */
const shortcutMatches = (lnk: string, opts: NotifierOptions): boolean => {
  try {
    const cur: Electron.ShortcutDetails = shell.readShortcutLink(lnk);
    return cur.target === opts.exePath && cur.appUserModelId === opts.appUserModelId;
  } catch {
    return false;
  }
};

/**
 * @description - WindowsはスタートメニューにショートカットがあるAppUserModelIDのトーストしか表示しないため、必要なら作成・更新する
 * @param {NotifierOptions} opts - アプリ情報
 * @return {void} - なし
 */
const ensureShortcut = (opts: NotifierOptions): void => {
  if (!isWindows()) return;
  const lnk: string = shortcutPath(opts.productName);
  if (shortcutMatches(lnk, opts)) return;
  shell.writeShortcutLink(lnk, fs.existsSync(lnk) ? "replace" : "create", {
    target: opts.exePath,
    appUserModelId: opts.appUserModelId,
    description: opts.productName,
  });
};

/**
 * @description - 通知を表示するNotifierを作る
 * @param {NotifierOptions} opts - アプリ情報
 * @return {Notifier} - Notifier
 */
export const createNotifier = (opts: NotifierOptions): Notifier => {
  const live: Set<Notification> = new Set<Notification>();

  /**
   * @description - トーストが使えないときにメッセージボックスで代替表示する
   * @param {string} title - タイトル
   * @param {string} body - 本文
   * @return {void} - なし
   */
  const fallback = (title: string, body: string): void => {
    void dialog.showMessageBox({ type: "info", title: opts.productName, message: title, detail: body });
  };

  /**
   * @description - AppUserModelIDに対するトーストの見出し名とアイコンをレジストリに登録する
   * @return {void} - なし
   */
  const registerAppId = (): void => {
    if (!isWindows()) return;
    const icon: string = exportToastIcon(opts.iconPath);
    const key: string = `HKCU\\Software\\Classes\\AppUserModelId\\${opts.appUserModelId}`;
    regAdd(key, "DisplayName", opts.productName);
    regAdd(key, "IconUri", icon);
  };

  /**
   * @description - 通知を表示する
   * @param {string} title - タイトル
   * @param {string} body - 本文
   * @return {void} - なし
   */
  const show = (title: string, body: string): void => {
    if (!Notification.isSupported()) return fallback(title, body);

    ensureShortcut(opts);
    const n: Notification = new Notification({ title, body, silent: true, toastXml: toastXml(title, body) });
    live.add(n);
    /**
     * @description - 通知の参照を解放する
     * @return {boolean} - 解放できたらtrue
     */
    const release = (): boolean => live.delete(n);
    n.on("close", release);
    n.on("failed", () => {
      release();
      fallback(title, body);
    });
    n.show();
  };

  return {
    /**
     * @description - 表示中の通知の数を返す
     * @return {number} - 通知の数
     */
    get activeCount(): number {
      return live.size;
    },
    registerAppId,
    show,
  };
};
