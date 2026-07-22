// test/cli/internal/guard-main-clean.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { guardCommand } from "../../../src/cli/commands/internal/guard.js";

describe("alloy _guard main-clean", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-main-clean-test-${Date.now()}`);
    changeDir = join(tmpDir, "openspec", "changes", "test-change");
    await mkdir(changeDir, { recursive: true });

    execSync("git init -b main", { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.name "test"', { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });

    await writeFile(join(tmpDir, "README.md"), "init", "utf-8");
    execSync("git add README.md && git commit -m 'init'", { cwd: tmpDir, stdio: "pipe" });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("缺参数 -> exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await guardCommand(["main-clean"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("worktree=skipped -> 输出 skipped", async () => {
    await writeFile(join(changeDir, ".alloy.yaml"),
      "phase: applied\nworktree: skipped\nschema_version: 1\nupdated_at: \"2020-01-01T00:00:00\"\n",
      "utf-8");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await guardCommand(["main-clean", changeDir]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("skipped"));
    logSpy.mockRestore();
  });

  it("worktree=null -> 输出 skipped", async () => {
    await writeFile(join(changeDir, ".alloy.yaml"),
      "phase: applied\nworktree: null\nschema_version: 1\nupdated_at: \"2020-01-01T00:00:00\"\n",
      "utf-8");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await guardCommand(["main-clean", changeDir]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("skipped"));
    logSpy.mockRestore();
  });

  it("worktree 模式 + 主仓 clean -> 输出 ✓ 主仓 clean", async () => {
    await writeFile(join(changeDir, ".alloy.yaml"),
      "phase: applied\nworktree: \"/path/to/worktree\"\nschema_version: 1\nupdated_at: \"2020-01-01T00:00:00\"\n",
      "utf-8");
    // commit openspec/(模拟 alloy init 已 commit,避免 untracked 干扰)
    execSync("git add openspec/ && git commit -m 'chore: init openspec'", { cwd: tmpDir, stdio: "pipe" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await guardCommand(["main-clean", changeDir]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("主仓 clean"));
    logSpy.mockRestore();
  });

  it("worktree 模式 + 主仓 dirty -> exit 1 + 输出 dirty 文件", async () => {
    await writeFile(join(changeDir, ".alloy.yaml"),
      "phase: applied\nworktree: \"/path/to/worktree\"\nschema_version: 1\nupdated_at: \"2020-01-01T00:00:00\"\n",
      "utf-8");
    // 制造 dirty:修改 README.md
    await writeFile(join(tmpDir, "README.md"), "modified", "utf-8");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await guardCommand(["main-clean", changeDir]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("主仓工作目录有未提交变更"));
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});
