import { isEqual } from "lodash-es";
import { type ClockSettings } from "@/shared/settings";

export interface SettingsChanges {
  readonly alwaysOnTop: boolean;
  readonly position: boolean;
}

/**
 * @description - 新旧の設定を比べ、ウィンドウに反映すべき変更を求める
 * @param {Readonly<ClockSettings>} prev - 変更前の設定
 * @param {Readonly<ClockSettings>} next - 変更後の設定
 * @return {SettingsChanges} - 変更の有無
 */
export const diffSettings = (prev: Readonly<ClockSettings>, next: Readonly<ClockSettings>): SettingsChanges => ({
  alwaysOnTop: prev.alwaysOnTop !== next.alwaysOnTop,
  position: !isEqual(prev.position, next.position),
});
