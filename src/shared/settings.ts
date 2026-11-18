import { clamp } from "lodash-es";
import { type AlertsSettings, DEFAULT_ALERTS, normalizeAlerts } from "@/shared/alerts";
import { CONFIG_VERSION } from "@/shared/configVersion";
import { type DeepPartial, mergeSettings } from "@/shared/merge";

export type { DeepPartial };
export { mergeSettings };

export type Corner = "top-right" | "top-left" | "bottom-right" | "bottom-left";

export type UpdateMode = "auto" | "notify" | "off";

export const UPDATE_MODES: readonly UpdateMode[] = ["auto", "notify", "off"];

export interface UpdateSettings {
  /** auto: 自動で更新 / notify: 確認だけして知らせる / off: 自動では確認しない */
  mode: UpdateMode;
  /** 新しいバージョンや更新の完了をトーストで知らせるか */
  notify: boolean;
  /** 知らせないことにしたバージョン */
  skipVersion: string;
}

export interface ColorSetting {
  color: string;
  alpha: number;
}

export interface ClockSettings {
  configVersion: number;
  font: { family: string; weight: number; line1Size: number; line2Size: number };
  foreground: ColorSetting;
  background: ColorSetting;
  shadow: boolean;
  padding: number;
  cornerRadius: number;
  locale: string;
  timeZone: string;
  format: { line1: string; line2: string };
  position: { display: number; corner: Corner; marginX: number; marginY: number };
  alwaysOnTop: boolean;
  ntp: { enabled: boolean; server: string; intervalMin: number };
  alerts: AlertsSettings;
  update: UpdateSettings;
}

export const DEFAULT_SETTINGS: ClockSettings = {
  configVersion: CONFIG_VERSION,
  font: { family: "UDEV Gothic", weight: 600, line1Size: 16, line2Size: 28 },
  foreground: { color: "#ffffff", alpha: 1 },
  background: { color: "#000000", alpha: 0.2 },
  shadow: true,
  padding: 0,
  cornerRadius: 8,
  locale: "en-US",
  timeZone: "",
  format: { line1: "YYYY-MM-DD (week)", line2: "HH:mm:ss" },
  position: { display: -1, corner: "top-right", marginX: 12, marginY: 12 },
  alwaysOnTop: true,
  ntp: { enabled: true, server: "ntp.nict.jp", intervalMin: 60 },
  alerts: DEFAULT_ALERTS,
  update: { mode: "notify", notify: true, skipVersion: "" },
};

/**
 * @description - 設定ファイルの生JSONから設定を組み立てる
 * @param {unknown} raw - 設定ファイルの内容
 * @return {ClockSettings} - 設定
 */
export const settingsFromConfig = (raw: unknown): ClockSettings =>
  normalizeSettings(mergeSettings(DEFAULT_SETTINGS, raw));

/**
 * @description - 設定を正規化する
 * @param {ClockSettings} s - 設定
 * @return {ClockSettings} - 正規化した新しい設定
 */
export const normalizeSettings = (s: ClockSettings): ClockSettings => ({
  ...s,
  configVersion: CONFIG_VERSION,
  alerts: normalizeAlerts(s.alerts),
  update: { ...s.update, mode: UPDATE_MODES.includes(s.update.mode) ? s.update.mode : DEFAULT_SETTINGS.update.mode },
});

const FALLBACK_RGB: readonly number[] = [255, 255, 255];

/**
 * @description - #rrggbbをRGBの配列に変換する
 * @param {string} color - 色文字列
 * @return {readonly number[]} - [r, g, b]
 */
const hexToRgb = (color: string): readonly number[] => {
  const m: RegExpExecArray | null = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  return m ? m.slice(1).map((h: string): number => parseInt(h, 16)) : FALLBACK_RGB;
};

/**
 * @description - 色設定をrgba()文字列に変換する
 * @param {ColorSetting} c - 色設定
 * @return {string} - "rgba(r, g, b, a)"
 */
export const toRgba = (c: ColorSetting): string => `rgba(${hexToRgb(c.color).join(", ")}, ${clamp(c.alpha, 0, 1)})`;

/**
 * @description - フォント名からCSSのfont-family値を作る
 * @param {string} family - フォント名
 * @return {string} - font-familyの値
 */
export const fontStack = (family: string): string => {
  const f: string = family.replace(/["\\]/g, "").trim();
  return f ? `"${f}", sans-serif` : "sans-serif";
};
