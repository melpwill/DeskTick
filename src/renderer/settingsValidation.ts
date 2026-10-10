import { isValidLocale, isValidTimeZone } from "@/shared/format";

export type FieldValue = string | number | boolean;

type Validator = (value: FieldValue) => string | null;

const VALIDATORS: Readonly<Record<string, Validator>> = {
  locale: (v: FieldValue): string | null => (isValidLocale(String(v)) ? null : "無効なロケールです (例: ja-JP, en-US)"),
  timeZone: (v: FieldValue): string | null =>
    isValidTimeZone(String(v)) ? null : "無効なタイムゾーンです (例: Asia/Tokyo)",
  "ntp.server": (v: FieldValue): string | null => (String(v).trim() ? null : "サーバ名を入力してください"),
};

/**
 * @description - 設定キーに対応する検証を行う
 * @param {string} key - 設定キー
 * @param {FieldValue} value - 入力値
 * @return {string | null} - エラーメッセージ
 */
export const validateSetting = (key: string, value: FieldValue): string | null => VALIDATORS[key]?.(value) ?? null;
