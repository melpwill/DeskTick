export interface NtpStatus {
  enabled: boolean;
  server: string;
  offsetMs: number;
  rttMs: number | null;
  lastSync: number | null;
  error: string | null;
  syncing: boolean;
}

export interface DisplayInfo {
  index: number;
  label: string;
}

export interface AppInfo {
  productName: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  settingsPath: string;
  exePath: string;
}

export interface AutoStartInfo {
  supported: boolean;
  enabled: boolean;
  path: string;
}

export type UpdateState = "idle" | "checking" | "latest" | "available" | "downloading" | "ready" | "error";

export interface UpdateStatus {
  state: UpdateState;
  currentVersion: string;
  /** 見つかった新しいバージョン */
  latestVersion: string | null;
  /** リリースページのURL */
  releaseUrl: string;
  /** ダウンロードの進み具合（0〜1） */
  progress: number | null;
  error: string | null;
  lastChecked: number | null;
  /** この環境でexeを差し替えられない理由（差し替えられるならnull） */
  installBlocked: string | null;
}

export interface ReleaseNotesResult {
  /** リリースのAtomフィード（XML）。取得できなければ空文字 */
  feed: string;
  error: string | null;
}
