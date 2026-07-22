// test/cli/internal/phase-downgrade.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { phaseCommand } from "../../../src/cli/commands/internal/phase.js";
import { readState } from "../../../src/cli/utils/state.js";

describe("alloy _phase downgrade", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-phase-downgrade-test-${Date.now()}`);
    changeDir = join(tmpDir, "openspec", "changes", "test-change");
    await mkdir(changeDir, { recursive: true });

    execSync("git init -b main", { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.name "test-user"', { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });

    await writeFile(join(tmpDir, "README.md"), "init", "utf-8");
    execSync("git add README.md && git commit -m 'chore: init'", { cwd: tmpDir, stdio: "pipe" });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function setupPhase(phase: string) {
    const yaml = [
      `phase: ${phase}`,
      "schema_version: 1",
      "worktree: null",
      'created_at: "2020-01-01 00:00:00"',
      'updated_at: "2020-01-01 00:00:00"',
      "phase_timings:",
      "  start:",
      '    started_at: "2020-01-01 10:00:00"',
      "    completed_at: null",
      "records: []",
      "skill_usage: []",
      "gate_history: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    execSync("git add openspec/ && git commit -m 'chore: setup phase'", { cwd: tmpDir, stdio: "pipe" });
  }

  it("缺参数 -> exit 1", async () => {
    await setupPhase("applied");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await phaseCommand(["downgrade"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("非法降级(started 不支持降级)-> exit 1", async () => {
    await setupPhase("started");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await phaseCommand(["downgrade", changeDir, "started"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errOutput = errSpy.mock.calls.map(c => String(c[0])).join("\n");
    expect(errOutput).toContain("不支持降级");
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("非法降级(applied -> archived 不是合法降级)-> exit 1", async () => {
    await setupPhase("applied");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // applied 只能降级到 planned,不能到 archived
    await phaseCommand(["downgrade", changeDir, "archived"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errOutput = errSpy.mock.calls.map(c => String(c[0])).join("\n");
    expect(errOutput).toContain("降级不合法");
    expect(errOutput).toContain("planned");
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("合法降级(applied -> planned)-> 成功 + phase 写入 + commit", async () => {
    await setupPhase("applied");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await phaseCommand(["downgrade", changeDir, "planned"]);

    // 验证 phase 写入
    const state = await readState(changeDir);
    expect(state.phase).toBe("planned");

    // 验证 commit 创建
    const log = execSync("git log --oneline -1", { cwd: tmpDir, encoding: "utf-8", stdio: "pipe" }).trim();
    expect(log).toContain("phase 降级 applied -> planned");

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("合法降级(archiving -> applied,archive 失败降级)-> 成功", async () => {
    await setupPhase("archiving");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await phaseCommand(["downgrade", changeDir, "applied"]);

    const state = await readState(changeDir);
    expect(state.phase).toBe("applied");

    const log = execSync("git log --oneline -1", { cwd: tmpDir, encoding: "utf-8", stdio: "pipe" }).trim();
    expect(log).toContain("phase 降级 archiving -> applied");

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });
});
