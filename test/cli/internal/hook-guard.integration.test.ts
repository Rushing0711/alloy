// test/cli/internal/hook-guard.integration.test.ts
//
// 集成测试:用真实 git worktree 验证 hook-guard 的 worktree 兜底扫描。
// 场景:OpenCode hook-guard 在主仓执行(cwd=主仓),主仓 .alloy.yaml 的 worktree 字段为 null
// (worktree state 只在 worktree 分支写),依赖主仓 worktree 字段定位会漏扫 worktree 内 .alloy.yaml。
// 修复:listGitWorktrees 用 `git worktree list` 兜底扫描所有 worktree。
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// 不 mock execSync -- 用真实 git worktree 验证 listGitWorktrees 的 git worktree list 调用
import {
  collectPhases,
  collectPendingGates,
  collectWorktreePaths,
  clearAllPendingGates,
} from "../../../src/cli/commands/internal/hook-guard.js";
import { writeState, createInitialState, readState } from "../../../src/cli/utils/state.js";

const GIT_ENV = {
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@test.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@test.com",
};

function git(cmd: string, cwd: string): string {
  return execSync(cmd, {
    encoding: "utf-8",
    stdio: "pipe",
    cwd,
    env: { ...process.env, ...GIT_ENV },
  }).trim();
}

describe("alloy _hook-guard worktree 兜底扫描(真实 git worktree)", () => {
  let tmpDir: string;
  let worktreePath: string;
  let mainChangeDir: string;
  let worktreeChangeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-hook-guard-wt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });

    // 初始化 git 仓库 + feature 分支
    git("git init -q", tmpDir);
    git("git checkout -q -b feature/test", tmpDir);

    // 主仓 change 目录 + .alloy.yaml(worktree=null,模拟 OpenCode 场景)
    // 关键:主仓 .alloy.yaml 的 worktree 字段为 null(worktree state 只在 worktree 分支写)
    mainChangeDir = join(tmpDir, "openspec", "changes", "test");
    await mkdir(mainChangeDir, { recursive: true });
    const mainState = createInitialState();
    mainState.phase = "plan-completed";
    mainState.worktree = null;
    mainState.pending_gate = null;
    await writeState(mainChangeDir, mainState);
    git("git add -A", tmpDir);
    git('git commit -q -m "init: plan 完成,主仓 worktree=null"', tmpDir);

    // 创建真实 git worktree(基于 feature/test HEAD)
    worktreePath = join(tmpDir, ".worktrees", "test");
    git(`git worktree add -q -b worktree-test "${worktreePath}"`, tmpDir);

    // worktree 内 change 目录 + .alloy.yaml(worktree 字段有值 + pending_gate)
    // 模拟 OpenCode agent 在 worktree 内 require user-gate 后的状态
    worktreeChangeDir = join(worktreePath, "openspec", "changes", "test");
    await mkdir(worktreeChangeDir, { recursive: true });
    const worktreeState = createInitialState();
    worktreeState.phase = "applying";
    worktreeState.worktree = ".worktrees/test";
    worktreeState.worktree_branch = "worktree-test";
    worktreeState.pending_gate = "apply:lock-retrospective";
    await writeState(worktreeChangeDir, worktreeState);
    git("git add -A", worktreePath);
    git('git commit -q -m "worktree 内: phase applying + pending_gate"', worktreePath);

    // 验证前置条件:主仓 .alloy.yaml 的 worktree 字段为 null(模拟 OpenCode 场景)
    const mainStateCheck = await readState(mainChangeDir);
    expect(mainStateCheck.worktree).toBeNull();
    // worktree 内 .alloy.yaml 的 worktree 字段有值
    const worktreeStateCheck = await readState(worktreeChangeDir);
    expect(worktreeStateCheck.worktree).toBe(".worktrees/test");
    expect(worktreeStateCheck.pending_gate).toBe("apply:lock-retrospective");
  });

  afterEach(async () => {
    try {
      git(`git worktree remove --force "${worktreePath}" 2>/dev/null || true`, tmpDir);
    } catch {
      // 忽略
    }
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("clearAllPendingGates:主仓 worktree=null 时,git worktree list 兜底扫描 worktree 内 pending_gate", async () => {
    // 调用 clearAllPendingGates(主仓)
    // 修复前:只扫主仓,worktree 内 pending_gate 不被 clear
    // 修复后:git worktree list 兜底扫描,worktree 内 pending_gate 被 clear
    await clearAllPendingGates(tmpDir);

    // 验证 worktree 内 pending_gate 被 clear(关键:不漏 worktree)
    const worktreeAfter = await readState(worktreeChangeDir);
    expect(worktreeAfter.pending_gate).toBeNull();
    // 验证 gate_history 已更新(cleared gate 加入)
    expect(worktreeAfter.gate_history).toContain("apply:lock-retrospective");
    // 验证 .alloy.yaml 有工作区改动(clear 不再 commit,改动留在工作区,随下一次 _artifact commit 落地)
    const status = git("git status --porcelain", worktreePath);
    expect(status).toContain(".alloy.yaml");
  });

  it("collectPendingGates:主仓 worktree=null 时,git worktree list 兜底收集 worktree 内 pending_gate", () => {
    // 修复前:只扫主仓,返回 [](主仓 pending_gate=null)
    // 修复后:git worktree list 兜底扫描,返回 ["apply:lock-retrospective"]
    const gates = collectPendingGates(tmpDir);
    expect(gates).toContain("apply:lock-retrospective");
  });

  it("collectPhases:主仓 phase=plan-completed 时,git worktree list 兜底收集 worktree 内 phase=applying", () => {
    // 修复前:只扫主仓,返回 ["plan-completed"](主仓 phase)
    // 修复后:git worktree list 兜底扫描,返回含 "applying"(worktree 内 phase)
    const phases = collectPhases(tmpDir);
    expect(phases).toContain("applying");
    expect(phases).toContain("plan-completed");
  });

  it("collectWorktreePaths:主仓 worktree=null 时,git worktree list 兜底收集 worktree 内 worktree 路径", () => {
    // 修复前:只扫主仓,返回 [](主仓 worktree=null)
    // 修复后:git worktree list 兜底扫描,返回 worktree 内 worktree 字段
    //         collectWorktreePaths 把相对路径 ".worktrees/test" 归一化为绝对路径
    //         (tmpDir/.worktrees/test),否则 line 311 startsWith 匹配失败,误拦所有 Write/Edit
    const paths = collectWorktreePaths(tmpDir);
    expect(paths).toContain(worktreePath);
  });

  it("非 git 仓库:git worktree list 失败时,退化为只扫主仓(不报错)", async () => {
    // 创建非 git 仓库的临时目录
    const nonGitDir = join(tmpdir(), `alloy-hook-guard-nongit-${Date.now()}`);
    await mkdir(nonGitDir, { recursive: true });
    const changeDir = join(nonGitDir, "openspec", "changes", "foo");
    await mkdir(changeDir, { recursive: true });
    const state = createInitialState();
    state.phase = "started";
    state.pending_gate = "start:lock-draft";
    await writeState(changeDir, state);

    try {
      // git worktree list 失败 -> listGitWorktrees 返回 [nonGitDir] -> 只扫主仓
      const gates = collectPendingGates(nonGitDir);
      expect(gates).toEqual(["start:lock-draft"]);

      await clearAllPendingGates(nonGitDir);
      const after = await readState(changeDir);
      expect(after.pending_gate).toBeNull();
    } finally {
      await rm(nonGitDir, { recursive: true, force: true });
    }
  });
});
