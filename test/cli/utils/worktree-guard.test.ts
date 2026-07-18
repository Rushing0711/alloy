// test/cli/utils/worktree-guard.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { assertInWorktree } from "../../../src/cli/utils/worktree-guard.js";

describe("assertInWorktree", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-wt-guard-test-${Date.now()}`);
    changeDir = join(tmpDir, "openspec", "changes", "test-change");
    await mkdir(changeDir, { recursive: true });

    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.name "test-user"', { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });
  });

  afterEach(async () => {
    process.chdir("/Users/wenqiu/AIAgent/alloy");
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("非 worktree 模式(worktree=null):放行,不 exit", async () => {
    const yaml = [
      "phase: planning",
      "schema_version: 1",
      "worktree: null",
      'created_at: "2020-01-01 00:00:00"',
      'updated_at: "2020-01-01 00:00:00"',
      "records: []",
      "skill_usage: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");

    process.chdir(tmpDir);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await assertInWorktree(changeDir);

    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("非 worktree 模式(worktree=skipped):放行", async () => {
    const yaml = [
      "phase: applying",
      "schema_version: 1",
      "worktree: skipped",
      'created_at: "2020-01-01 00:00:00"',
      'updated_at: "2020-01-01 00:00:00"',
      "records: []",
      "skill_usage: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");

    process.chdir(tmpDir);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await assertInWorktree(changeDir);

    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("worktree 模式 + 当前在主仓:exit 1", async () => {
    const worktreePath = join(tmpDir, ".worktrees", "test-change");
    const yaml = [
      "phase: applying",
      "schema_version: 1",
      `worktree: "${worktreePath}"`,
      'created_at: "2020-01-01 00:00:00"',
      'updated_at: "2020-01-01 00:00:00"',
      "records: []",
      "skill_usage: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");

    // 当前 cwd 是主仓(tmpDir),不是 worktree
    process.chdir(tmpDir);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await assertInWorktree(changeDir);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("worktree 模式下"))).toBe(true);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("cd"))).toBe(true);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("worktree 模式 + 当前在 worktree 内:放行", async () => {
    // 创建真实 worktree
    execSync("git commit --allow-empty -m init", { cwd: tmpDir, stdio: "pipe" });
    const worktreePath = join(tmpDir, ".worktrees", "test-change");
    execSync(`git worktree add "${worktreePath}" -b worktree-test-change`, { cwd: tmpDir, stdio: "pipe" });

    // 在 worktree 内创建 change 目录 + .alloy.yaml
    const worktreeChangeDir = join(worktreePath, "openspec", "changes", "test-change");
    await mkdir(worktreeChangeDir, { recursive: true });
    const yaml = [
      "phase: applying",
      "schema_version: 1",
      `worktree: "${worktreePath}"`,
      'created_at: "2020-01-01 00:00:00"',
      'updated_at: "2020-01-01 00:00:00"',
      "records: []",
      "skill_usage: []",
    ].join("\n");
    await writeFile(join(worktreeChangeDir, ".alloy.yaml"), yaml, "utf-8");

    // 当前 cwd 是 worktree
    process.chdir(worktreePath);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await assertInWorktree(worktreeChangeDir);

    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("ALLOY_FORCE_WORKTREE=1 逃生阀:worktree 模式 + 主仓也放行", async () => {
    const worktreePath = join(tmpDir, ".worktrees", "test-change");
    const yaml = [
      "phase: applying",
      "schema_version: 1",
      `worktree: "${worktreePath}"`,
      'created_at: "2020-01-01 00:00:00"',
      'updated_at: "2020-01-01 00:00:00"',
      "records: []",
      "skill_usage: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");

    process.chdir(tmpDir);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const prev = process.env.ALLOY_FORCE_WORKTREE;
    process.env.ALLOY_FORCE_WORKTREE = "1";
    try {
      await assertInWorktree(changeDir);
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.ALLOY_FORCE_WORKTREE;
      else process.env.ALLOY_FORCE_WORKTREE = prev;
      exitSpy.mockRestore();
    }
  });

  it("盲区补救:主仓 state worktree=null 但 git worktree list 有 worktree-<change> 分支 -> 拦截 exit 1", async () => {
    // 模拟真实场景:agent 在 worktree 内 _state write worktree 字段后,worktree state 只 commit 到 worktree 分支
    // 主仓 feature 分支 .alloy.yaml worktree=null(被 _state write 守卫拦截)
    // agent 回主仓执行 user-gate require,assertInWorktree 应通过 git worktree list 检测到 worktree 模式
    const worktreePath = join(tmpDir, ".worktrees", "test-change");
    // 主仓 state worktree=null(模拟主仓没同步 worktree 分支的 state)
    const mainYaml = [
      "phase: applying",
      "schema_version: 1",
      "worktree: null",
      'created_at: "2020-01-01 00:00:00"',
      'updated_at: "2020-01-01 00:00:00"',
      "records: []",
      "skill_usage: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), mainYaml, "utf-8");

    // 创建初始 commit + worktree(让 git worktree list 能检测到 worktree-test-change 分支)
    execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
    execSync('git commit -m "init"', { cwd: tmpDir, stdio: "pipe" });
    execSync(`git worktree add "${worktreePath}" -b worktree-test-change`, { cwd: tmpDir, stdio: "pipe" });

    // 在主仓执行(cwd=tmpDir,不是 worktree 内)
    process.chdir(tmpDir);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await assertInWorktree(changeDir);

    // 应该 exit 1(检测到 worktree 模式但当前在主仓)
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy.mock.calls.flat().join(" ")).toContain("worktree-test-change");
    exitSpy.mockRestore();
    errSpy.mockRestore();

    // 清理 worktree
    try {
      execSync(`git worktree remove --force "${worktreePath}"`, { cwd: tmpDir, stdio: "pipe" });
      execSync("git branch -D worktree-test-change", { cwd: tmpDir, stdio: "pipe" });
    } catch {
      // 忽略清理失败
    }
  });
});
