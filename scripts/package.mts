import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClockSettings } from "@/shared/settings";

const OUT_DIR: string = "release/DeskTick";
const BUILT_EXE: string = "release/DeskTick.exe";

/**
 * @description - TypeScript のソースから初期設定を読み込む
 * @return {Promise<ClockSettings>} - 初期設定
 */
const loadDefaultSettings = async (): Promise<ClockSettings> => {
  const tmp: string = join(tmpdir(), `desktick-defaults-${process.pid}.cjs`);
  await build({
    entryPoints: ["src/shared/settings.ts"],
    outfile: tmp,
    bundle: true,
    platform: "node",
    format: "cjs",
    logLevel: "warning",
  });
  try {
    const mod: { DEFAULT_SETTINGS: ClockSettings } = createRequire(import.meta.url)(tmp);
    return mod.DEFAULT_SETTINGS;
  } finally {
    rmSync(tmp, { force: true });
  }
};

/**
 * @description - 配布用ディレクトリを作り直し、exeとconfig.jsonを配置する
 * @param {ClockSettings} defaults - config.jsonに書き出す初期設定
 * @return {void} - なし
 */
const assemble = (defaults: ClockSettings): void => {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  copyFileSync(BUILT_EXE, join(OUT_DIR, "DeskTick.exe"));
  writeFileSync(join(OUT_DIR, "config.json"), `${JSON.stringify(defaults, null, 2)}\n`);
};

assemble(await loadDefaultSettings());
console.log(`Packaged: ${OUT_DIR}`);
