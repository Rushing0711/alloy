// test/cli/internal/config.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configCommand } from "../../../src/cli/commands/internal/config.js";
import { readProjectConfig } from "../../../src/cli/utils/state.js";

describe("alloy _config", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-config-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function captureOutput(fn: () => Promise<void> | void): Promise<string> {
    return new Promise((resolve, reject) => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      });
      try {
        const result = fn();
        if (result instanceof Promise) {
          result.then(() => {
            spy.mockRestore();
            resolve(logs.join("\n"));
          }).catch((err: unknown) => {
            spy.mockRestore();
            reject(err);
          });
        } else {
          spy.mockRestore();
          resolve(logs.join("\n"));
        }
      } catch (err) {
        spy.mockRestore();
        reject(err);
      }
    });
  }

  it("write + read main_branch 往返一致", async () => {
    await configCommand(["write", tmpDir, "main_branch", "main"]);
    const out = await captureOutput(() => configCommand(["read", tmpDir, "main_branch"]));
    expect(out).toBe("main");
  });

  it("read 不存在的字段返回 null", async () => {
    const out = await captureOutput(() => configCommand(["read", tmpDir, "main_branch"]));
    expect(out).toBe("null");
  });

  it("write 覆盖已有值", async () => {
    await configCommand(["write", tmpDir, "main_branch", "main"]);
    await configCommand(["write", tmpDir, "main_branch", "master"]);
    const out = await captureOutput(() => configCommand(["read", tmpDir, "main_branch"]));
    expect(out).toBe("master");
  });

  it("write 后 readProjectConfig 能读到", async () => {
    await configCommand(["write", tmpDir, "main_branch", "develop"]);
    const config = await readProjectConfig(tmpDir);
    expect(config.alloy.main_branch).toBe("develop");
  });

  it("缺少参数时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await configCommand([]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("未知操作时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await configCommand(["bogus", tmpDir]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
