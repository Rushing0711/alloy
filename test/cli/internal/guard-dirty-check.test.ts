// test/cli/internal/guard-dirty-check.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { guardCommand } from "../../../src/cli/commands/internal/guard.js";

describe("alloy _guard dirty-check", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-dirty-check-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });

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

  it("clean -> 输出 ✓ 工作目录 clean", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await guardCommand(["dirty-check", tmpDir]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("工作目录 clean"));
    logSpy.mockRestore();
  });

  it("dirty(modified)-> exit 1 + 输出 dirty 文件", async () => {
    await writeFile(join(tmpDir, "README.md"), "modified", "utf-8");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await guardCommand(["dirty-check", tmpDir]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errOutput = errSpy.mock.calls.map(c => String(c[0])).join("\n");
    expect(errOutput).toContain("未提交变更");
    expect(errOutput).toContain("README.md");

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("dirty(untracked)-> exit 1 + 输出 dirty 文件", async () => {
    await writeFile(join(tmpDir, "new-file.txt"), "new", "utf-8");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await guardCommand(["dirty-check", tmpDir]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errOutput = errSpy.mock.calls.map(c => String(c[0])).join("\n");
    expect(errOutput).toContain("new-file.txt");

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("缺参数时用 process.cwd()", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["dirty-check"]);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("工作目录 clean"));
    logSpy.mockRestore();
  });
});
