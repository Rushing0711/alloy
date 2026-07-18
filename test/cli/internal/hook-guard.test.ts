// test/cli/internal/hook-guard.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => { throw new Error("不应被调用"); },
}));

import { evaluateHook, collectPhases, collectPendingGates, clearAllPendingGates, collectWorktreePaths } from "../../../src/cli/commands/internal/hook-guard.js";
import { writeState, createInitialState, readState } from "../../../src/cli/utils/state.js";

describe("alloy _hook-guard", () => {
  describe("evaluateHook(纯逻辑)", () => {
    it("ALLOY_FORCE_WRITE=1 逃生阀 -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], { ALLOY_FORCE_WRITE: "1" });
      expect(result.exitCode).toBe(0);
    });

    it("空 stdin -> exit 0(非 hook 场景)", () => {
      const result = evaluateHook("", ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("非 JSON stdin -> exit 0", () => {
      const result = evaluateHook("not json", ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("非 Write/Edit 工具 -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("Read 工具 -> exit 0(只拦写)", () => {
      const stdin = JSON.stringify({ tool_name: "Read", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("Write 工具 + apply phases -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["applying"], {});
      expect(result.exitCode).toBe(0);
    });

    it("Write 工具 + 非 apply phases + src/ -> exit 2 + 拦截消息", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("src/foo.ts");
      expect(result.message).toContain("started");
    });

    it("Edit 工具 + 非 apply phases + src/ -> exit 2", () => {
      const stdin = JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["planned"], {});
      expect(result.exitCode).toBe(2);
    });

    it("Write 工具 + 非 apply phases + openspec/ -> exit 0(白名单)", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "openspec/changes/foo/proposal.md" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("Write 工具 + 空 phases(非 alloy 项目) -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, [], {}, undefined, [], false);
      expect(result.exitCode).toBe(0);
    });

    it("Write 工具 + alloy 项目 + 空 phases -> exit 2(核心修复:防绕过)", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, [], {}, undefined, [], true);
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("无活跃 change");
    });

    it("Write 工具 + alloy 项目 + 空 phases + 白名单 -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "openspec/foo.md" } });
      const result = evaluateHook(stdin, [], {}, undefined, [], true);
      expect(result.exitCode).toBe(0);
    });

    it("Write 工具 + 无 file_path -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: {} });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("Write 工具 + 绝对路径 -> 正确转相对路径判定", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/project/src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], {}, "/project");
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("src/foo.ts");
    });

    it("Write 工具 + 绝对路径 + apply -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/project/src/foo.ts" } });
      const result = evaluateHook(stdin, ["applied"], {}, "/project");
      expect(result.exitCode).toBe(0);
    });

    it("拦截消息包含逃生阀提示", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.message).toContain("ALLOY_FORCE_WRITE=1");
    });

    it("拦截消息包含 apply 阶段进入提示", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.message).toContain("alloy _phase start");
    });

    it("AskUserQuestion 工具 + pendingGates 非空 -> clearPendingGates: true, exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "AskUserQuestion", tool_input: {} });
      const result = evaluateHook(stdin, ["started"], {}, undefined, ["confirm-main-branch"]);
      expect(result.exitCode).toBe(0);
      expect(result.clearPendingGates).toBe(true);
    });

    it("AskUserQuestion + pendingGates 空 -> clearPendingGates falsy", () => {
      const stdin = JSON.stringify({ tool_name: "AskUserQuestion", tool_input: {} });
      const result = evaluateHook(stdin, ["started"], {}, undefined, []);
      expect(result.exitCode).toBe(0);
      expect(result.clearPendingGates).toBeFalsy();
    });

    it("question 工具(OpenCode)+ pendingGates 非空 -> clearPendingGates: true", () => {
      const stdin = JSON.stringify({ tool_name: "question", tool_input: {} });
      const result = evaluateHook(stdin, ["started"], {}, undefined, ["gate-a"]);
      expect(result.exitCode).toBe(0);
      expect(result.clearPendingGates).toBe(true);
    });

    it("Write + pendingGates 非空 + 非白名单 -> exit 2(拦截)", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["applying"], {}, undefined, ["confirm-execution"]);
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("user-gate");
    });

    it("Write + pendingGates 非空 + 白名单 -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "openspec/foo.md" } });
      const result = evaluateHook(stdin, ["started"], {}, undefined, ["gate-a"]);
      expect(result.exitCode).toBe(0);
    });

    it("Write + pendingGates 非空 + apply 阶段 -> exit 2(pending_gate 优先于 apply)", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["applying"], {}, undefined, ["gate-a"]);
      expect(result.exitCode).toBe(2);
    });

    it("Write + pendingGates 非空 + 拦截消息含 _guard user-gate pass", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], {}, undefined, ["gate-a"]);
      expect(result.message).toContain("alloy _guard user-gate pass");
    });

    it("Claude Code(CLAUDECODE=1)拦截消息含 AskUserQuestion", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], { CLAUDECODE: "1" }, undefined, ["gate-a"]);
      expect(result.message).toContain("AskUserQuestion");
    });

    it("OpenCode(OPENCODE=1)拦截消息含 question", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], { OPENCODE: "1" }, undefined, ["gate-a"]);
      expect(result.message).toContain("question");
    });

    it("Pi(PI_CODING_AGENT=true)拦截消息含 ctx.ui", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], { PI_CODING_AGENT: "true" }, undefined, ["gate-a"]);
      expect(result.message).toContain("ctx.ui");
    });
  });

  describe("collectPhases(文件系统扫描)", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = join(tmpdir(), `alloy-hook-guard-${Date.now()}`);
      await mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("无 openspec/changes/ -> []", () => {
      expect(collectPhases(tmpDir)).toEqual([]);
    });

    it("有 change + .alloy.yaml -> [phase]", async () => {
      const changeDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, ".alloy.yaml"), "phase: started\nworktree: null\n", "utf-8");
      expect(collectPhases(tmpDir)).toEqual(["started"]);
    });

    it("有 change 无 .alloy.yaml -> []", async () => {
      const changeDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(changeDir, { recursive: true });
      expect(collectPhases(tmpDir)).toEqual([]);
    });

    it("多个 change -> [phase1, phase2]", async () => {
      const fooDir = join(tmpDir, "openspec", "changes", "foo");
      const barDir = join(tmpDir, "openspec", "changes", "bar");
      await mkdir(fooDir, { recursive: true });
      await mkdir(barDir, { recursive: true });
      await writeFile(join(fooDir, ".alloy.yaml"), "phase: started\n", "utf-8");
      await writeFile(join(barDir, ".alloy.yaml"), "phase: applying\n", "utf-8");
      const phases = collectPhases(tmpDir);
      expect(phases).toContain("started");
      expect(phases).toContain("applying");
      expect(phases).toHaveLength(2);
    });

    it(".alloy.yaml 无 phase 字段 -> 跳过", async () => {
      const changeDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, ".alloy.yaml"), "worktree: null\n", "utf-8");
      expect(collectPhases(tmpDir)).toEqual([]);
    });

    it("phase 值带引号 -> 正确提取", async () => {
      const changeDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, ".alloy.yaml"), 'phase: "planned"\n', "utf-8");
      expect(collectPhases(tmpDir)).toEqual(["planned"]);
    });

    it("扫描 archive/ 下的 archived change -> [archived]", async () => {
      const archiveChangeDir = join(tmpDir, "openspec", "changes", "archive", "2026-07-10-foo");
      await mkdir(archiveChangeDir, { recursive: true });
      await writeFile(join(archiveChangeDir, ".alloy.yaml"), "phase: archived\n", "utf-8");
      expect(collectPhases(tmpDir)).toEqual(["archived"]);
    });

    it("扫描 archive/ 下的 finished change -> [finished]", async () => {
      const archiveChangeDir = join(tmpDir, "openspec", "changes", "archive", "2026-07-10-foo");
      await mkdir(archiveChangeDir, { recursive: true });
      await writeFile(join(archiveChangeDir, ".alloy.yaml"), "phase: finished\n", "utf-8");
      expect(collectPhases(tmpDir)).toEqual(["finished"]);
    });

    it("同时扫描活跃 + 归档 change", async () => {
      const activeDir = join(tmpDir, "openspec", "changes", "bar");
      const archiveDir = join(tmpDir, "openspec", "changes", "archive", "2026-07-10-foo");
      await mkdir(activeDir, { recursive: true });
      await mkdir(archiveDir, { recursive: true });
      await writeFile(join(activeDir, ".alloy.yaml"), "phase: applying\n", "utf-8");
      await writeFile(join(archiveDir, ".alloy.yaml"), "phase: finished\n", "utf-8");
      const phases = collectPhases(tmpDir);
      expect(phases).toContain("applying");
      expect(phases).toContain("finished");
    });
  });

  describe("collectPendingGates(文件系统扫描)", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = join(tmpdir(), `alloy-hook-pending-${Date.now()}`);
      await mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("无 openspec/changes/ -> []", () => {
      expect(collectPendingGates(tmpDir)).toEqual([]);
    });

    it("有 change + pending_gate -> [gate-id]", async () => {
      const changeDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, ".alloy.yaml"), "phase: started\npending_gate: confirm-main-branch\n", "utf-8");
      expect(collectPendingGates(tmpDir)).toEqual(["confirm-main-branch"]);
    });

    it("有 change + pending_gate: null -> []", async () => {
      const changeDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, ".alloy.yaml"), "phase: started\npending_gate: null\n", "utf-8");
      expect(collectPendingGates(tmpDir)).toEqual([]);
    });

    it("有 change 无 pending_gate 字段 -> []", async () => {
      const changeDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, ".alloy.yaml"), "phase: started\n", "utf-8");
      expect(collectPendingGates(tmpDir)).toEqual([]);
    });

    it("多个 change + 部分有 pending_gate -> [gate-id]", async () => {
      const fooDir = join(tmpDir, "openspec", "changes", "foo");
      const barDir = join(tmpDir, "openspec", "changes", "bar");
      await mkdir(fooDir, { recursive: true });
      await mkdir(barDir, { recursive: true });
      await writeFile(join(fooDir, ".alloy.yaml"), "phase: started\npending_gate: gate-a\n", "utf-8");
      await writeFile(join(barDir, ".alloy.yaml"), "phase: planning\n", "utf-8");
      expect(collectPendingGates(tmpDir)).toEqual(["gate-a"]);
    });
  });

  describe("clearAllPendingGates", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = join(tmpdir(), `alloy-hook-clear-${Date.now()}`);
      await mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("清所有 change 的 pending_gate", async () => {
      const fooDir = join(tmpDir, "openspec", "changes", "foo");
      const barDir = join(tmpDir, "openspec", "changes", "bar");
      await mkdir(fooDir, { recursive: true });
      await mkdir(barDir, { recursive: true });

      const fooState = createInitialState();
      fooState.pending_gate = "gate-a";
      fooState.phase = "started";
      await writeState(fooDir, fooState);

      const barState = createInitialState();
      barState.pending_gate = "gate-b";
      barState.phase = "planning";
      await writeState(barDir, barState);

      await clearAllPendingGates(tmpDir);

      expect(collectPendingGates(tmpDir)).toEqual([]);
    });

    it("无 change -> 不报错", async () => {
      await expect(clearAllPendingGates(tmpDir)).resolves.not.toThrow();
    });

    it("pending_gate 已 null -> 幂等", async () => {
      const fooDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(fooDir, { recursive: true });
      const fooState = createInitialState();
      fooState.phase = "started";
      await writeState(fooDir, fooState);

      await clearAllPendingGates(tmpDir);

      expect(collectPendingGates(tmpDir)).toEqual([]);
    });

    it("worktree 路径不存在时,只 clear 主仓(不报错)", async () => {
      const mainChangeDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(mainChangeDir, { recursive: true });
      const mainState = createInitialState();
      mainState.phase = "applying";
      mainState.worktree = ".worktrees/foo"; // worktree 路径不存在
      mainState.pending_gate = "apply:lock-verify";
      await writeState(mainChangeDir, mainState);

      await clearAllPendingGates(tmpDir);

      const mainAfter = await readState(mainChangeDir);
      expect(mainAfter.pending_gate).toBeNull();
    });

    // 注意:worktree 内 .alloy.yaml 兜底扫描的测试在 hook-guard.integration.test.ts
    // (用真实 git worktree 验证 listGitWorktrees 的 git worktree list 调用)
  });


  describe("worktree 路径拦截", () => {
    it("worktree 模式 + 相对路径写源码 -> 拦截 exit 2", () => {
      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: "scripts/hello.sh" },
      });
      const result = evaluateHook(stdin, ["applying"], {}, "/project", [], true, ["/project/.worktrees/foo"]);
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("worktree 绝对路径");
    });

    it("worktree 模式 + 相对路径写制品 -> 拦截 exit 2", () => {
      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: "openspec/changes/foo/verify.md" },
      });
      const result = evaluateHook(stdin, ["applying"], {}, "/project", [], true, ["/project/.worktrees/foo"]);
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("worktree 绝对路径");
    });

    it("worktree 模式 + worktree 绝对路径写源码 -> 放行", () => {
      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: "/project/.worktrees/foo/scripts/hello.sh" },
      });
      const result = evaluateHook(stdin, ["applying"], {}, "/project", [], true, ["/project/.worktrees/foo"]);
      expect(result.exitCode).toBe(0);
    });

    it("worktree 模式 + 主仓绝对路径写源码 -> 拦截", () => {
      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: "/project/scripts/hello.sh" },
      });
      const result = evaluateHook(stdin, ["applying"], {}, "/project", [], true, ["/project/.worktrees/foo"]);
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("worktree 绝对路径");
    });

    it("worktree 模式 + 写 .alloy.yaml(非制品) -> 放行(白名单)", () => {
      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: "openspec/changes/foo/.alloy.yaml" },
      });
      // .alloy.yaml 在白名单,不被 worktree 路径拦截(sourcePattern 排除 .alloy.yaml)
      const result = evaluateHook(stdin, ["applying"], {}, "/project", [], true, ["/project/.worktrees/foo"]);
      expect(result.exitCode).toBe(0);
    });

    it("无 worktree 模式 change + 相对路径写源码 -> 放行(apply 阶段)", () => {
      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: "scripts/hello.sh" },
      });
      const result = evaluateHook(stdin, ["applying"], {}, "/project", [], true, []);
      expect(result.exitCode).toBe(0);
    });

    it("worktree 模式 + ALLOY_FORCE_WRITE=1 -> 放行(逃生阀)", () => {
      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: "scripts/hello.sh" },
      });
      const result = evaluateHook(stdin, ["applying"], { ALLOY_FORCE_WRITE: "1" }, "/project", [], true, ["/project/.worktrees/foo"]);
      expect(result.exitCode).toBe(0);
    });

    it("collectWorktreePaths 收集 worktree 路径", async () => {
      const tmpDir = join(tmpdir(), `alloy-wt-paths-${Date.now()}`);
      const fooDir = join(tmpDir, "openspec", "changes", "foo");
      const barDir = join(tmpDir, "openspec", "changes", "bar");
      await mkdir(fooDir, { recursive: true });
      await mkdir(barDir, { recursive: true });

      const fooState = createInitialState();
      fooState.phase = "applying";
      fooState.worktree = "/tmp/.worktrees/foo" as any;
      await writeState(fooDir, fooState);

      const barState = createInitialState();
      barState.phase = "planning";
      barState.worktree = null;
      await writeState(barDir, barState);

      const paths = collectWorktreePaths(tmpDir);
      expect(paths).toContain("/tmp/.worktrees/foo");
      expect(paths).not.toContain(null as any);
      expect(paths.length).toBe(1);

      await rm(tmpDir, { recursive: true, force: true });
    });
  });
});
