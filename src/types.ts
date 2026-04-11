import type { SandboxErrorCode } from "deepagents";
import { SandboxError } from "deepagents";

import type {
  CreateSandboxParams,
  Leap0Client,
  Leap0Config,
  Sandbox,
} from "leap0";

const LEAP0_SANDBOX_ERROR_SYMBOL = Symbol.for("leap0.langchain.sandbox.error");

/**
 * Options for {@link Leap0Sandbox} construction and {@link Leap0Sandbox.create}.
 */
export interface Leap0SandboxOptions {
  /**
   * Existing API client. Required together with `sandbox` for the connected
   * constructor shape (same as the Python package).
   */
  client?: Leap0Client;
  /**
   * Connected sandbox handle from `client.sandboxes.create()` or `get()`.
   */
  sandbox?: Sandbox;
  /**
   * Passed to `new Leap0Client(...)` when this class creates the client.
   */
  leap0Config?: Leap0Config;
  /**
   * Arguments for `client.sandboxes.create()` during {@link Leap0Sandbox.initialize}.
   */
  createParams?: CreateSandboxParams;
  /**
   * Default command timeout in seconds (mapped to the Leap0 process API as milliseconds).
   * @default 1800 (30 minutes)
   */
  commandTimeoutSeconds?: number;
  /**
   * UTF-8 files to write after the sandbox exists (paths should be absolute).
   */
  initialFiles?: Record<string, string>;
  /**
   * When true with `client` + `sandbox`, `close()` will also `client.close()`.
   * Used by {@link Leap0Sandbox.fromId}.
   * @internal
   */
  ownClient?: boolean;
}

export type Leap0SandboxErrorCode =
  | SandboxErrorCode
  | "SANDBOX_CREATION_FAILED"
  | "SANDBOX_NOT_FOUND";

/**
 * Structured error for Leap0 sandbox backend failures.
 */
export class Leap0SandboxError extends SandboxError {
  [LEAP0_SANDBOX_ERROR_SYMBOL] = true as const;
  override readonly name = "Leap0SandboxError";

  constructor(
    message: string,
    public readonly code: Leap0SandboxErrorCode,
    public override readonly cause?: Error,
  ) {
    super(message, code, cause);
    Object.setPrototypeOf(this, Leap0SandboxError.prototype);
  }

  static isInstance(error: unknown): error is Leap0SandboxError {
    return (
      typeof error === "object" &&
      error !== null &&
      (error as Record<symbol, unknown>)[LEAP0_SANDBOX_ERROR_SYMBOL] === true
    );
  }
}
