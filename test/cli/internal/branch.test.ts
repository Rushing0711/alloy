// test/cli/internal/branch.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { branchCommand } from "../../../src/cli/commands/internal/branch.js";

describe("alloy _branch", () => {
  let tmpDir: string;
  let originalCwd: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-branch-test-${Date.now()}`);
    originalCwd = process.cwd();
    await mkdir(tmpDir, { recursive: true });
    await mkdir(join(tmpDir, "openspec"), { recursive: true });

    execSync("git init -q", { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.name "test-user"', { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });

    // 创建 main 分支 + 初始 commit
    try { execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" }); } catch { /* 已是 main */ }
    await writeFile(join(tmpDir, "README.md"), "# test", "utf-8");
    execSync("git add README.md", { cwd: tmpDir, stdio: "pipe" });
    execSync('git commit -q -m "init"', { cwd: tmpDir, stdio: "pipe" });

    // 写 openspec/config.yaml 配置 main_branch
    await writeFile(
      join(tmpDir, "openspec", "config.yaml"),
      "schema: alloy\nalloy:\n  main_branch: main\n  target_agents: [claude-code]\n",
      "utf-8"
    );

    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function currentBranch(): string {
    return execSync("git rev-parse --abbrev-ref HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();
  }

  describe("context", () => {
    it("成功:输出 JSON 含 main_branch 和 current_branch", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await branchCommand(["context"]);

      const json = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(json.main_branch).toBe("main");
      expect(json.current_branch).toBe("main");
      logSpy.mockRestore();
    });

    it("main_branch 未配置:PRECONDITION_FAIL exit 1", async () => {
      // 覆盖 config.yaml,去掉 main_branch
      await writeFile(
        join(tmpDir, "openspec", "config.yaml"),
        "schema: alloy\nalloy: {}\n",
        "utf-8"
      );

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await branchCommand(["context"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errSpy.mock.calls.some(c => String(c[0]).includes("PRECONDITION_FAIL"))).toBe(true);
      expect(errSpy.mock.calls.some(c => String(c[0]).includes("main_branch"))).toBe(true);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("多余参数:exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await branchCommand(["context", "extra"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });
  });

  describe("create", () => {
    it("成功:从 main 创建 feature 分支并验证", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await branchCommand(["create", "--feature", "feature/test-change", "--main", "main"]);

      expect(currentBranch()).toBe("feature/test-change");
      expect(logSpy.mock.calls.some(c => String(c[0]).includes("✓ 分支已创建并验证"))).toBe(true);
      logSpy.mockRestore();
    });

    it("feature = main:PRECONDITION_FAIL exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await branchCommand(["create", "--feature", "main", "--main", "main"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errSpy.mock.calls.some(c => String(c[0]).includes("feature 分支不能等于主分支"))).toBe(true);
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("缺少 --feature:exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await branchCommand(["create", "--main", "main"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("分支已存在:[FAIL] exit 1,不自动 reset", async () => {
      // 先创建 feature/duplicate
      execSync("git checkout -b feature/duplicate main", { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout main", { cwd: tmpDir, stdio: "pipe" });

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await branchCommand(["create", "--feature", "feature/duplicate", "--main", "main"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errSpy.mock.calls.some(c => String(c[0]).includes("[FAIL]"))).toBe(true);
      // 仍在 main,未被 reset
      expect(currentBranch()).toBe("main");
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });
  });

  it("无子命令:exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await branchCommand([]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("未知子命令:exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await branchCommand(["unknown"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});
