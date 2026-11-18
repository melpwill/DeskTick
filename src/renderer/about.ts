import type { Api } from "@/preload";
import { byId } from "@/renderer/dom";
import { bindReleaseNotes, notesBetween, type ReleaseNote } from "@/renderer/releaseNotes";
import { type AppInfo } from "@/shared/types";

const ABOUT_FIELDS: Readonly<Record<string, keyof AppInfo>> = {
  aboutName: "productName",
  aboutVersion: "version",
  aboutElectron: "electron",
  aboutChrome: "chrome",
  aboutNode: "node",
  aboutExe: "exePath",
  aboutSettings: "settingsPath",
};

/**
 * @description - アプリ情報を取得して「情報」タブに表示し、今のバージョンまでのリリースノートを見られるようにする
 * @param {Api} api - 通信API
 * @return {Promise<void>} - 表示の完了
 */
export const loadAbout = async (api: Api): Promise<void> => {
  const info: AppInfo = await api.getAppInfo();
  Object.entries(ABOUT_FIELDS).forEach(([id, key]) => (byId(id).textContent = info[key]));
  bindReleaseNotes(
    byId<HTMLDetailsElement>("aboutNotes"),
    byId("aboutNotesBody"),
    api,
    (notes: readonly ReleaseNote[]) => notesBetween(notes, null, info.version),
  );
};
