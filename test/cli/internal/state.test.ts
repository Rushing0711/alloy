// test/cli/internal/state.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stateCommand } from "../../../src/cli/commands/internal/state.js";
import { readState, createInitialState } from "../../../src/cli/utils/state.js";

describe("alloy _state", () => {
  let tmpDir: string;
  let changeDir: string;

  describe("已有 .alloy.yaml", () => {
    beforeEach(async () => {
      tmpDir = join(tmpdir(), `alloy-state-test-${Date.now()}`);
      changeDir = join(tmpDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      const yaml = [
        "worktree: null",
        "schema_version: 1",
        "phase: started",
        'created_at: "2020-01-01T00:00:00Z"',
        'updated_at: "2020-01-01T00:00:00Z"',
        "records: []",
      ].join("\n");
      await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
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

    it("write schema_version 转换为 number 类型", async () => {
      await stateCommand(["write", changeDir, "schema_version", "2"]);
      const state = await readState(changeDir);
      expect(state.schema_version).toBe(2);
      expect(typeof state.schema_version).toBe("number");
    });

    it("write 自动更新 updated_at（含 Z 后缀）", async () => {
      await stateCommand(["write", changeDir, "phase", "applied"]);
      const state = await readState(changeDir);
      expect(state.updated_at).not.toBe("2020-01-01T00:00:00Z");
      expect(state.updated_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it("write 支持含斜杠的路径值", async () => {
      await stateCommand(["write", changeDir, "worktree", ".worktrees/test-change"]);
      const state = await readState(changeDir);
      expect(state.worktree).toBe(".worktrees/test-change");
    });

    it("write + read feature_branch 往返一致", async () => {
      await stateCommand(["write", changeDir, "feature_branch", "feat/login"]);
      const state = await readState(changeDir);
      expect(state.feature_branch).toBe("feat/login");
    });

    it("read feature_branch 不存在时返回 null", async () => {
      const out = await captureOutput(() => stateCommand(["read", changeDir, "feature_branch"]));
      expect(out).toBe("null");
    });

    it("check phase 匹配时 exit 0", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      await stateCommand(["check", changeDir, "started"]);
      expect(exitSpy).not.toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it("check phase 不匹配时 exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      await stateCommand(["check", changeDir, "planned"]);
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it("write 缺少 field/value 时 exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      await stateCommand(["write", changeDir]);
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it("check 缺少 phase 时 exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      await stateCommand(["check", changeDir]);
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it("未知 action 时 exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      await stateCommand(["bogus", changeDir]);
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });
  });

  describe("init——文件不存在时创建完整初始状态", () => {
    beforeEach(async () => {
      tmpDir = join(tmpdir(), `alloy-state-init-${Date.now()}`);
      changeDir = join(tmpDir, "test-change");
      await mkdir(changeDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("init 创建 .alloy.yaml 并包含 records: []", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      await stateCommand(["init", changeDir]);

      const state = await readState(changeDir);
      expect(state.phase).toBe("started");
      expect(state.schema_version).toBe(1);
      expect(typeof state.schema_version).toBe("number");
      expect(state.worktree).toBeNull();
      expect(state.records).toEqual([]);
      expect(state.feature_branch).toBeUndefined();
      expect(state.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(state.updated_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

      exitSpy.mockRestore();
    });

    it("readState 在文件不存在时抛出包含路径的错误", async () => {
      await expect(readState(changeDir)).rejects.toThrow("缺少 .alloy.yaml");
    });

    it("write 到不存在的目录时先读取初始状态再写入", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      await stateCommand(["write", changeDir, "phase", "planned"]);
      const state = await readState(changeDir);
      expect(state.phase).toBe("planned");
      expect(state.schema_version).toBe(1); // 初始状态的默认值
      expect(state.records).toEqual([]); // 初始状态的 records
      exitSpy.mockRestore();
    });

    it("write schema_version 到新目录时转为 number", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      await stateCommand(["write", changeDir, "schema_version", "3"]);
      const state = await readState(changeDir);
      expect(state.schema_version).toBe(3);
      expect(typeof state.schema_version).toBe("number");
      exitSpy.mockRestore();
    });
  });
});
