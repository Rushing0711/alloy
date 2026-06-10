// test/cli/internal/skill-usage.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { skillUsageCommand } from "../../../src/cli/commands/internal/skill-usage.js";
import { readState } from "../../../src/cli/utils/state.js";

describe("alloy _skill", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-skill-test-${Date.now()}`);
    changeDir = join(tmpDir, "test-change");
    await mkdir(changeDir, { recursive: true });
    const yaml = [
      "phase: started",
      "schema_version: 1",
      "worktree: null",
      'created_at: "2020-01-01T00:00:00Z"',
      'updated_at: "2020-01-01T00:00:00Z"',
      "skill_usage: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function captureLog(fn: () => Promise<void> | void): Promise<string> {
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

  describe("log", () => {
    it("写入新 entry 到 skill_usage，count=1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await skillUsageCommand(["log", changeDir, "apply", "my-skill"]);

      const state = await readState(changeDir);
      expect(state.skill_usage).toHaveLength(1);
      expect(state.skill_usage[0].skill).toBe("my-skill");
      expect(state.skill_usage[0].stage).toBe("apply");
      expect(state.skill_usage[0].used).toBe(true);
      expect(state.skill_usage[0].count).toBe(1);

      exitSpy.mockRestore();
    });

    it("同 skill+stage 的第二次 log 递增 count 到 2", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await skillUsageCommand(["log", changeDir, "apply", "my-skill"]);
      await skillUsageCommand(["log", changeDir, "apply", "my-skill"]);

      const state = await readState(changeDir);
      expect(state.skill_usage).toHaveLength(1);
      expect(state.skill_usage[0].count).toBe(2);

      exitSpy.mockRestore();
    });

    it("不同 stage 视为不同 entry", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await skillUsageCommand(["log", changeDir, "apply", "my-skill"]);
      await skillUsageCommand(["log", changeDir, "plan", "my-skill"]);

      const state = await readState(changeDir);
      expect(state.skill_usage).toHaveLength(2);
      expect(state.skill_usage[0].stage).toBe("apply");
      expect(state.skill_usage[1].stage).toBe("plan");

      exitSpy.mockRestore();
    });
  });

  describe("skip", () => {
    it("写入 used=false 的 entry 并带 reason", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await skillUsageCommand(["skip", changeDir, "plan", "my-skill", "--reason", "not needed"]);

      const state = await readState(changeDir);
      expect(state.skill_usage).toHaveLength(1);
      expect(state.skill_usage[0].used).toBe(false);
      expect(state.skill_usage[0].reason).toBe("not needed");
      expect(state.skill_usage[0].count).toBeUndefined();

      exitSpy.mockRestore();
    });

    it("skip 后再 skip 同 skill+stage 会覆盖", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await skillUsageCommand(["skip", changeDir, "plan", "my-skill", "--reason", "first reason"]);
      await skillUsageCommand(["skip", changeDir, "plan", "my-skill", "--reason", "second reason"]);

      const state = await readState(changeDir);
      expect(state.skill_usage).toHaveLength(1);
      expect(state.skill_usage[0].reason).toBe("second reason");

      exitSpy.mockRestore();
    });
  });

  describe("log 后 skip 的幂等行为", () => {
    it("skip 覆盖 log，used 从 true 变成 false，count 不再保留", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      // 先 log
      await skillUsageCommand(["log", changeDir, "apply", "my-skill"]);
      // 再 skip
      await skillUsageCommand(["skip", changeDir, "apply", "my-skill", "--reason", "changed mind"]);

      const state = await readState(changeDir);
      expect(state.skill_usage).toHaveLength(1);
      expect(state.skill_usage[0].used).toBe(false);
      expect(state.skill_usage[0].reason).toBe("changed mind");
      expect(state.skill_usage[0].count).toBeUndefined();

      exitSpy.mockRestore();
    });

    it("skip 后 log 会重置 used=true 且 count=1（非 count=2）", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      // 先 skip
      await skillUsageCommand(["skip", changeDir, "apply", "my-skill", "--reason", "not ready"]);
      // 再 log——这是 Bug 修复的关键场景：prev 没有 count
      await skillUsageCommand(["log", changeDir, "apply", "my-skill"]);

      const state = await readState(changeDir);
      expect(state.skill_usage).toHaveLength(1);
      expect(state.skill_usage[0].used).toBe(true);
      // 修复前: count=2（bug），修复后: count=1
      expect(state.skill_usage[0].count).toBe(1);

      exitSpy.mockRestore();
    });
  });

  describe("--via 标志", () => {
    it("log 时解析 --via", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await skillUsageCommand(["log", changeDir, "apply", "my-skill", "--via", "start.md"]);

      const state = await readState(changeDir);
      expect(state.skill_usage[0].via).toBe("start.md");

      exitSpy.mockRestore();
    });

    it("skip 时忽略 --via", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await skillUsageCommand(["skip", changeDir, "plan", "my-skill", "--via", "start.md", "--reason", "n/a"]);

      const state = await readState(changeDir);
      expect(state.skill_usage[0].via).toBeUndefined();

      exitSpy.mockRestore();
    });
  });

  describe("--reason 标志", () => {
    it("skip 时解析 --reason", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await skillUsageCommand(["skip", changeDir, "plan", "my-skill", "--reason", "用户确认跳过"]);

      const state = await readState(changeDir);
      expect(state.skill_usage[0].reason).toBe("用户确认跳过");

      exitSpy.mockRestore();
    });

    it("log 时忽略 --reason", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await skillUsageCommand(["log", changeDir, "apply", "my-skill", "--reason", "should not appear"]);

      const state = await readState(changeDir);
      expect(state.skill_usage[0].reason).toBeUndefined();

      exitSpy.mockRestore();
    });
  });

  describe("输出信息", () => {
    it("log 输出 used 信息", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      const out = await captureLog(() =>
        skillUsageCommand(["log", changeDir, "apply", "my-skill"])
      );

      expect(out).toContain("skill_usage: my-skill (apply) → used");

      exitSpy.mockRestore();
    });

    it("skip 输出 skipped 信息", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      const out = await captureLog(() =>
        skillUsageCommand(["skip", changeDir, "plan", "my-skill", "--reason", "n/a"])
      );

      expect(out).toContain("skill_usage: my-skill (plan) → skipped");

      exitSpy.mockRestore();
    });
  });

  describe("参数校验", () => {
    it("缺少参数时 exit 1 并显示用法", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await skillUsageCommand([]);

      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("缺少 stage 时 exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await skillUsageCommand(["log", changeDir, "apply"]);

      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("未知 action 时 exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await skillUsageCommand(["unknown", changeDir, "apply", "my-skill"]);

      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });
  });

  describe("防御——state.skill_usage 为 undefined", () => {
    beforeEach(async () => {
      tmpDir = join(tmpdir(), `alloy-skill-def-${Date.now()}`);
      changeDir = join(tmpDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      // 故意不写 skill_usage 字段
      const yaml = [
        "phase: started",
        "schema_version: 1",
        "worktree: null",
        'created_at: "2020-01-01T00:00:00Z"',
        'updated_at: "2020-01-01T00:00:00Z"',
      ].join("\n");
      await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("skill_usage 缺失时 log 正常工作（不崩溃）", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await skillUsageCommand(["log", changeDir, "apply", "my-skill"]);

      const state = await readState(changeDir);
      expect(state.skill_usage).toHaveLength(1);
      expect(state.skill_usage[0].skill).toBe("my-skill");

      exitSpy.mockRestore();
    });
  });
});
