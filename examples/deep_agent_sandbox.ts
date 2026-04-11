/**
 * Use `Leap0Sandbox` as the Deep Agents backend (shell + files).
 *
 * Uses OpenAI chat models via `@langchain/openai` (`ChatOpenAI`).
 *
 * See LangChain Deep Agents sandboxes: https://docs.langchain.com/oss/deepagents/sandboxes
 *
 * Environment:
 *
 * - `LEAP0_API_KEY` — Leap0 API key (https://leap0.dev).
 * - `OPENAI_API_KEY` — OpenAI API key.
 * - `OPENAI_MODEL` — optional model id (default `gpt-4o`). You may pass a value like `openai:gpt-4o`;
 *   the `openai:` prefix is stripped when constructing `ChatOpenAI`.
 *
 * From the package root:
 *
 * ```bash
 * pnpm exec tsx examples/deep_agent_sandbox.ts
 * ```
 */

import process from "node:process";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createDeepAgent } from "deepagents";
import { Leap0Client } from "leap0";

import { Leap0Sandbox } from "../src/index.js";

const DEFAULT_OPENAI_MODEL = "gpt-4o";

function resolveOpenAiModelId(): string {
  const raw = process.env.OPENAI_MODEL?.trim();
  if (!raw) {
    return DEFAULT_OPENAI_MODEL;
  }
  return raw.startsWith("openai:") ? raw.slice("openai:".length) : raw;
}

async function main(): Promise<number> {
  if (!process.env.LEAP0_API_KEY) {
    console.error("Set LEAP0_API_KEY in your environment.");
    return 1;
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("Set OPENAI_API_KEY in your environment.");
    return 1;
  }

  const client = new Leap0Client();
  const sandbox = await client.sandboxes.create();
  const backend = Leap0Sandbox.fromConnected(client, sandbox);

  const model = new ChatOpenAI({
    model: resolveOpenAiModelId(),
  });

  try {
    const agent = createDeepAgent({
      model,
      systemPrompt: "You are a coding assistant with sandbox access.",
      backend,
    });

    const result = await agent.invoke({
      messages: [
        new HumanMessage(
          "Create a hello world Python script and run it",
        ),
      ],
    });

    console.log(result);
  } finally {
    try {
      await sandbox.delete();
    } finally {
      await client.close();
    }
  }

  return 0;
}

void main().then((code) => {
  process.exitCode = code;
});
