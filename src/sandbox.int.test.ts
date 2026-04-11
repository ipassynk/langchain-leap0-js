/**
 * Integration tests — require `LEAP0_API_KEY` (same as Python `langchain-leap0`).
 *
 * Run: `pnpm test:int`
 *
 * Optional: `LEAP0_TEST_TEMPLATE` for `sandboxes.create()`. If unset, uses the
 * same default as the `leap0` SDK (`DEFAULT_TEMPLATE_NAME`, e.g. debian image).
 */

import { DEFAULT_TEMPLATE_NAME } from "leap0";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  sandboxStandardTests,
  withRetry,
} from "@langchain/sandbox-standard-tests/vitest";

import { Leap0Sandbox } from "./index.js";

const TEST_TIMEOUT = 180_000;

const hasKey = Boolean(process.env.LEAP0_API_KEY);

function templateName(): string {
  return process.env.LEAP0_TEST_TEMPLATE?.trim() || DEFAULT_TEMPLATE_NAME;
}

function createParams() {
  return {
    templateName: templateName(),
    timeoutMin: 60,
  } as const;
}

sandboxStandardTests({
  name: "Leap0Sandbox",
  skip: !hasKey,
  timeout: TEST_TIMEOUT,
  createSandbox: async (options) =>
    withRetry(() =>
      Leap0Sandbox.create({
        leap0Config: {},
        createParams: createParams(),
        initialFiles: options?.initialFiles,
      }),
    ),
  createUninitializedSandbox: () =>
    new Leap0Sandbox({
      leap0Config: {},
      createParams: createParams(),
    }),
  closeSandbox: (sandbox) => sandbox.close(),
  resolvePath: (name) => `/tmp/${name}`,
});

describe("Leap0Sandbox integration extras", () => {
  let sandbox: Leap0Sandbox;

  beforeAll(async () => {
    if (!hasKey) {
      return;
    }
    sandbox = await withRetry(() =>
      Leap0Sandbox.create({
        leap0Config: {},
        createParams: createParams(),
      }),
    );
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (!sandbox) {
      return;
    }
    try {
      await sandbox.close();
    } catch {
      // ignore
    }
  }, TEST_TIMEOUT);

  it.skipIf(!hasKey)(
    "executes echo",
    async () => {
      const result = await sandbox.execute("echo leap0");
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("leap0");
    },
    TEST_TIMEOUT,
  );
});
