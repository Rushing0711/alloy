// test/cli/internal/change.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { changeCommand } from "../../../src/cli/commands/internal/change.js";

// 读取 alloy 项目的 schema.yaml 用于测试环境搭建
const ALLOY_SCHEMA_PATH = join(process.cwd(), "openspec", "schemas", "alloy", "schema.yaml");

describe("alloy _change", () => {
  let tmpDir: string;
  let originalCwd: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let alloySchema: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-change-test-${Date.now()}`);
    originalCwd = process.cwd();

    // 读取 alloy schema(在 cwdSpy mock 前读)
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

    // 写 openspec 环境:config.yaml + schema.yaml
    await writeFile(join(tmpDir, "openspec", "config.yaml"), "schema: alloy\n", "utf-8");
    await writeFile(join(tmpDir, "openspec", "schemas", "alloy", "schema.yaml"), alloySchema, "utf-8");

    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("成功:创建 change + 生成 .openspec.yaml", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await changeCommand(["create", "test-feature"]);

      const changeDir = join(tmpDir, "openspec", "changes", "test-feature");
      expect(existsSync(changeDir)).toBe(true);
      expect(existsSync(join(changeDir, ".openspec.yaml"))).toBe(true);
      expect(logSpy.mock.calls.some(c => String(c[0]).includes("✓ change 已创建"))).toBe(true);
      logSpy.mockRestore();
    });

    it("目录已存在:PRECONDITION_FAIL exit 1", async () => {
      // 先创建目录
      await mkdir(join(tmpDir, "openspec", "changes", "existing"), { recursive: true });

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await changeCommand(["create", "existing"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errSpy.mock.calls.some(c => String(c[0]).includes("PRECONDITION_FAIL"))).toBe(true);
      expect(errSpy.mock.calls.some(c => String(c[0]).includes("已存在"))).toBe(true);
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("缺少 name:exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await changeCommand(["create"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("幂等:重复创建同名 change 失败(目录冲突)", async () => {
      // 第一次创建成功
      await changeCommand(["create", "idempotent-test"]);

      // 第二次创建应失败(目录已存在)
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await changeCommand(["create", "idempotent-test"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errSpy.mock.calls.some(c => String(c[0]).includes("PRECONDITION_FAIL"))).toBe(true);
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });
  });

  it("无子命令:exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await changeCommand([]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("未知子命令:exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await changeCommand(["unknown"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});
