import { app } from "electron";
import * as fs from "fs";
import { debounce, type DebouncedFunc } from "lodash-es";
import * as path from "path";
import { resolveConfigDir } from "@/main/paths";
import { type MigrationResult, migrateConfig } from "@/shared/configVersion";
import {
  type ClockSettings,
  DEFAULT_SETTINGS,
  type DeepPartial,
  mergeSettings,
  normalizeSettings,
  settingsFromConfig,
} from "@/shared/settings";

export const CONFIG_NAME: string = "config.json";
export const BACKUP_SUFFIX: string = ".bak";

const SAVE_DEBOUNCE_MS: number = 300;
const WATCH_DEBOUNCE_MS: number = 200;
const BOM: number = 0xfeff;

export interface SettingsStore {
  readonly file: string;
  readonly value: ClockSettings;
  /** config.jsonがこのアプリより新しい版で書かれていて、上書きしないようにしているか */
  readonly readOnly: boolean;
  /**
   * @description - 設定の一部を更新し、遅延保存を予約する
   * @param {DeepPartial<ClockSettings>} patch - 変更内容
   * @return {void} - なし
   */
  update(patch: DeepPartial<ClockSettings>): void;
  /**
   * @description - 設定を既定値に戻し、遅延保存を予約する
   * @return {void} - なし
   */
  reset(): void;
  /**
   * @description - 保存待ちの変更があれば今すぐ書き込む
   * @return {void} - なし
   */
  flush(): void;
}

/**
 * @description - config.jsonのパスを返す
 * @return {string} - 設定ファイルのパス
 */
const configPath = (): string =>
  path.join(
    resolveConfigDir(process.env, app.isPackaged, process.execPath, () => app.getAppPath()),
    CONFIG_NAME,
  );

/**
 * @description - 先頭のBOMを取り除く
 * @param {string} text - ファイルの内容
 * @return {string} - BOMを除いた内容
 */
const stripBom = (text: string): string => (text.charCodeAt(0) === BOM ? text.slice(1) : text);

/**
 * @description - 設定をファイルに書く形式にする
 * @param {Readonly<ClockSettings>} value - 設定
 * @return {string} - ファイル内容
 */
const serialize = (value: Readonly<ClockSettings>): string => `${JSON.stringify(value, null, 2)}\n`;

/**
 * @description - ファイルを読む
 * @param {string} file - ファイルパス
 * @return {string | null} - 内容
 */
const readText = (file: string): string | null => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

interface ParsedConfig {
  readonly settings: ClockSettings;
  readonly migrated: boolean;
  readonly tooNew: boolean;
}

/**
 * @description - ファイル内容を、現在の版の形に変換してから設定として解釈する
 * @param {string} text - ファイル内容
 * @return {ParsedConfig | null} - 設定と変換の結果。JSONが不正ならnull
 */
const parseSettings = (text: string): ParsedConfig | null => {
  try {
    const m: MigrationResult = migrateConfig(JSON.parse(stripBom(text)));
    return { settings: settingsFromConfig(m.raw), migrated: m.migrated, tooNew: m.tooNew };
  } catch {
    return null;
  }
};

/**
 * @description - 版を変換する前のconfig.jsonを残す
 * @param {string} file - 設定ファイルのパス
 * @param {string} text - 変換前の内容
 * @return {void} - なし
 */
const backup = (file: string, text: string): void => {
  try {
    fs.writeFileSync(`${file}${BACKUP_SUFFIX}`, text);
  } catch (e) {
    console.error("Failed to back up config:", e);
  }
};

/**
 * @description - 設定ストアを作る
 * @param {(prev: ClockSettings) => void} onExternalChange - config.jsonが手で編集された後に呼ばれる
 * @return {SettingsStore} - 設定ストア
 */
export const createSettingsStore = (onExternalChange: (prev: ClockSettings) => void): SettingsStore => {
  const file: string = configPath();
  const fileName: string = path.basename(file).toLowerCase();
  const initialText: string | null = readText(file);
  const initial: ParsedConfig | null = initialText === null ? null : parseSettings(initialText);
  let value: ClockSettings = initial?.settings ?? structuredClone(DEFAULT_SETTINGS);
  let readOnly: boolean = initial?.tooNew ?? false;
  let lastWritten: string = "";

  /**
   * @description - 現在の設定をファイルに書き込む
   * @return {void} - なし
   */
  const write = (): void => {
    if (readOnly) return;
    const text: string = serialize(value);
    try {
      lastWritten = text;
      fs.writeFileSync(file, text);
    } catch (e) {
      console.error("Failed to save config:", e);
    }
  };

  let pending: boolean = false;

  /**
   * @description - 保存待ちを解消して書き込む
   * @return {void} - なし
   */
  const save = (): void => {
    pending = false;
    write();
  };

  const debouncedSave: DebouncedFunc<() => void> = debounce(save, SAVE_DEBOUNCE_MS);

  /**
   * @description - 遅延保存を予約する
   * @return {void} - なし
   */
  const scheduleSave = (): void => {
    pending = true;
    debouncedSave();
  };

  /**
   * @description - 手で編集されたconfig.jsonを読み直す
   * @return {void} - なし
   */
  const reloadFromDisk = (): void => {
    const text: string | null = readText(file);
    if (text === null || text === lastWritten) return;
    const next: ParsedConfig | null = parseSettings(text);
    if (!next) return;
    const prev: ClockSettings = value;
    value = next.settings;
    readOnly = next.tooNew;
    onExternalChange(prev);
  };

  /**
   * @description - 設定ディレクトリを監視する
   * @return {void} - なし
   */
  const watch = (): void => {
    const scheduleReload: DebouncedFunc<() => void> = debounce(reloadFromDisk, WATCH_DEBOUNCE_MS);
    try {
      fs.watch(path.dirname(file), (_ev: fs.WatchEventType, changed: string | Buffer | null) => {
        if (changed?.toString().toLowerCase() === fileName) scheduleReload();
      });
    } catch (e) {
      console.error("Failed to watch config:", e);
    }
  };

  if (!fs.existsSync(file)) write();
  else if (initial?.migrated) {
    backup(file, initialText!);
    write();
  }
  watch();

  return {
    file,
    /**
     * @description - 現在の設定を返す
     * @return {ClockSettings} - 設定
     */
    get value(): ClockSettings {
      return value;
    },
    /**
     * @description - 上書きしないようにしているかを返す
     * @return {boolean} - 新しい版のconfig.jsonならtrue
     */
    get readOnly(): boolean {
      return readOnly;
    },
    /**
     * @description - 設定の一部を更新し、遅延保存を予約する
     * @param {DeepPartial<ClockSettings>} patch - 変更内容
     * @return {void} - なし
     */
    update: (patch: DeepPartial<ClockSettings>): void => {
      value = normalizeSettings(mergeSettings(value, patch));
      scheduleSave();
    },
    /**
     * @description - 設定を既定値に戻し、遅延保存を予約する
     * @return {void} - なし
     */
    reset: (): void => {
      value = structuredClone(DEFAULT_SETTINGS);
      scheduleSave();
    },
    /**
     * @description - 保存待ちの変更があれば今すぐ書き込む
     * @return {void} - なし
     */
    flush: (): void => {
      if (!pending) return;
      debouncedSave.cancel();
      save();
    },
  };
};
