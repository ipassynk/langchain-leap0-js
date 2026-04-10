/**
 * Leap0 sandbox backend for deepagents
 */

import {
  BaseSandbox,
  type BackendFactory,
  type ExecuteResponse,
  type FileDownloadResponse,
  type FileOperationError,
  type FileUploadResponse,
} from "deepagents";
import {
  Leap0Client,
  Leap0Error,
  Leap0TimeoutError,
  type Sandbox,
} from "leap0";

import {
  Leap0SandboxError,
  type Leap0SandboxErrorCode,
  type Leap0SandboxOptions,
} from "./types.js";

function bodySnippet(body: unknown): string {
  if (body === undefined || body === null) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

/**
 * Leap0-backed {@link BaseSandbox} for Deep Agents.
 *
 * - **Connected** (like Python): `Leap0Sandbox.fromConnected(client, sandbox)` or
 *   `new Leap0Sandbox({ client, sandbox })`.
 * - **Lazy**: `new Leap0Sandbox({ leap0Config, createParams })` then `await initialize()`.
 * - **One step**: `await Leap0Sandbox.create({ ... })`.
 */
export class Leap0Sandbox extends BaseSandbox {
  #client: Leap0Client | null = null;
  #sandbox: Sandbox | null = null;
  #ownsClient = false;
  #commandTimeoutMs: number;
  #pending: Omit<Leap0SandboxOptions, "client" | "sandbox">;
  #tempId: string;

  get id(): string {
    return this.#sandbox?.id ?? this.#tempId;
  }

  /**
   * Underlying Leap0 sandbox handle (throws if not initialized).
   */
  get instance(): Sandbox {
    if (!this.#sandbox) {
      throw new Leap0SandboxError(
        "Sandbox not initialized. Call initialize() or use Leap0Sandbox.create()",
        "NOT_INITIALIZED",
      );
    }
    return this.#sandbox;
  }

  get isRunning(): boolean {
    return this.#sandbox !== null;
  }

  constructor(options: Leap0SandboxOptions = {}) {
    super();
    const { client, sandbox, ownClient, ...pending } = options;
    this.#pending = pending;
    this.#commandTimeoutMs =
      (options.commandTimeoutSeconds ?? 30 * 60) * 1000;
    this.#tempId = `leap0-sandbox-${Date.now()}`;

    if (client !== undefined && sandbox !== undefined) {
      this.#client = client;
      this.#sandbox = sandbox;
      this.#ownsClient = ownClient ?? false;
    } else if (client !== undefined || sandbox !== undefined) {
      throw new Leap0SandboxError(
        "Leap0Sandbox requires both `client` and `sandbox` when either is provided",
        "SANDBOX_CREATION_FAILED",
      );
    }
  }

  /**
   * Attach to an existing connected sandbox (Python `Leap0Sandbox(client=..., sandbox=...)`).
   */
  static fromConnected(
    client: Leap0Client,
    sandbox: Sandbox,
    options?: Pick<Leap0SandboxOptions, "commandTimeoutSeconds">,
  ): Leap0Sandbox {
    return new Leap0Sandbox({
      client,
      sandbox,
      commandTimeoutSeconds: options?.commandTimeoutSeconds,
    });
  }

  /**
   * Create and provision a sandbox, optionally uploading `initialFiles`.
   */
  static async create(options?: Leap0SandboxOptions): Promise<Leap0Sandbox> {
    const instance = new Leap0Sandbox(options);
    await instance.initialize({
      createParams: options?.createParams,
      initialFiles: options?.initialFiles,
    });
    return instance;
  }

  /**
   * Fetch a sandbox by id and wrap it (this instance owns the new `Leap0Client`).
   */
  static async fromId(
    sandboxId: string,
    options?: Pick<
      Leap0SandboxOptions,
      "leap0Config" | "commandTimeoutSeconds"
    >,
  ): Promise<Leap0Sandbox> {
    const client = new Leap0Client(options?.leap0Config ?? {});
    try {
      const sandbox = await client.sandboxes.get(sandboxId);
      return new Leap0Sandbox({
        client,
        sandbox,
        commandTimeoutSeconds: options?.commandTimeoutSeconds,
        ownClient: true,
      });
    } catch (error) {
      try {
        await client.close();
      } catch {
        // ignore
      }
      if (error instanceof Leap0Error && error.statusCode === 404) {
        throw new Leap0SandboxError(
          `Sandbox not found: ${sandboxId}`,
          "SANDBOX_NOT_FOUND",
          error,
        );
      }
      throw new Leap0SandboxError(
        `Failed to connect to sandbox: ${error instanceof Error ? error.message : String(error)}`,
        "SANDBOX_CREATION_FAILED",
        error instanceof Error ? error : undefined,
      );
    }
    }
  }

  async initialize(overrides?: {
    createParams?: Leap0SandboxOptions["createParams"];
    initialFiles?: Record<string, string>;
  }): Promise<void> {
    if (this.#sandbox) {
      throw new Leap0SandboxError(
        "Sandbox is already initialized",
        "ALREADY_INITIALIZED",
      );
    }

    try {
      if (!this.#client) {
        this.#client = new Leap0Client(this.#pending.leap0Config ?? {});
        this.#ownsClient = true;
      }

      const createParams = {
        ...this.#pending.createParams,
        ...overrides?.createParams,
      };

      this.#sandbox = await this.#client.sandboxes.create(createParams);

      const files = {
        ...this.#pending.initialFiles,
        ...overrides?.initialFiles,
      };
      if (Object.keys(files).length > 0) {
        await this.#uploadInitialFiles(files);
      }
    } catch (error) {
      const box = this.#sandbox;
      this.#sandbox = null;
      if (box) {
        try {
          await box.delete();
        } catch {
          // ignore
        }
      }
      if (this.#ownsClient && this.#client) {
        try {
          await this.#client.close();
        } catch {
          // ignore
        }
        this.#client = null;
        this.#ownsClient = false;
      }
      if (error instanceof Leap0SandboxError) {
        throw error;
      }
      throw new Leap0SandboxError(
        `Failed to create Leap0 sandbox: ${error instanceof Error ? error.message : String(error)}`,
        "SANDBOX_CREATION_FAILED",
        error instanceof Error ? error : undefined,
      );
    }
  }

  async #uploadInitialFiles(files: Record<string, string>): Promise<void> {
    const encoder = new TextEncoder();
    const entries: Array<[string, Uint8Array]> = Object.entries(files).map(
      ([path, content]) => [path, encoder.encode(content)],
    );
    const results = await this.uploadFiles(entries);
    const errors = results.filter((r) => r.error !== null);
    if (errors.length > 0) {
      const detail = errors.map((e) => `${e.path}: ${e.error}`).join(", ");
      throw new Leap0SandboxError(
        `Failed to upload initial files: ${detail}`,
        "FILE_OPERATION_FAILED",
      );
    }
  }

  async execute(command: string): Promise<ExecuteResponse> {
    const box = this.instance;
    try {
      const result = await box.process.execute({
        command,
        timeout: this.#commandTimeoutMs,
      });
      let output = result.stdout;
      if (result.stderr) {
        output = output ? `${output}\n${result.stderr}` : result.stderr;
      }
      return {
        output,
        exitCode: result.exitCode,
        truncated: false,
      };
    } catch (error) {
      if (error instanceof Leap0TimeoutError) {
        throw new Leap0SandboxError(
          "Command timed out",
          "COMMAND_TIMEOUT",
          error,
        );
      }
      throw new Leap0SandboxError(
        `Command execution failed: ${error instanceof Error ? error.message : String(error)}`,
        "COMMAND_FAILED",
        error instanceof Error ? error : undefined,
      );
    }
  }

  async uploadFiles(
    files: Array<[string, Uint8Array]>,
  ): Promise<FileUploadResponse[]> {
    const box = this.instance;
    const results: FileUploadResponse[] = [];

    for (const [path, content] of files) {
      if (!path.startsWith("/")) {
        results.push({ path, error: "invalid_path" });
        continue;
      }
      try {
        const parent = path.slice(0, path.lastIndexOf("/"));
        if (parent) {
          await box.filesystem.mkdir(parent, { recursive: true });
        }
        await box.filesystem.writeBytes(path, content);
        results.push({ path, error: null });
      } catch (error) {
        results.push({
          path,
          error: Leap0Sandbox.mapFilesystemError(error),
        });
      }
    }

    return results;
  }

  async downloadFiles(paths: string[]): Promise<FileDownloadResponse[]> {
    const box = this.instance;
    const results: FileDownloadResponse[] = [];

    for (const path of paths) {
      if (!path.startsWith("/")) {
        results.push({
          path,
          content: null,
          error: "invalid_path",
        });
        continue;
      }
      try {
        const content = await box.filesystem.readBytes(path);
        results.push({ path, content, error: null });
      } catch (error) {
        results.push({
          path,
          content: null,
          error: Leap0Sandbox.mapFilesystemError(error),
        });
      }
    }

    return results;
  }

  /**
   * Map Leap0 (or generic) errors to {@link FileOperationError} — same rules as Python.
   */
  static mapFilesystemApiError(exc: Leap0Error): FileOperationError {
    const combined = `${exc.message} ${bodySnippet(exc.body)}`.toLowerCase();
    if (exc.statusCode === 404) {
      return "file_not_found";
    }
    if (exc.statusCode === 403) {
      return "permission_denied";
    }
    if (combined.includes("not a regular file") || combined.includes("is a directory")) {
      return "is_directory";
    }
    return "permission_denied";
  }

  static mapFilesystemError(error: unknown): FileOperationError {
    if (error instanceof Leap0Error) {
      return Leap0Sandbox.mapFilesystemApiError(error);
    }
    return "permission_denied";
  }

  async close(): Promise<void> {
    const box = this.#sandbox;
    this.#sandbox = null;
    if (box) {
      try {
        await box.delete();
      } catch {
        // best-effort cleanup
      }
    }
    if (this.#ownsClient && this.#client) {
      try {
        await this.#client.close();
      } catch {
        // ignore
      }
      this.#client = null;
      this.#ownsClient = false;
    }
  }
}

export type AsyncLeap0SandboxFactory = () => Promise<Leap0Sandbox>;

/**
 * Async factory: each call creates a new sandbox (remember to `close()`).
 */
export function createLeap0SandboxFactory(
  options?: Leap0SandboxOptions,
): AsyncLeap0SandboxFactory {
  return async () => Leap0Sandbox.create(options);
}

/**
 * Sync factory compatible with filesystem middleware when reusing one sandbox.
 */
export function createLeap0SandboxFactoryFromSandbox(
  sandbox: Leap0Sandbox,
): BackendFactory {
  return () => sandbox;
}
