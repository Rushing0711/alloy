// test/cli/internal/state.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stateCommand } from "../../../src/cli/commands/internal/state.js";
import { readState } from "../../../src/cli/utils/state.js";

describe("alloy _state", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-state-test-${Date.now()}`);
    changeDir = join(tmpDir, "test-change");
    await mkdir(changeDir, { recursive: true });
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: started",
      'updated_at: "2020-01-01T00:00:00"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // 捕获 console.log 输出
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

  it("read phase 返回 started", async () => {
    const out = await captureOutput(() => stateCommand(["read", changeDir, "phase"]));
    expect(out).toBe("started");
  });

  it("read worktree 返回 null", async () => {
    const out = await captureOutput(() => stateCommand(["read", changeDir, "worktree"]));
    expect(out).toBe("null");
  });

  it("read schema_version 返回 1", async () => {
    const out = await captureOutput(() => stateCommand(["read", changeDir, "schema_version"]));
    expect(out).toBe("1");
  });

  it("write 更新 phase 字段", async () => {
    await stateCommand(["write", changeDir, "phase", "planned"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("planned");
  });

  it("write 自动更新 updated_at", async () => {
    await stateCommand(["write", changeDir, "phase", "applied"]);
    const state = await readState(changeDir);
    expect(state.updated_at).not.toBe("2020-01-01T00:00:00");
    expect(state.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it("write 支持含斜杠的路径值", async () => {
    await stateCommand(["write", changeDir, "worktree", ".worktrees/test-change"]);
    const state = await readState(changeDir);
    expect(state.worktree).toBe(".worktrees/test-change");
  });

  it("check phase 匹配时 exit 0", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await stateCommand(["check", changeDir, "started"]);
    // 如果 check 通过，不会调用 process.exit(1)
    expect(exitSpy).not.toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("check phase 不匹配时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await stateCommand(["check", changeDir, "planned"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
