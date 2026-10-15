import {
  app,
  BrowserWindow,
  ipcMain,
  type IpcMainEvent,
  Menu,
  type MenuItem,
  nativeImage,
  type NativeImage,
  powerMonitor,
  screen,
  shell,
  Tray,
} from "electron";
import * as path from "path";
import { type AlertDialogs, createAlertDialogs } from "@/main/alertDialogs";
import { type AlertScheduler, createAlertScheduler } from "@/main/alertScheduler";
import { buildAppInfo, buildAutoStartInfo } from "@/main/appInfo";
import { DEFAULT_SETTINGS_TAB, settingsArg } from "@/main/cli";
import { toDisplayInfos } from "@/main/displays";
import { listFonts } from "@/main/fonts";
import { createNotifier, type Notifier } from "@/main/notifier";
import { createNtpSync, type NtpSync } from "@/main/ntp";
import { resolveExePath, resolveLicensesPath } from "@/main/paths";
import { anchoredBounds, contentSize, defaultPosition, pickDisplay, type Rect, type Size } from "@/main/placement";
import { diffSettings, type SettingsChanges } from "@/main/settingsChanges";
import { createSettingsStore, type SettingsStore } from "@/main/store";
import { type AlertDef, alertText, allAlerts, isDialogAlert, safeColor } from "@/shared/alerts";
import { type ClockSettings, type DeepPartial } from "@/shared/settings";
import { type AppInfo, type AutoStartInfo, type DisplayInfo, type NtpStatus } from "@/shared/types";

const PRODUCT_NAME: string = "DeskTick";
const APP_USER_MODEL_ID: string = "jp.melpwill.desktick";
const STATIC_DIR: string = path.join(__dirname, "..", "static");
const ICON_PATH: string = path.join(STATIC_DIR, "icon.png");
const PRELOAD: string = path.join(__dirname, "preload.js");

let store: SettingsStore;
let ntp: NtpSync;
let notifier: Notifier;
let dialogs: AlertDialogs;
let clockWin: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let placed: boolean = false;

/**
 * @description - 実際の.exeのパスを返す
 * @return {string} - exeのパス
 */
const exePath = (): string => resolveExePath(process.env, process.execPath);

/**
 * @description - 全ウィンドウにIPCメッセージを送る
 * @param {string} channel - チャネル名
 * @param {unknown[]} args - 送る値
 * @return {void} - なし
 */
const broadcast = (channel: string, ...args: unknown[]): void => {
  BrowserWindow.getAllWindows().forEach((w: BrowserWindow) => w.webContents.send(channel, ...args));
};

/**
 * @description - 設定に従って時計を置くディスプレイの作業領域を返す
 * @return {Rect} - 作業領域
 */
const targetWorkArea = (): Rect =>
  pickDisplay(screen.getAllDisplays(), store.value.position.display, screen.getPrimaryDisplay()).workArea;

/**
 * @description - 指定サイズの時計のデフォルト位置を求める
 * @param {Size} size - 時計の大きさ
 * @return {Rect} - 位置と大きさ
 */
const defaultBounds = (size: Size): Rect => ({
  ...defaultPosition(targetWorkArea(), store.value.position, size),
  ...size,
});

/**
 * @description - 時計をデフォルト位置へ移動する
 * @return {void} - なし
 */
const moveToDefault = (): void => {
  if (!clockWin) return;
  const [width, height] = clockWin.getSize();
  const { x, y } = defaultBounds({ width, height });
  clockWin.setPosition(x, y);
};

/**
 * @description - 設定の角に近い辺を固定したまま時計をリサイズする
 * @param {Size} size - 新しい大きさ
 * @return {void} - なし
 */
const resizeClock = (size: Size): void => {
  if (!clockWin) return;
  const next: Rect | null = anchoredBounds(clockWin.getBounds(), size, store.value.position.corner);
  if (next) clockWin.setBounds(next);
};

/**
 * @description - 時計ウィンドウを作る
 * @return {void} - なし
 */
