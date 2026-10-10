import { contextBridge, ipcRenderer } from "electron";
import type { ClockSettings, DeepPartial } from "@/shared/settings";
import type { AppInfo, AutoStartInfo, DisplayInfo, NtpStatus } from "@/shared/types";

/**
 * @description - メインプロセスからの通知チャネルを購読する
 * @param {string} channel - IPCチャネル名
 * @param {(v: T) => void} cb - 受信時に呼ぶ関数
 * @return {void} - なし
 */
const listen = <T>(channel: string, cb: (v: T) => void): void => {
  ipcRenderer.on(channel, (_e: Electron.IpcRendererEvent, v: T) => cb(v));
};

export interface Api {
  getSettings: () => Promise<ClockSettings>;
  updateSettings: (patch: DeepPartial<ClockSettings>) => void;
  resetSettings: () => Promise<ClockSettings>;
  onSettings: (cb: (s: ClockSettings) => void) => void;
  onShowTab: (cb: (tab: string) => void) => void;
  reportSize: (w: number, h: number) => void;
  moveToDefault: () => void;
  getNtpStatus: () => Promise<NtpStatus>;
  syncNtp: () => Promise<NtpStatus>;
  onNtpStatus: (cb: (s: NtpStatus) => void) => void;
  testAlert: (id: string) => void;
  listFonts: () => Promise<string[]>;
  listDisplays: () => Promise<DisplayInfo[]>;
  getAutoStart: () => Promise<AutoStartInfo>;
  setAutoStart: (enabled: boolean) => Promise<AutoStartInfo>;
  getAppInfo: () => Promise<AppInfo>;
  openSettingsFolder: () => void;
}

const api: Api = {
  /**
   * @description - 現在の設定を取得する
   * @return {Promise<ClockSettings>} - 設定
   */
  getSettings: (): Promise<ClockSettings> => ipcRenderer.invoke("settings:get"),
  /**
   * @description - 設定の一部を更新する
   * @param {DeepPartial<ClockSettings>} patch - 変更内容
   * @return {void} - なし
   */
  updateSettings: (patch: DeepPartial<ClockSettings>): void => ipcRenderer.send("settings:update", patch),
  /**
   * @description - 設定を既定値に戻す
   * @return {Promise<ClockSettings>} - 戻した後の設定
   */
  resetSettings: (): Promise<ClockSettings> => ipcRenderer.invoke("settings:reset"),
  /**
   * @description - 設定変更の通知を購読する
   * @param {(s: ClockSettings) => void} cb - 新しい設定を受け取る関数
   * @return {void} - なし
   */
  onSettings: (cb: (s: ClockSettings) => void): void => listen("settings:changed", cb),
  /**
   * @description - 設定画面のタブ切り替え要求を購読する
   * @param {(tab: string) => void} cb - タブ名を受け取る関数
   * @return {void} - なし
   */
  onShowTab: (cb: (tab: string) => void): void => listen("settings:tab", cb),

  /**
   * @description - 時計の内容サイズを報告する
   * @param {number} w - 幅
   * @param {number} h - 高さ
   * @return {void} - なし
   */
  reportSize: (w: number, h: number): void => ipcRenderer.send("clock:size", w, h),
  /**
   * @description - 時計をデフォルト位置に戻す
   * @return {void} - なし
   */
  moveToDefault: (): void => ipcRenderer.send("clock:reset-position"),

  /**
   * @description - NTPの同期状態を取得する
   * @return {Promise<NtpStatus>} - 同期状態
   */
  getNtpStatus: (): Promise<NtpStatus> => ipcRenderer.invoke("ntp:status"),
  /**
   * @description - 今すぐNTP同期する
   * @return {Promise<NtpStatus>} - 同期後の状態
   */
  syncNtp: (): Promise<NtpStatus> => ipcRenderer.invoke("ntp:sync"),
  /**
   * @description - NTP状態の変化を購読する
   * @param {(s: NtpStatus) => void} cb - 新しい状態を受け取る関数
   * @return {void} - なし
   */
  onNtpStatus: (cb: (s: NtpStatus) => void): void => listen("ntp:status", cb),

  /**
   * @description - アラートを試しに通知する
   * @param {string} id - アラートID
   * @return {void} - なし
   */
  testAlert: (id: string): void => ipcRenderer.send("alert:test", id),

  /**
   * @description - インストール済みフォントの一覧を取得する
   * @return {Promise<string[]>} - フォント名の一覧
   */
  listFonts: (): Promise<string[]> => ipcRenderer.invoke("fonts:list"),
  /**
   * @description - ディスプレイの一覧を取得する
   * @return {Promise<DisplayInfo[]>} - ディスプレイの一覧
   */
  listDisplays: (): Promise<DisplayInfo[]> => ipcRenderer.invoke("displays:list"),

  /**
   * @description - 自動起動の状態を取得する
   * @return {Promise<AutoStartInfo>} - 自動起動の状態
   */
  getAutoStart: (): Promise<AutoStartInfo> => ipcRenderer.invoke("autostart:get"),
  /**
   * @description - 自動起動を切り替える
   * @param {boolean} enabled - 有効にするか
   * @return {Promise<AutoStartInfo>} - 切り替え後の状態
   */
  setAutoStart: (enabled: boolean): Promise<AutoStartInfo> => ipcRenderer.invoke("autostart:set", enabled),

  /**
   * @description - アプリ情報を取得する
   * @return {Promise<AppInfo>} - アプリ情報
   */
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke("app:info"),
  /**
   * @description - 設定ファイルのあるディレクトリを開く
   * @return {void} - なし
   */
  openSettingsFolder: (): void => ipcRenderer.send("app:open-settings-folder"),
};

contextBridge.exposeInMainWorld("api", api);
