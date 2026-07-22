// test/cli/internal/chore-commit.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { choreCommitCommand } from "../../../src/cli/commands/internal/chore-commit.js";

describe("alloy _chore-commit", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-chore-test-${Date.now()}`);
    changeDir = join(tmpDir, "openspec", "changes", "test-change");
    await mkdir(changeDir, { recursive: true });

    execSync("git init -b main", { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.name "test-user"', { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });

    // 初始 commit
    await writeFile(join(tmpDir, "README.md"), "init", "utf-8");
    execSync("git add README.md && git commit -m 'chore: init'", { cwd: tmpDir, stdio: "pipe" });

    // .alloy.yaml + tasks.md
    await writeFile(join(changeDir, ".alloy.yaml"), "phase: applied\n", "utf-8");
    await writeFile(join(changeDir, "tasks.md"), "- [ ] T1\n", "utf-8");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("缺 --msg 时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await choreCommitCommand([changeDir, "--paths", "openspec/changes/test-change/.alloy.yaml"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("缺 --paths 时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await choreCommitCommand([changeDir, "--msg", "test"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("change 目录不存在时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await choreCommitCommand([join(tmpDir, "nonexistent"), "--msg", "test", "--paths", "x"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("正常 commit(有 staged 改动)", async () => {
    await writeFile(join(changeDir, ".alloy.yaml"), "phase: applied\nupdated_at: now\n", "utf-8");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await choreCommitCommand([
      changeDir,
      "--msg", "chore: update state",
      "--paths", "openspec/changes/test-change/.alloy.yaml",
      "--cwd", tmpDir,
    ]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("chore-commit 完成"));
    logSpy.mockRestore();

    const log = execSync("git log --oneline -1", { cwd: tmpDir, encoding: "utf-8", stdio: "pipe" }).trim();
    expect(log).toContain("chore: update state");
  });

  it("幂等(无 staged 改动跳过 commit)", async () => {
    await writeFile(join(changeDir, ".alloy.yaml"), "phase: applied\nupdated_at: v1\n", "utf-8");
    await choreCommitCommand([
      changeDir,
      "--msg", "chore: v1",
      "--paths", "openspec/changes/test-change/.alloy.yaml",
      "--cwd", tmpDir,
    ]);

    // 再调一次(无新改动)
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await choreCommitCommand([
      changeDir,
      "--msg", "chore: v1",
      "--paths", "openspec/changes/test-change/.alloy.yaml",
      "--cwd", tmpDir,
    ]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("无 staged 改动"));
    logSpy.mockRestore();

    // 验证只有 1 个 chore: v1 commit
    const log = execSync("git log --oneline --grep='chore: v1'", { cwd: tmpDir, encoding: "utf-8", stdio: "pipe" }).trim();
    const lines = log.split("\n").filter(Boolean);
    expect(lines.length).toBe(1);
  });

  it("多行 commit message", async () => {
    await writeFile(join(changeDir, ".alloy.yaml"), "phase: applied\nupdated_at: multiline\n", "utf-8");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await choreCommitCommand([
      changeDir,
      "--msg", "chore: multiline\n\nbody line 1\nbody line 2",
      "--paths", "openspec/changes/test-change/.alloy.yaml",
      "--cwd", tmpDir,
    ]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("chore-commit 完成"));
    logSpy.mockRestore();

    const log = execSync("git log -1 --format=%B", { cwd: tmpDir, encoding: "utf-8", stdio: "pipe" }).trim();
    expect(log).toContain("body line 1");
    expect(log).toContain("body line 2");
  });

  it("多路径 --paths(逗号分隔)", async () => {
    await writeFile(join(changeDir, ".alloy.yaml"), "phase: applied\n", "utf-8");
    await writeFile(join(changeDir, "tasks.md"), "- [x] T1\n", "utf-8");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await choreCommitCommand([
      changeDir,
      "--msg", "chore: multi-path",
      "--paths", "openspec/changes/test-change/.alloy.yaml,openspec/changes/test-change/tasks.md",
      "--cwd", tmpDir,
    ]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("chore-commit 完成"));
    logSpy.mockRestore();

    const show = execSync("git show --stat HEAD --format=%H", { cwd: tmpDir, encoding: "utf-8", stdio: "pipe" });
    expect(show).toContain(".alloy.yaml");
    expect(show).toContain("tasks.md");
  });
});
