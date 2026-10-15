import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cloneDeep } from "lodash-es";
import { type Mock, vi } from "vitest";
import type { Api } from "@/preload";
import { type ClockSettings, DEFAULT_SETTINGS } from "@/shared/settings";
import type { NtpStatus } from "@/shared/types";

/**
 * @description - 静的HTMLファイルの<body>の中身を<script>タグを除いて読み込む
 * @param {string} file - static/配下のファイル名
 * @return {string} - <body>の中身
 */
export const loadBody = (file: string): string => {
  const html: string = readFileSync(join(__dirname, "../../static", file), "utf8");
  const doc: Document = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script").forEach((el: Element) => el.remove());
  return doc.body.innerHTML;
};

/**
 * @description - 既定の設定の複製を返す
 * @return {ClockSettings} - 既定の設定
 */
export const defaultSettings = (): ClockSettings => cloneDeep(DEFAULT_SETTINGS);

/**
 * @description - テスト用のNTPの状態を作る
 * @param {Partial<NtpStatus>} patch - 既定値から変更する項目
 * @return {NtpStatus} - NTPの状態
 */
export const ntpStatus = (patch: Partial<NtpStatus> = {}): NtpStatus => ({
  enabled: true,
  server: "ntp.example",
  offsetMs: 0,
  rttMs: null,
  lastSync: null,
  error: null,
  syncing: false,
  ...patch,
});

export interface MockApi {
  api: { [K in keyof Api]: Mock };
  cb: {
    settings?: (s: ClockSettings) => void;
    ntp?: (s: NtpStatus) => void;
    tab?: (t: string) => void;
  };
}

/**
 * @description - window.apiのモックを作る
 * @return {MockApi} - モックしたAPI
 */
export const mockApi = (): MockApi => {
  const cb: MockApi["cb"] = {};
  const api: MockApi["api"] = {
    getSettings: vi.fn(async () => defaultSettings()),
    updateSettings: vi.fn(),
    resetSettings: vi.fn(async () => defaultSettings()),
    onSettings: vi.fn((f: (s: ClockSettings) => void) => void (cb.settings = f)),
    onShowTab: vi.fn((f: (t: string) => void) => void (cb.tab = f)),
    reportSize: vi.fn(),
    moveToDefault: vi.fn(),
    reportAlertDialogSize: vi.fn(),
    getNtpStatus: vi.fn(async () => ntpStatus()),
    syncNtp: vi.fn(async () => ntpStatus()),
    onNtpStatus: vi.fn((f: (s: NtpStatus) => void) => void (cb.ntp = f)),
    testAlert: vi.fn(),
    listFonts: vi.fn(async () => ["Arial", "Meiryo"]),
    listDisplays: vi.fn(async () => [
      { index: 0, label: "Display 1" },
      { index: 1, label: "Display 2" },
    ]),
    getAutoStart: vi.fn(async () => ({ supported: true, enabled: false, path: "C:/DeskTick.exe" })),
    setAutoStart: vi.fn(async (enabled: boolean) => ({ supported: true, enabled, path: "C:/DeskTick.exe" })),
    getAppInfo: vi.fn(async () => ({
      productName: "DeskTick",
      version: "1.2.3",
      electron: "44.0.0",
      chrome: "140.0",
      node: "24.0.0",
      settingsPath: "C:/config.json",
      exePath: "C:/DeskTick.exe",
    })),
    openSettingsFolder: vi.fn(),
    openLicenses: vi.fn(),
  };
  return { api, cb };
};

/**
 * @description - モックのAPIをApi型として扱う
 * @param {MockApi} m - モックしたAPI
 * @return {Api} - Api型のAPI
 */
export const asApi = (m: MockApi): Api => m.api as unknown as Api;

/**
 * @description - モックのAPIをwindow.apiに設定する
 * @param {MockApi} m - モックしたAPI
 * @return {void} - なし
 */
export const installApi = (m: MockApi): void => {
  (window as unknown as { api: unknown }).api = m.api;
};

/**
 * @description - document.fonts.readyを差し替える
 * @param {Promise<unknown>} ready - フォント読み込み完了を表すPromise
 * @return {void} - なし
 */
export const installFonts = (ready: Promise<unknown> = Promise.resolve()): void => {
  Object.defineProperty(document, "fonts", { value: { ready }, configurable: true });
};

/**
 * @description - 保留中のPromiseチェーンを進める
 * @return {Promise<void>} - 完了
 */
export const flush = async (): Promise<void> => {
  for (let i: number = 0; i < 20; i++) await Promise.resolve();
};
