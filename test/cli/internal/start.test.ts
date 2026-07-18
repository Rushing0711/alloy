// test/cli/internal/start.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { startCommand } from "../../../src/cli/commands/internal/start.js";
import { readState } from "../../../src/cli/utils/state.js";
import * as precheckModule from "../../../src/core/precheck.js";

const ALLOY_SCHEMA_PATH = join(process.cwd(), "openspec", "schemas", "alloy", "schema.yaml");

describe("alloy _start", () => {
  let tmpDir: string;
  let changeDir: string;
  let originalCwd: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let alloySchema: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-start-test-${Date.now()}`);
    changeDir = join(tmpDir, "openspec", "changes", "test-change");
    originalCwd = process.cwd();

    alloySchema = await readFile(ALLOY_SCHEMA_PATH, "utf-8");

    await mkdir(join(tmpDir, "openspec", "schemas", "alloy"), { recursive: true });
    await mkdir(join(tmpDir, "openspec", "changes"), { recursive: true });

    execSync("git init -q", { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.name "test-user"', { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });
    try { execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" }); } catch { /* 已是 main */ }
    await writeFile(join(tmpDir, "README.md"), "# test", "utf-8");
    execSync("git add README.md", { cwd: tmpDir, stdio: "pipe" });
    execSync('git commit -q -m "init"', { cwd: tmpDir, stdio: "pipe" });

    await writeFile(join(tmpDir, "openspec", "config.yaml"), "schema: alloy\nalloy:\n  main_branch: main\n  target_agents: [claude-code]\n", "utf-8");
    await writeFile(join(tmpDir, "openspec", "schemas", "alloy", "schema.yaml"), alloySchema, "utf-8");

    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function gitLog(): string {
    try { return execSync("git log --oneline", { cwd: tmpDir, encoding: "utf-8" }).trim(); } catch { return ""; }
  }

  function listTags(): string[] {
    try {
      const out = execSync("git tag -l 'alloy-checkpoint-*'", { cwd: tmpDir, encoding: "utf-8" }).trim();
      return out ? out.split("\n") : [];
    } catch { return []; }
  }

  describe("bootstrap", () => {
    it("成功:6 步执行,state + skill log + phase start 全部写入", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      await startCommand([
        "bootstrap", changeDir,
        "--start-at", "2026-07-16 08:28:38",
        "--opsx-new-at", "2026-07-16 08:31:19",
        "--feature-branch", "feature/test-change",
      ]);

      const state = await readState(changeDir);
      // state init 写入
      expect(state.feature_branch).toBe("feature/test-change");
      expect(state.started_at).toBe("2026-07-16 08:28:38");
      // skill log 写入
      const skills = state.skill_usage ?? [];
      const exploreSkill = skills.find(s => s.skill === "opsx:explore");
      const newSkill = skills.find(s => s.skill === "opsx:new");
      expect(exploreSkill?.called_at).toBe("2026-07-16 08:28:38");
      expect(newSkill?.called_at).toBe("2026-07-16 08:31:19");
      // phase start 写入
      expect(state.phase).toBe("starting");
      expect(state.phase_timings?.start?.started_at).toBe("2026-07-16 08:28:38");
      // worktree null
      expect(state.worktree).toBeNull();
      // commit 历史(至少有 phase start commit)
      expect(gitLog()).toContain("记录 start 阶段开始时间");
    });

    it("两 --at 同值:HARD_STOP exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await startCommand([
        "bootstrap", changeDir,
        "--start-at", "2026-07-16 08:28:38",
        "--opsx-new-at", "2026-07-16 08:28:38",
        "--feature-branch", "feature/test-change",
      ]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errSpy.mock.calls.some(c => String(c[0]).includes("HARD_STOP"))).toBe(true);
      expect(errSpy.mock.calls.some(c => String(c[0]).includes("必须不同值"))).toBe(true);
      // state 不应被创建(校验在 step 1 之前)
      expect(existsSync(join(changeDir, ".alloy.yaml"))).toBe(false);
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("缺少 --feature-branch:PRECONDITION_FAIL exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await startCommand([
        "bootstrap", changeDir,
        "--start-at", "2026-07-16 08:28:38",
        "--opsx-new-at", "2026-07-16 08:31:19",
      ]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errSpy.mock.calls.some(c => String(c[0]).includes("PRECONDITION_FAIL"))).toBe(true);
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("缺少 change-dir:exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await startCommand([
        "bootstrap",
        "--start-at", "2026-07-16 08:28:38",
        "--opsx-new-at", "2026-07-16 08:31:19",
        "--feature-branch", "feature/test-change",
      ]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });
  });

  describe("finalize", () => {
    beforeEach(async () => {
      // 手动搭建 starting 状态(模拟 bootstrap 已完成)
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, ".alloy.yaml"), [
        "phase: starting",
        "schema_version: 1",
        "worktree: null",
        "feature_branch: feature/test-change",
        "worktree_branch: null",
        "worktree_created_at: null",
        "worktree_merged_at: null",
        'created_at: "2020-01-01 00:00:00"',
        'updated_at: "2020-01-01 00:00:00"',
        'started_at: "2020-01-01 00:00:00"',
        "completed_at: null",
        "records: []",
        "skill_usage: []",
        "pending_gate: null",
        "phase_timings:",
        "  start:",
        '    started_at: "2020-01-01 00:00:00"',
        "    completed_at: null",
      ].join("\n"), "utf-8");

      // 创建 draft.md
      await writeFile(join(changeDir, "draft.md"), "# Draft\n\ntest draft content", "utf-8");

      // 切到 feature 分支
      execSync("git checkout -b feature/test-change main", { cwd: tmpDir, stdio: "pipe" });
      // commit .alloy.yaml + draft.md(确保 working tree clean)
      execSync("git add openspec/", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -q -m "init change"', { cwd: tmpDir, stdio: "pipe" });
    });

    it("成功:4 步执行,draft hash-lock + checkpoint + verify + phase complete", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      await startCommand(["finalize", changeDir]);

      const state = await readState(changeDir);
      // artifact commit 写入 records
      expect(state.records?.some(r => r.artifact === "draft")).toBe(true);
      // phase complete 写入
      expect(state.phase).toBe("started");
      expect(state.phase_timings?.start?.completed_at).toBeTruthy();
      // checkpoint tag 创建
      const tags = listTags();
      expect(tags.some(t => t.includes("brainstorming-1"))).toBe(true);
    });

    it("verify 失败(phase 不匹配):exit 1,phase complete 不执行", async () => {
      // 改 phase 为 planning(verify 期望 starting)
      const state = await readState(changeDir);
      state.phase = "planning";
      const { writeState } = await import("../../../src/cli/utils/state.js");
      await writeState(changeDir, state);
      execSync("git add openspec/", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -q -m "change phase"', { cwd: tmpDir, stdio: "pipe" });

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});

      await startCommand(["finalize", changeDir]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      // verify 失败信息
      expect(errSpy.mock.calls.some(c => String(c[0]).includes("PRECONDITION_FAIL"))).toBe(true);

      // phase complete 不应执行(phase 仍为 planning,未推进到 started)
      // 注意:artifact commit 已执行(draft hash-lock),但 phase complete 未执行
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("缺少 change-dir:exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await startCommand(["finalize"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });
  });

  describe("precheck", () => {
    /** 搭建 claude-code skills 目录,让 env check 的第 4 项(Alloy skills)通过 */
    async function setupSkillsDir() {
      await mkdir(join(tmpDir, ".claude", "skills", "alloy-start"), { recursive: true });
      await writeFile(join(tmpDir, ".claude", "skills", "alloy-start", "SKILL.md"), "# alloy-start", "utf-8");
    }

    it("env 失败(缺 config.yaml):exit 1 + PRECONDITION_FAIL", async () => {
      await rm(join(tmpDir, "openspec", "config.yaml"));

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await startCommand(["precheck", "--cmd", "opsx/explore opsx/new", "--skill", "brainstorming"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(logSpy.mock.calls.some(c => String(c[0]).includes("PRECONDITION_FAIL"))).toBe(true);
      expect(logSpy.mock.calls.some(c => String(c[0]).includes("config.yaml"))).toBe(true);
      exitSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("有活跃 change:route=resume + active_changes 列表", async () => {
      await setupSkillsDir();

      // 创建一个活跃 change(phase=started)
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, ".alloy.yaml"), [
        "phase: started",
        "schema_version: 1",
        "worktree: null",
        "feature_branch: feature/test-change",
        "worktree_branch: null",
        "worktree_created_at: null",
        "worktree_merged_at: null",
        'created_at: "2026-07-16 10:00:00"',
        'updated_at: "2026-07-16 10:00:00"',
        'started_at: "2026-07-16 10:00:00"',
        "completed_at: null",
        "records: []",
        "skill_usage: []",
        "pending_gate: null",
      ].join("\n"), "utf-8");
      await writeFile(join(changeDir, "draft.md"), "# Draft", "utf-8");

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await startCommand(["precheck", "--cmd", "opsx/explore opsx/new", "--skill", "brainstorming"]);

      expect(exitSpy).toHaveBeenCalledWith(0);
      const output = logSpy.mock.calls.map(c => String(c[0])).join("\n");
      expect(output).toContain("active_changes: 1");
      expect(output).toContain("test-change");
      expect(output).toContain("phase: started");
      expect(output).toContain("route: resume");
      exitSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("无活跃 change + precheck 通过:route=unified + start_time", async () => {
      await setupSkillsDir();

      // mock evaluatePrecheck 返回成功(避免依赖 openspec CLI 安装状态)
      vi.spyOn(precheckModule, "evaluatePrecheck").mockReturnValue({
        exitCode: 0,
        missing: [],
        found: [{ agent: "claude-code", cmds: ["opsx/explore", "opsx/new"], skills: ["brainstorming"] }],
        openspecCliReady: true,
      });

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await startCommand(["precheck", "--cmd", "opsx/explore opsx/new", "--skill", "brainstorming"]);

      expect(exitSpy).toHaveBeenCalledWith(0);
      const output = logSpy.mock.calls.map(c => String(c[0])).join("\n");
      expect(output).toContain("active_changes: 0");
      expect(output).toContain("start_time:");
      expect(output).toContain("route: unified");
      expect(output).toMatch(/start_time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
      exitSpy.mockRestore();
      logSpy.mockRestore();
      vi.restoreAllMocks();
    });

    it("无活跃 change + precheck 失败:route=abort + exit 1", async () => {
      await setupSkillsDir();

      // mock evaluatePrecheck 返回失败
      vi.spyOn(precheckModule, "evaluatePrecheck").mockReturnValue({
        exitCode: 1,
        missing: [{ agent: "claude-code", cmds: ["opsx/explore"], skills: [] }],
        found: [],
        openspecCliReady: true,
      });

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await startCommand(["precheck", "--cmd", "opsx/explore opsx/new", "--skill", "brainstorming"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      const output = logSpy.mock.calls.map(c => String(c[0])).join("\n");
      expect(output).toContain("start_time:");
      expect(output).toContain("route: abort");
      exitSpy.mockRestore();
      logSpy.mockRestore();
      vi.restoreAllMocks();
    });
  });

  it("无子命令:exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await startCommand([]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("未知子命令:exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await startCommand(["unknown"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});