const createClockWindow = (): void => {
  const win: BrowserWindow = new BrowserWindow({
    title: PRODUCT_NAME,
    width: 200,
    height: 80,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: store.value.alwaysOnTop,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  clockWin = win;
  if (store.value.alwaysOnTop) win.setAlwaysOnTop(true, "screen-saver");
  win.setMenu(null);

  win.webContents.on("before-input-event", (_e: Electron.Event, input: Electron.Input) => {
    if (input.type === "keyDown" && input.key === "Escape") app.quit();
  });

  win.on("system-context-menu", (e: Electron.Event) => {
    e.preventDefault();
    buildMenu().popup({ window: clockWin ?? undefined });
  });

  win.on("closed", () => {
    clockWin = null;
  });

  void win.loadFile(path.join(STATIC_DIR, "index.html"));
};

/**
 * @description - 時計の表示・非表示を切り替える
 * @return {void} - なし
 */
const toggleClock = (): void => {
  if (!clockWin) return;
  if (clockWin.isVisible()) clockWin.hide();
  else clockWin.showInactive();
};

/**
 * @description - 設定ウィンドウを開く
 * @param {string} tab - 開くタブ
 * @return {void} - なし
 */
const openSettings = (tab: string = DEFAULT_SETTINGS_TAB): void => {
  if (settingsWin) {
    settingsWin.webContents.send("settings:tab", tab);
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  const win: BrowserWindow = new BrowserWindow({
    title: `${PRODUCT_NAME} 設定`,
    width: 860,
    height: 680,
    minWidth: 720,
    minHeight: 480,
    icon: ICON_PATH,
    show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  settingsWin = win;
  win.setMenu(null);
  win.once("ready-to-show", () => settingsWin?.show());
  win.on("closed", () => {
    settingsWin = null;
  });
  void win.loadFile(path.join(STATIC_DIR, "settings.html"), { query: { tab } });
};

/**
 * @description - コマンドラインに"--settings"があれば設定ウィンドウを開く
 * @param {readonly string[]} argv - コマンドライン引数
 * @return {void} - なし
 */
const openSettingsFromArgs = (argv: readonly string[]): void => {
  const tab: string | null = settingsArg(argv);
  if (tab) openSettings(tab);
};

/**
 * @description - 右クリックメニューを作る
 * @return {Menu} - メニュー
 */
const buildMenu = (): Menu => {
  const visible: boolean = clockWin?.isVisible() ?? false;
  return Menu.buildFromTemplate([
    { label: "設定...", click: () => openSettings() },
    { label: visible ? "時計を隠す" : "時計を表示", click: toggleClock },
    { label: "デフォルト位置に戻す", click: moveToDefault },
    {
      label: "最前面に固定",
      type: "checkbox",
      checked: store.value.alwaysOnTop,
      click: (mi: MenuItem) => updateSettings({ alwaysOnTop: mi.checked }),
    },
    { type: "separator" },
    { label: "バージョン情報 / ヘルプ", click: () => openSettings("about") },
    { type: "separator" },
    { label: "終了", click: () => app.quit() },
  ]);
};

/**
 * @description - タスクトレイのアイコンを作る
 * @return {void} - なし
 */
const createTray = (): void => {
  const icon: NativeImage = nativeImage.createFromPath(ICON_PATH).resize({ width: 32, height: 32, quality: "best" });
  const t: Tray = new Tray(icon);
  tray = t;
  t.setToolTip(PRODUCT_NAME);
  t.on("click", toggleClock);
  t.on("right-click", () => tray?.popUpContextMenu(buildMenu()));
};

/**
 * @description - 設定の変更をウィンドウ・NTP・全レンダラーに反映する
 * @param {ClockSettings} prev - 変更前の設定
 * @param {ClockSettings} next - 変更後の設定
 * @return {void} - なし
 */
const applySettings = (prev: ClockSettings, next: ClockSettings): void => {
  const changes: SettingsChanges = diffSettings(prev, next);
  if (clockWin && changes.alwaysOnTop) clockWin.setAlwaysOnTop(next.alwaysOnTop, "screen-saver");
  if (changes.position) moveToDefault();
  ntp.configure(next.ntp);
  broadcast("settings:changed", next);
};

/**
 * @description - アラートを通知する
 * @param {AlertDef} a - アラート
 * @return {void} - なし
 */
const showAlert = (a: AlertDef): void => {
  const { title, body } = alertText(a, PRODUCT_NAME);
  if (isDialogAlert(a)) dialogs.show({ title, body, color: safeColor(a.color) });
  else notifier.show(title, body);
};

/**
 * @description - 設定の一部を更新して反映する
 * @param {DeepPartial<ClockSettings>} patch - 変更内容
 * @return {void} - なし
 */
const updateSettings = (patch: DeepPartial<ClockSettings>): void => {
  const prev: ClockSettings = store.value;
  store.update(patch);
  applySettings(prev, store.value);
};

/**
 * @description - 設定を既定値に戻して反映する
 * @return {ClockSettings} - 戻した後の設定
 */
const resetSettings = (): ClockSettings => {
  const prev: ClockSettings = store.value;
  store.reset();
  applySettings(prev, store.value);
  return store.value;
};

/**
 * @description - 自動起動の状態を返す
 * @return {AutoStartInfo} - 自動起動の状態
 */
const autoStartInfo = (): AutoStartInfo =>
  buildAutoStartInfo(app.isPackaged, (p: string) => app.getLoginItemSettings({ path: p }).openAtLogin, exePath());

/**
 * @description - 時計の内容サイズの報告を受け、初回は配置して表示し、以降はリサイズする
 * @param {number} w - 幅
 * @param {number} h - 高さ
 * @return {void} - なし
 */
const onClockSize = (w: number, h: number): void => {
  if (!clockWin) return;
  const size: Size = contentSize(w, h);
  if (placed) return resizeClock(size);
  clockWin.setBounds(defaultBounds(size));
  placed = true;
  clockWin.showInactive();
};

/**
 * @description - レンダラーからのIPCを登録する
 * @return {void} - なし
 */
const registerIpc = (): void => {
  ipcMain.handle("settings:get", () => store.value);
  ipcMain.on("settings:update", (_e: IpcMainEvent, patch: DeepPartial<ClockSettings>) => updateSettings(patch));
  ipcMain.handle("settings:reset", () => resetSettings());

  ipcMain.on("clock:size", (_e: IpcMainEvent, w: number, h: number) => onClockSize(w, h));
  ipcMain.on("clock:reset-position", () => moveToDefault());
  ipcMain.on("alert-dialog:size", (e: IpcMainEvent, w: number, h: number) => dialogs.resize(e.sender, w, h));

  ipcMain.handle("ntp:status", () => ntp.status);
  ipcMain.handle("ntp:sync", () => ntp.syncNow());
  ipcMain.on("alert:test", (_e: IpcMainEvent, id: string) => {
    const a: AlertDef | undefined = allAlerts(store.value.alerts).find((x: AlertDef) => x.id === id);
    if (a) showAlert(a);
  });

  ipcMain.handle("fonts:list", () => listFonts());
  ipcMain.handle("displays:list", (): DisplayInfo[] =>
    toDisplayInfos(screen.getAllDisplays(), screen.getPrimaryDisplay().id),
  );

  ipcMain.handle("autostart:get", () => autoStartInfo());
  ipcMain.handle("autostart:set", (_e: Electron.IpcMainInvokeEvent, enabled: boolean) => {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: enabled, path: exePath() });
    return autoStartInfo();
  });

  ipcMain.handle("app:info", (): AppInfo =>
    buildAppInfo({
      productName: PRODUCT_NAME,
      version: app.getVersion(),
      versions: process.versions,
      settingsPath: store.file,
      exePath: exePath(),
    }),
  );
  ipcMain.on("app:open-settings-folder", () => {
    store.flush();
    shell.showItemInFolder(store.file);
  });
  ipcMain.on("app:open-licenses", () => void shell.openPath(resolveLicensesPath(process.execPath)));
};

/**
 * @description - アプリの準備完了後にストア・NTP・通知・ウィンドウ等を起動する
 * @return {void} - なし
 */
const boot = (): void => {
  store = createSettingsStore((prev: ClockSettings) => applySettings(prev, store.value));
  ntp = createNtpSync((s: NtpStatus) => broadcast("ntp:status", s));
  notifier = createNotifier({
    productName: PRODUCT_NAME,
    appUserModelId: APP_USER_MODEL_ID,
    exePath: exePath(),
    iconPath: ICON_PATH,
  });
  notifier.registerAppId();
  dialogs = createAlertDialogs({
    productName: PRODUCT_NAME,
    htmlPath: path.join(STATIC_DIR, "alert.html"),
    preloadPath: PRELOAD,
    workArea: targetWorkArea,
  });
  const scheduler: AlertScheduler = createAlertScheduler({
    alerts: () => allAlerts(store.value.alerts),
    now: () => new Date(Date.now() + ntp.status.offsetMs),
    fire: showAlert,
  });
  registerIpc();
  createClockWindow();
  createTray();
  ntp.configure(store.value.ntp);
  scheduler.start();
  powerMonitor.on("resume", () => void ntp.syncNow());
  openSettingsFromArgs(process.argv);
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(APP_USER_MODEL_ID);
  app.on("second-instance", (_e: Electron.Event, argv: string[]) => {
    clockWin?.showInactive();
    openSettingsFromArgs(argv);
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => store?.flush());

  void app.whenReady().then(boot);
}
