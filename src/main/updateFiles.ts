import * as fs from "fs";
import * as path from "path";
import { sha256Hex } from "@/main/updateManifest";

export const NEW_SUFFIX: string = ".new";
export const OLD_SUFFIX: string = ".old";
const PROBE_SUFFIX: string = ".write-test";

/**
 * @description - exeと同じディレクトリにファイルを作れるかを確かめる
 * @param {string} exe - exeのパス
 * @return {Promise<boolean>} - 作れればtrue
 */
export const canWriteBeside = async (exe: string): Promise<boolean> => {
  const probe: string = `${exe}${PROBE_SUFFIX}`;
  try {
    await fs.promises.writeFile(probe, "", { flag: "w" });
    await fs.promises.rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
};

/**
 * @description - 新しいexeを"<exe>.new"として書き込み、読み直して内容を確かめる
 * @param {string} exe - 現在のexeのパス
 * @param {Uint8Array} data - 新しいexeの内容
 * @param {string} sha256 - 期待するSHA-256
 * @return {Promise<string>} - 書き込んだファイルのパス
 */
export const stageExe = async (exe: string, data: Uint8Array, sha256: string): Promise<string> => {
  const staged: string = `${exe}${NEW_SUFFIX}`;
  await fs.promises.rm(staged, { force: true });
  await fs.promises.writeFile(staged, data, { flag: "wx" });
  if (sha256Hex(await fs.promises.readFile(staged)) !== sha256) {
    await fs.promises.rm(staged, { force: true });
    throw new Error("書き込んだファイルの内容が一致しません");
  }
  return staged;
};

/**
 * 終了後に"<exe>.old"へ退避し、"<exe>.new"を元の名前にする（失敗したら元に戻す）。
 * portable形式のexeは、アプリが終わるまで展開用のスタブが開いたままなので、名前を変えられるまで待つ。
 */
const SWAP_SCRIPT: string = String.raw`
$exe = $env:DESKTICK_UPDATE_EXE
$relaunch = $env:DESKTICK_UPDATE_RELAUNCH -eq '1'
Remove-Item Env:DESKTICK_UPDATE_EXE, Env:DESKTICK_UPDATE_RELAUNCH -ErrorAction SilentlyContinue
$new = "$exe${NEW_SUFFIX}"
$old = "$exe${OLD_SUFFIX}"
$deadline = (Get-Date).AddSeconds($env:DESKTICK_UPDATE_TIMEOUT_SEC)
Remove-Item Env:DESKTICK_UPDATE_TIMEOUT_SEC -ErrorAction SilentlyContinue
function Restore { if (-not [IO.File]::Exists($exe) -and [IO.File]::Exists($old)) { [IO.File]::Move($old, $exe) } }
while ((Get-Date) -lt $deadline) {
  try {
    Restore
    if (-not [IO.File]::Exists($new)) { break }
    if ([IO.File]::Exists($old)) { [IO.File]::Delete($old) }
    [IO.File]::Move($exe, $old)
    try { [IO.File]::Move($new, $exe) } catch { [IO.File]::Move($old, $exe); throw }
    break
  } catch { Start-Sleep -Milliseconds 500 }
}
try { Restore } catch {}
if ($relaunch -and [IO.File]::Exists($exe)) { Start-Process -FilePath $exe -WorkingDirectory ([IO.Path]::GetDirectoryName($exe)) }
`;

/** アプリの終了に時間がかかっても待つ長さ */
export const SWAP_TIMEOUT_SEC: number = 120;

export interface HelperCommand {
  readonly file: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

/**
 * @description - アプリの終了後にexeを差し替えるPowerShellのコマンドを作る
 * @param {string} exe - 現在のexeのパス
 * @param {boolean} relaunch - 差し替えた後にexeを起動するか
 * @param {string | undefined} systemRoot - Windowsのディレクトリ（%SystemRoot%。なければPATHから探す）
 * @return {HelperCommand} - 起動するコマンド（パスは環境変数で渡す）
 */
export const swapCommand = (exe: string, relaunch: boolean, systemRoot: string | undefined): HelperCommand => ({
  file: systemRoot
    ? path.win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "powershell.exe",
  args: [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-WindowStyle",
    "Hidden",
    "-EncodedCommand",
    Buffer.from(SWAP_SCRIPT, "utf16le").toString("base64"),
  ],
  env: {
    DESKTICK_UPDATE_EXE: exe,
    DESKTICK_UPDATE_RELAUNCH: relaunch ? "1" : "0",
    DESKTICK_UPDATE_TIMEOUT_SEC: String(SWAP_TIMEOUT_SEC),
  },
});

/**
 * @description - 前回の更新で残った"<exe>.new"と"<exe>.old"を消す（消せなければ次回に回す）
 * @param {string} exe - 現在のexeのパス
 * @return {Promise<void>} - 完了
 */
export const cleanupUpdateFiles = async (exe: string): Promise<void> => {
  await Promise.all(
    [NEW_SUFFIX, OLD_SUFFIX, PROBE_SUFFIX].map((s: string) =>
      fs.promises.rm(`${exe}${s}`, { force: true }).catch(() => undefined),
    ),
  );
};
