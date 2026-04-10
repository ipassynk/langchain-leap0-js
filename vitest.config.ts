import path from "node:path";
import { configDefaults, defineConfig, type ViteUserConfigExport } from "vitest/config";
import dotenv from "dotenv";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig, type ViteUserConfigExport } from "vitest/config";
import dotenv from "dotenv";

const dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(dirname, ".env") });

export default defineConfig((env) => {
  const common: ViteUserConfigExport = {
    test: {
      environment: "node",
      hideSkippedTests: true,
      globals: true,
      testTimeout: 60_000,
      hookTimeout: 60_000,
      teardownTimeout: 60_000,
      exclude: ["**/*.int.test.ts", ...configDefaults.exclude],
    },
  };

  if (env.mode === "int") {
    const intTimeout = 180_000;
    return {
      test: {
        ...common.test,
        globals: false,
        testTimeout: intTimeout,
        hookTimeout: intTimeout,
        teardownTimeout: intTimeout,
        exclude: configDefaults.exclude,
        include: ["**/*.int.test.ts"],
        name: "int",
        sequence: { concurrent: false },
      },
    } satisfies ViteUserConfigExport;
  }

  return {
    test: {
      ...common.test,
      include: ["src/**/*.test.ts"],
    },
  } satisfies ViteUserConfigExport;
});
