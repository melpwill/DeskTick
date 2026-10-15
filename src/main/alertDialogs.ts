import { BrowserWindow } from "electron";
import { contentSize, type Rect, type Size, stackBounds } from "@/main/placement";

const GAP: number = 12;

export interface AlertDialogContent {
  readonly title: string;
  readonly body: string;
  readonly color: string;
}

export interface AlertDialogOptions {
  readonly productName: string;
  readonly htmlPath: string;
  readonly preloadPath: string;
  /**
   * @description - ダイアログを積み重ねるディスプレイの作業領域を返す
   * @return {Rect} - 作業領域
   */
  workArea(): Rect;
}

export interface AlertDialogs {
  readonly openCount: number;
  /**
   * @description - 通知ダイアログを開く
   * @param {AlertDialogContent} content - 表示内容
   * @return {void} - なし
   */
  show(content: AlertDialogContent): void;
  /**
   * @description - ダイアログの内容サイズの報告を受け、配置し直す
   * @param {Electron.WebContents} sender - 報告したダイアログのWebContents
   * @param {number} w - 幅
   * @param {number} h - 高さ
   * @return {void} - なし
   */
  resize(sender: Electron.WebContents, w: number, h: number): void;
}

interface Entry {
  readonly win: BrowserWindow;
  size: Size | null;
}

/**
 * @description - 大きさが分かったエントリかを判定する
 * @param {Entry} e - エントリ
 * @return {boolean} - 大きさが分かっていればtrue
 */
const isSized = (e: Entry): e is Entry & { size: Size } => e.size !== null;

/**
 * @description - 画面の右下に積み重ねて表示する通知ダイアログを管理する
 * @param {AlertDialogOptions} opts - 設定
 * @return {AlertDialogs} - 通知ダイアログ
 */
export const createAlertDialogs = (opts: AlertDialogOptions): AlertDialogs => {
  let entries: Entry[] = [];

  /**
   * @description - 開いた順に右下から上へ並べ直す
   * @return {void} - なし
   */
  const layout = (): void => {
    const sized: (Entry & { size: Size })[] = entries.filter(isSized);
    const rects: Rect[] = stackBounds(
      opts.workArea(),
      sized.map((e) => e.size),
      GAP,
    );
    sized.forEach((e, i: number) => e.win.setBounds(rects[i]));
  };

  /**
   * @description - 通知ダイアログを開く
   * @param {AlertDialogContent} content - 表示内容
   * @return {void} - なし
   */
  const show = (content: AlertDialogContent): void => {
    const win: BrowserWindow = new BrowserWindow({
      title: opts.productName,
      width: 360,
      height: 120,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: { preload: opts.preloadPath, contextIsolation: true, sandbox: true },
    });
    win.setAlwaysOnTop(true, "screen-saver");
    win.setMenu(null);
    entries = [...entries, { win, size: null }];
    win.on("closed", () => {
      entries = entries.filter((e) => e.win !== win);
      layout();
    });
    void win.loadFile(opts.htmlPath, { query: { ...content, app: opts.productName } });
  };

  /**
   * @description - ダイアログの内容サイズの報告を受け、配置し直す
   * @param {Electron.WebContents} sender - 報告したダイアログのWebContents
   * @param {number} w - 幅
   * @param {number} h - 高さ
   * @return {void} - なし
   */
  const resize = (sender: Electron.WebContents, w: number, h: number): void => {
    const entry: Entry | undefined = entries.find((e) => e.win.webContents === sender);
    if (!entry) return;
    const first: boolean = entry.size === null;
    entry.size = contentSize(w, h);
    layout();
    if (first) entry.win.showInactive();
  };

  return {
    /**
     * @description - 開いているダイアログの数を返す
     * @return {number} - ダイアログの数
     */
    get openCount(): number {
      return entries.length;
    },
    show,
    resize,
  };
};
