# `@leap0/langchain-leap0`

**Leap0** integration for [LangChain Deep Agents sandboxes](https://docs.langchain.com/oss/deepagents/sandboxes): a `BaseSandbox` backend that runs shell commands and file transfers inside a Leap0 sandbox.

**[Leap0](https://leap0.dev)** is enterprise-grade cloud sandboxes for AI agents. Launch isolated sandboxes in ~200ms. Give every agent its own compute, filesystem, and network boundary while your agents run safely.

## Quick install

```bash
pnpm add @leap0/langchain-leap0 deepagents leap0
```

This package declares **peer dependencies** on `deepagents` and [`leap0`](https://www.npmjs.com/package/leap0); install them alongside the integration package (as shown above). With npm:

```bash
npm install @leap0/langchain-leap0 deepagents leap0
```

Set your API key (see [Leap0](https://leap0.dev) for account and key management):

```bash
export LEAP0_API_KEY="your-key"
```

### Connected handle (same pattern as Python)

Minimal usage with the `leap0` SDK and `Leap0Sandbox`:

```typescript
import { Leap0Client } from "leap0";
import { Leap0Sandbox } from "@leap0/langchain-leap0";

const client = new Leap0Client();
const sandbox = await client.sandboxes.create();
const backend = Leap0Sandbox.fromConnected(client, sandbox);

try {
  const result = await backend.execute("echo 'Hello LangChain from Leap0.dev'");
  console.log(result.output);
} finally {
  await sandbox.delete();
  await client.close();
}
```

### One-step create

If you want this package to create the `Leap0Client`, provision a sandbox, and own teardown:

```typescript
import { Leap0Sandbox } from "@leap0/langchain-leap0";

const backend = await Leap0Sandbox.create({
  leap0Config: {},
  createParams: { templateName: "base" },
});

try {
  const result = await backend.execute("echo hello");
  console.log(result.output);
} finally {
  await backend.close(); // deletes sandbox and closes the client
}
```

## Examples

Runnable scripts for [Deep Agents sandboxes](https://docs.langchain.com/oss/deepagents/sandboxes). Environment variables and run commands are documented in each file’s module comment. LangChain sandbox integration tests: `pnpm test:int`.

| Script | Summary |
| ------ | ------- |
| [`examples/basic_sandbox.ts`](examples/basic_sandbox.ts) | Minimal: create a sandbox, `Leap0Sandbox.execute()`, teardown. Requires `LEAP0_API_KEY`. |
| [`examples/deep_agent_sandbox.ts`](examples/deep_agent_sandbox.ts) | `createDeepAgent({ ..., backend: Leap0Sandbox.fromConnected(...) })` — agent task to create and run a Python script; prints the agent invocation result. Requires `LEAP0_API_KEY`, `OPENAI_API_KEY`; optional `OPENAI_MODEL` (default `gpt-4o`, or `openai:gpt-4o` style). |

From the package root, install dev dependencies (including [`tsx`](https://github.com/privatenumber/tsx), which runs the TypeScript examples), then run an example:

```bash
pnpm install
pnpm example:basic
pnpm example:deep-agent
```

Equivalent:

```bash
pnpm exec tsx examples/basic_sandbox.ts
pnpm exec tsx examples/deep_agent_sandbox.ts
```

If you see `Command "tsx" not found`, your install is out of date with `package.json` / `pnpm-lock.yaml` — run `pnpm install` again from this directory.

## Developing from source

From this directory:

```bash
pnpm install
pnpm build
```

## Running tests

From the package root:

```bash
# Unit tests
pnpm test

# LangChain standard sandbox integration tests (Vitest, `--mode int`)
pnpm test:int
```

Integration tests require:

```bash
export LEAP0_API_KEY="your-key"
```

Optional: set `LEAP0_TEST_TEMPLATE` to a template that exists in your Leap0 project. If unset, integration tests use the `leap0` SDK default (`system/debian:bookworm`).

## Documentation

Full documentation is available at [leap0.dev/docs](https://leap0.dev/docs).

## License

Apache License 2.0. See [LICENSE](LICENSE) for details.
