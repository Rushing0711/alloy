// test/cli/internal/infra-commit.test.ts
// CLI 层测试:验证 infraCommitCommand 的参数解析 + 错误处理。
// core 层 executeInfraCommit 业务逻辑由 test/core/infra-commit.test.ts 覆盖。
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { infraCommitCommand } from "../../../src/cli/commands/internal/infra-commit.js";

describe("alloy _infra-commit (CLI 层)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-infra-cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(tmpDir, { recursive: true });
    execSync("git init -q", { cwd: tmpDir });
    execSync('git config user.name "test"', { cwd: tmpDir });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir });
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("openspec/config.yaml 未配置 target_agents -> exit 1 + PRECONDITION_FAIL", async () => {
    // 创建空的 openspec/config.yaml(无 target_agents)
    await mkdir(join(tmpDir, "openspec"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "config.yaml"), "schema: alloy\n", "utf-8");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await infraCommitCommand([]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errOutput = errSpy.mock.calls.map(c => String(c[0])).join("\n");
    expect(errOutput).toContain("PRECONDITION_FAIL");
    expect(errOutput).toContain("target_agents");

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("openspec/config.yaml 不存在 -> exit 1(readProjectConfig 失败)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await infraCommitCommand([]);

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("--message 覆盖默认值", async () => {
    // 配置 target_agents
    await mkdir(join(tmpDir, "openspec"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "config.yaml"),
      "schema: alloy\nalloy:\n  target_agents:\n    - claude-code\n",
      "utf-8");

    // 创建 .claude/ 目录(让 executeInfraCommit 有内容可 commit)
    await mkdir(join(tmpDir, ".claude"), { recursive: true });
    await writeFile(join(tmpDir, ".claude", "settings.json"), "{}", "utf-8");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await infraCommitCommand(["--message", "custom: test message"]);

    // 验证 commit message 被覆盖
    const log = execSync("git log --oneline -1", { cwd: tmpDir, encoding: "utf-8", stdio: "pipe" }).trim();
    expect(log).toContain("custom: test message");

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("默认 message(chore: 提交 alloy 基础设施文件)", async () => {
    await mkdir(join(tmpDir, "openspec"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "config.yaml"),
      "schema: alloy\nalloy:\n  target_agents:\n    - claude-code\n",
      "utf-8");

    await mkdir(join(tmpDir, ".claude"), { recursive: true });
    await writeFile(join(tmpDir, ".claude", "settings.json"), "{}", "utf-8");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await infraCommitCommand([]);

    const log = execSync("git log --oneline -1", { cwd: tmpDir, encoding: "utf-8", stdio: "pipe" }).trim();
    expect(log).toContain("chore: 提交 alloy 基础设施文件");

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });
});
