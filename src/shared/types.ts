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
