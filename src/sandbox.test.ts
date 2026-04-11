import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Leap0Client, Sandbox } from "leap0";
import { Leap0Error, Leap0TimeoutError } from "leap0";
import { Leap0Sandbox } from "./sandbox.js";
import { Leap0SandboxError } from "./types.js";

const mockSandbox = {
  id: "mock-sandbox-id",
  process: {
    execute: vi.fn(),
  },
  filesystem: {
    writeBytes: vi.fn(),
    readBytes: vi.fn(),
    mkdir: vi.fn(),
  },
  delete: vi.fn(),
};

const mockCreate = vi.fn().mockResolvedValue(mockSandbox);
const mockGet = vi.fn().mockResolvedValue(mockSandbox);

vi.mock("leap0", async (importOriginal) => {
  const actual = await importOriginal<typeof import("leap0")>();
  return {
    ...actual,
    Leap0Client: class MockLeap0Client {
      sandboxes = { create: mockCreate, get: mockGet };
      close = vi.fn().mockResolvedValue(undefined);
    },
  };
});

describe("Leap0Sandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue(mockSandbox);
    mockGet.mockResolvedValue(mockSandbox);
  });

  describe("constructor", () => {
    it("creates deferred instance without client", () => {
      const s = new Leap0Sandbox({ leap0Config: {} });
      expect(s.isRunning).toBe(false);
      expect(s.id).toMatch(/^leap0-sandbox-/);
    });

    it("throws if only client is provided", () => {
      expect(
        () =>
          new Leap0Sandbox({
            client: {} as Leap0Client,
          } as ConstructorParameters<typeof Leap0Sandbox>[0]),
      ).toThrow(Leap0SandboxError);
    });
  });

  describe("fromConnected", () => {
    it("exposes sandbox id and is running", async () => {
      const { Leap0Client } = await import("leap0");
      const client = new Leap0Client({});
      const sb = (await client.sandboxes.create({})) as Sandbox;
      const backend = Leap0Sandbox.fromConnected(client, sb);
      expect(backend.isRunning).toBe(true);
      expect(backend.id).toBe("mock-sandbox-id");
    });
  });

  describe("instance getter", () => {
    it("throws before initialization", () => {
      const s = new Leap0Sandbox({ leap0Config: {} });
      expect(() => s.instance).toThrow("not initialized");
    });
  });

  describe("initialize", () => {
    it("provisions sandbox and updates id", async () => {
      const s = new Leap0Sandbox({ leap0Config: {} });
      await s.initialize();
      expect(s.isRunning).toBe(true);
      expect(s.id).toBe("mock-sandbox-id");
    });

    it("throws when initialized twice", async () => {
      const s = new Leap0Sandbox({ leap0Config: {} });
      await s.initialize();
      await expect(s.initialize()).rejects.toThrow("already initialized");
    });
  });

  describe("create", () => {
    it("returns initialized sandbox", async () => {
      const s = await Leap0Sandbox.create({ leap0Config: {} });
      expect(s.isRunning).toBe(true);
      await s.close();
    });
  });

  describe("execute", () => {
    it("merges stdout and stderr", async () => {
      mockSandbox.process.execute.mockResolvedValueOnce({
        stdout: "out",
        stderr: "err",
        exitCode: 0,
      });
      const s = await Leap0Sandbox.create({ leap0Config: {} });
      const r = await s.execute("true");
      expect(r.output).toBe("out\nerr");
      expect(r.exitCode).toBe(0);
      await s.close();
    });

    it("maps Leap0TimeoutError to COMMAND_TIMEOUT", async () => {
      mockSandbox.process.execute.mockRejectedValueOnce(
        new Leap0TimeoutError("timeout"),
      );
      const s = await Leap0Sandbox.create({ leap0Config: {} });
      await expect(s.execute("sleep 9")).rejects.toMatchObject({
        code: "COMMAND_TIMEOUT",
      });
      await s.close();
    });
  });

  describe("uploadFiles", () => {
    it("rejects non-absolute paths without API", async () => {
      const s = await Leap0Sandbox.create({ leap0Config: {} });
      const enc = new TextEncoder();
      const r = await s.uploadFiles([["rel.txt", enc.encode("x")]]);
      expect(r[0].error).toBe("invalid_path");
      expect(mockSandbox.filesystem.writeBytes).not.toHaveBeenCalled();
      await s.close();
    });

    it("uploads absolute paths", async () => {
      mockSandbox.filesystem.mkdir.mockResolvedValue(undefined);
      mockSandbox.filesystem.writeBytes.mockResolvedValue(undefined);
      const s = await Leap0Sandbox.create({ leap0Config: {} });
      const enc = new TextEncoder();
      const r = await s.uploadFiles([["/tmp/a.txt", enc.encode("hi")]]);
      expect(r[0].error).toBeNull();
      expect(mockSandbox.filesystem.mkdir).toHaveBeenCalledWith("/tmp", {
        recursive: true,
      });
      await s.close();
    });

    it("maps Leap0Error on write", async () => {
      mockSandbox.filesystem.mkdir.mockResolvedValue(undefined);
      mockSandbox.filesystem.writeBytes.mockRejectedValueOnce(
        new Leap0Error("nope", { statusCode: 403 }),
      );
      const s = await Leap0Sandbox.create({ leap0Config: {} });
      const enc = new TextEncoder();
      const r = await s.uploadFiles([["/x/y", enc.encode("z")]]);
      expect(r[0].error).toBe("permission_denied");
      await s.close();
    });
  });

  describe("downloadFiles", () => {
    it("maps 404 to file_not_found", async () => {
      mockSandbox.filesystem.readBytes.mockRejectedValueOnce(
        new Leap0Error("missing", { statusCode: 404 }),
      );
      const s = await Leap0Sandbox.create({ leap0Config: {} });
      const r = await s.downloadFiles(["/nope"]);
      expect(r[0].content).toBeNull();
      expect(r[0].error).toBe("file_not_found");
      await s.close();
    });
  });

  describe("mapFilesystemApiError", () => {
    it("detects directory message", () => {
      const e = new Leap0Error("read failed", {
        statusCode: 400,
        body: "path is a directory",
      });
      expect(Leap0Sandbox.mapFilesystemApiError(e)).toBe("is_directory");
    });
  });

  describe("close", () => {
    it("deletes sandbox when this instance created it", async () => {
      const s = await Leap0Sandbox.create({ leap0Config: {} });
      await s.close();
      expect(mockSandbox.delete).toHaveBeenCalled();
    });

    it("does not delete sandbox when attached via fromConnected", async () => {
      const { Leap0Client } = await import("leap0");
      const client = new Leap0Client({});
      const sb = (await client.sandboxes.create({})) as Sandbox;
      const backend = Leap0Sandbox.fromConnected(client, sb);
      await backend.close();
      expect(mockSandbox.delete).not.toHaveBeenCalled();
    });

    it("does not delete sandbox when attached via fromId", async () => {
      const id = "existing-sandbox-id";
      const backend = await Leap0Sandbox.fromId(id);
      expect(mockGet).toHaveBeenCalledWith(id);
      await backend.close();
      expect(mockSandbox.delete).not.toHaveBeenCalled();
    });
  });
});

describe("Leap0SandboxError", () => {
  it("carries code and cause", () => {
    const cause = new Error("x");
    const err = new Leap0SandboxError("msg", "NOT_INITIALIZED", cause);
    expect(err.message).toBe("msg");
    expect(err.code).toBe("NOT_INITIALIZED");
    expect(err.cause).toBe(cause);
  });
});
