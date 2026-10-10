import { build, type BuildOptions } from "esbuild";
import { rmSync } from "node:fs";

const common: Readonly<BuildOptions> = { bundle: true, logLevel: "warning" };

const mainProcess: Readonly<BuildOptions> = {
  ...common,
  entryPoints: ["src/main.ts", "src/preload.ts"],
  outdir: "dist",
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
};

const renderer: Readonly<BuildOptions> = {
  ...common,
  entryPoints: ["src/renderer/clock.ts", "src/renderer/settings.ts"],
  outdir: "dist/renderer",
  platform: "browser",
  format: "iife",
  target: "chrome130",
};

rmSync("dist", { recursive: true, force: true });
await Promise.all([build(mainProcess), build(renderer)]);
