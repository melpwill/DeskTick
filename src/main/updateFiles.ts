import * as fs from "fs";
import * as path from "path";
import { sha256Hex } from "@/main/updateManifest";

export const NEW_SUFFIX: string = ".new";
export const OLD_SUFFIX: string = ".old";
const PROBE_SUFFIX: string = ".write-test";
const SWAP_COMMAND_ENV: string = "DESKTICK_SWAP_COMMAND";

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

export const SWAP_TIMEOUT_SEC: number = 120;

/**
 * @description - PowerShellの単一引用符の文字列にする（PowerShellは‘’‚‛も単一引用符として扱う）
 * @param {string} s - 値
 * @return {string} - 引用符で囲んだ文字列
 */
export const psQuote = (s: string): string => `'${s.replace(/['\u2018-\u201B]/g, "$&$&")}'`;

/**
 * @description - 終了後に"<exe>.old"へ退避し、"<exe>.new"を元の名前にするPowerShellのスクリプトを作る（失敗したら元に戻す）。
 * portable形式のexeは、アプリが終わるまで展開用のスタブが開いたままなので、名前を変えられるまで待つ
 * @param {string} exe - 現在のexeのパス
 * @param {boolean} relaunch - 差し替えた後にexeを起動するか
 * @return {string} - スクリプト
 */
export const swapScript = (exe: string, relaunch: boolean): string => `
$exe = ${psQuote(exe)}
$new = ${psQuote(`${exe}${NEW_SUFFIX}`)}
$old = ${psQuote(`${exe}${OLD_SUFFIX}`)}
$deadline = (Get-Date).AddSeconds(${SWAP_TIMEOUT_SEC})
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
if (${relaunch ? "$true" : "$false"} -and [IO.File]::Exists($exe)) { Start-Process -FilePath $exe -WorkingDirectory ([IO.Path]::GetDirectoryName($exe)) }
`;

/**
 * 環境変数のコマンドを、WMIでアプリのジョブの外に起動する（窓は出さない）。
 * アプリはジョブの中で動いていて、普通に起動した子プロセスはアプリの終了と一緒に終了させられるため
 */
const LAUNCH_SCRIPT: string = `
$ErrorActionPreference = 'Stop'
$si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $env:${SWAP_COMMAND_ENV}; ProcessStartupInformation = $si }
exit [int]$r.ReturnValue
`;

export interface HelperCommand {
  readonly file: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

/**
 * @description - PowerShellでスクリプトを実行するコマンドを作る
 * @param {string | undefined} systemRoot - Windowsのディレクトリ（%SystemRoot%。なければPATHから探す）
 * @param {string} script - スクリプト
 * @return {{ file: string; args: string[] }} - 実行ファイルと引数
 */
export const powershellCommand = (
  systemRoot: string | undefined,
  script: string,
): { file: string; args: string[] } => ({
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
    Buffer.from(script, "utf16le").toString("base64"),
  ],
});

/**
 * @description - アプリの終了後にexeを差し替えるPowerShellを、アプリのジョブの外に起動するコマンドを作る
 * @param {string} exe - 現在のexeのパス
 * @param {boolean} relaunch - 差し替えた後にexeを起動するか
 * @param {string | undefined} systemRoot - Windowsのディレクトリ（%SystemRoot%。なければPATHから探す）
 * @return {HelperCommand} - 起動するコマンド
 */
export const swapCommand = (exe: string, relaunch: boolean, systemRoot: string | undefined): HelperCommand => {
  const swap: { file: string; args: string[] } = powershellCommand(systemRoot, swapScript(exe, relaunch));
  return {
    ...powershellCommand(systemRoot, LAUNCH_SCRIPT),
    env: { [SWAP_COMMAND_ENV]: [`"${swap.file}"`, ...swap.args].join(" ") },
  };
};

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
