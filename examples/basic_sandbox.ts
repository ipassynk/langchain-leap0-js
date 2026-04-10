/**
 * Create a Leap0 sandbox backend and run a shell command.
 *
 * See LangChain Deep Agents sandboxes: https://docs.langchain.com/oss/deepagents/sandboxes
 *
 * Requires `LEAP0_API_KEY` (see https://leap0.dev).
 *
 * From the package root:
 *
 * ```bash
 * pnpm exec tsx examples/basic_sandbox.ts
 * ```
 */

import process from "node:process";
import { Leap0Client } from "leap0";

import { Leap0Sandbox } from "../src/index.js";

async function main(): Promise<number> {
  if (!process.env.LEAP0_API_KEY) {
    console.error("Set LEAP0_API_KEY in your environment.");
    return 1;
  }

  const client = new Leap0Client();
  const sandbox = await client.sandboxes.create();
  const backend = Leap0Sandbox.fromConnected(client, sandbox);

  try {
    const result = await backend.execute("echo 'Hello LangChain from Leap0.dev'");
    console.log(result.output.trim());
    console.log("exit_code:", result.exitCode);
  } finally {
    try {
      await sandbox.delete();
    } finally {
      await client.close();
    }
  }

  return 0;
}

void main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
