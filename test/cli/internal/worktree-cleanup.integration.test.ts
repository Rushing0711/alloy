// test/cli/internal/worktree-cleanup.integration.test.ts
//
// 集成测试:用真实 git 仓库验证 worktree-cleanup 的 merge 前置检查逻辑。
// 不 mock execSync/state.js,覆盖 mock 测试漏掉的"命令本身有效性"问题
// (曾因 `git status --porcelain --name-only` 无效选项导致 dirtyFiles 恒为空,
// 自动 commit 逻辑被静默跳过,merge 因工作目录不干净失败)。
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// 不 mock execSync/state.js -- 用真实 git 仓库验证命令有效性
import { worktreeCleanupCommand } from "../../../src/cli/commands/internal/worktree-cleanup.js";

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

describe("alloy _worktree-cleanup 集成测试(真实 git 仓库)", () => {
  let tmpDir: string;
  let worktreePath: string;
  let changeDirAbs: string;
  const CHANGE_DIR = "openspec/changes/test";

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-wt-cleanup-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });

    // 初始化 git 仓库
    git("git init -q", tmpDir);

    // 创建 feature 分支
    git("git checkout -q -b feature/test", tmpDir);

    // 创建 .alloy.yaml(apply 阶段 EnterWorktree 前 commit 的状态)
    changeDirAbs = join(tmpDir, "openspec/changes/test");
    await mkdir(changeDirAbs, { recursive: true });
    await writeFile(
      join(changeDirAbs, ".alloy.yaml"),
      [
        "phase: applying",
        "worktree: null",
        "feature_branch: feature/test",
        "worktree_branch: null",
        "pending_gate: null",
        'updated_at: "2026-07-14 10:00:00"',
        "",
      ].join("\n"),
      "utf-8"
    );
    git("git add -A", tmpDir);
    git('git commit -q -m "init: apply 阶段开始前状态"', tmpDir);

    // 创建真正的 git worktree,新建 worktree-test 分支(从 feature/test HEAD)
    // 用 -b 在 worktree 创建时新建分支,避免主仓已 checkout worktree-test 导致冲突
    worktreePath = join(tmpDir, ".worktrees/test");
    git(`git worktree add -q -b worktree-test "${worktreePath}"`, tmpDir);

    // 在 worktree 目录内修改 .alloy.yaml,commit 到 worktree-test 分支
    await writeFile(
      join(worktreePath, "openspec/changes/test/.alloy.yaml"),
      [
        "phase: applied",
        `worktree: ${worktreePath}`,
        "feature_branch: feature/test",
        "worktree_branch: worktree-test",
        "pending_gate: null",
        'worktree_created_at: "2026-07-14 10:30:00"',
        'updated_at: "2026-07-14 11:30:00"',
        "",
      ].join("\n"),
      "utf-8"
    );
    git("git add -A", worktreePath);
    git('git commit -q -m "worktree 内: phase applied"', worktreePath);

    // 主仓当前在 feature/test 分支
    // 模拟 archive 阶段 user-gate require + clear 在 feature 分支留下未 commit 修改
    // (pending_gate 从值改为 null + updated_at 变化,writeState 不 commit)
    await writeFile(
      join(changeDirAbs, ".alloy.yaml"),
      [
        "phase: applying",
        "worktree: null",
        "feature_branch: feature/test",
        "worktree_branch: null",
        "pending_gate: null",
        'updated_at: "2026-07-14 12:00:00"',
        "",
      ].join("\n"),
      "utf-8"
    );
  });

  afterEach(async () => {
    // 清理 worktree(如果还存在)
    try {
      git(`git worktree remove --force "${worktreePath}" 2>/dev/null || true`, tmpDir);
    } catch {
      // 忽略
    }
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("feature 分支有 .alloy.yaml 未 commit -> 自动 commit 后 merge 成功(真实 git)", async () => {
    // 前置验证:merge 前工作目录确实有 .alloy.yaml 未 commit 修改
    const dirtyBefore = git("git diff --name-only HEAD", tmpDir);
    expect(dirtyBefore).toContain(".alloy.yaml");

    // 调用 worktreeCleanupCommand(需要 chdir 到 tmpDir,因为 gitExec 用 process.cwd())
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      await worktreeCleanupCommand([CHANGE_DIR]);
    } finally {
      process.chdir(originalCwd);
    }

    // 验证 1:worktree 分支已删除(git branch -d 成功)
    const branchList = git("git branch --list", tmpDir);
    expect(branchList).not.toContain("worktree-test");

    // 验证 2:worktree 目录已删除(git worktree remove 成功)
    expect(existsSync(worktreePath)).toBe(false);

    // 验证 3:feature 分支 HEAD 包含 worktree 分支的修改(phase: applied)
    // merge 后 .alloy.yaml 应该是 worktree 分支的版本(worktree 内 commit 的)
    const mergedContent = git("git show HEAD:openspec/changes/test/.alloy.yaml", tmpDir);
    expect(mergedContent).toContain("phase: applied");
    expect(mergedContent).toContain(`worktree: ${worktreePath}`);

    // 验证 4:worktree_merged_at 已记录(merge 后 writeState + commit)
    expect(mergedContent).toMatch(/worktree_merged_at:/);
  });

  it("L145 命令有效性验证:git diff --name-only HEAD 能正确检测 .alloy.yaml 未 commit", async () => {
    // 这个测试验证修复后的命令本身有效(不依赖 worktreeCleanupCommand)
    // 回归保护:防止未来再改成无效命令(如 git status --porcelain --name-only)

    // 场景 1:有 .alloy.yaml 未 commit 修改
    const dirty1 = git("git diff --name-only HEAD", tmpDir);
    expect(dirty1).toBe("openspec/changes/test/.alloy.yaml");

    // 场景 2:commit 后工作目录 clean
    git("git add -A", tmpDir);
    git('git commit -q -m "commit .alloy.yaml"', tmpDir);
    const dirty2 = git("git diff --name-only HEAD", tmpDir);
    expect(dirty2).toBe("");

    // 场景 3:新增非 .alloy.yaml 的 staged 修改(git add 后与 HEAD 不同)
    await mkdir(join(tmpDir, "src"), { recursive: true });
    await writeFile(join(tmpDir, "src/foo.ts"), "export const foo = 1;\n", "utf-8");
    git("git add src/foo.ts", tmpDir);
    const dirty3 = git("git diff --name-only HEAD", tmpDir);
    expect(dirty3).toBe("src/foo.ts");
  });
});
