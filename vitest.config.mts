import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@test": fileURLToPath(new URL("./test", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    restoreMocks: true,
    reporters: process.env.CI ? ["default", ["junit", { outputFile: "coverage/junit.xml" }]] : ["default"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/main.ts", "src/preload.ts", "src/shared/types.ts"],
      reporter: ["text", "html", "cobertura"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
