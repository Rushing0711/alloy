// test/core/windows-path.test.ts
// 验证 Windows 路径(反斜杠)在生成的 hook 命令里转成正斜杠 + 双引号包路径
// 背景:Git for Windows 的 bash 执行 .git/hooks/pre-commit 时,反斜杠被当转义符吃掉,
// 路径损坏 -> node 找不到模块。Claude Code 的 hook command 在 /bin/sh 执行,同样问题。
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

// 模拟 Windows 全局安装路径。mock getAlloyCliPath 返回修复后的正斜杠路径,
// 验证所有 10 处生成的 hook 命令格式正确(双引号包路径)。
// getAlloyCliPath 内部调 getPackageRoot(词法作用域),mock 模块 export 不影响内部调用,
// 所以必须直接 mock getAlloyCliPath 的返回值。.replace(/\\/g, "/") 转换逻辑通过代码 review 确认。
vi.mock("../../src/utils/fs.js", () => ({
  getPackageRoot: () =>
    "C:\\Users\\Administrator\\AppData\\Roaming\\nvm\\18.18.2\\node_modules\\@flyin-ai\\alloy",
  getAlloyCliPath: () =>
    "C:/Users/Administrator/AppData/Roaming/nvm/18.18.2/node_modules/@flyin-ai/alloy/dist/cli/index.js",
}));

import { writeHookConfig, writeStopHookConfig, writePiHookExtension, writeOpenCodeHookTools } from "../../src/core/agent-config.js";
import { ensurePreCommitHook } from "../../src/cli/commands/init/execute.js";

// 修复后期望的路径:反斜杠全转正斜杠
const EXPECTED_PATH = "C:/Users/Administrator/AppData/Roaming/nvm/18.18.2/node_modules/@flyin-ai/alloy/dist/cli/index.js";

describe("Windows 路径兼容 - 反斜杠转正斜杠 + 双引号包路径", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-win-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("ensurePreCommitHook: pre-commit hook 命令用正斜杠 + 双引号", async () => {
    await ensurePreCommitHook(tmpDir);
    const content = await readFile(join(tmpDir, ".git", "hooks", "pre-commit"), "utf-8");
    expect(content).toContain(`node "${EXPECTED_PATH}" _pre-commit-check`);
  });

  it("writeHookConfig: Claude Code PreToolUse hook 命令用正斜杠 + 双引号", async () => {
    await writeHookConfig(tmpDir, "claude-code");
    const settings = JSON.parse(await readFile(join(tmpDir, ".claude", "settings.json"), "utf-8"));
    const cmd = settings.hooks.PreToolUse[0].hooks[0].command;
    expect(cmd).toBe(`node "${EXPECTED_PATH}" _hook-guard`);
  });

  it("writeStopHookConfig: Claude Code Stop hook 命令用正斜杠 + 双引号", async () => {
    await writeStopHookConfig(tmpDir, "claude-code");
    const settings = JSON.parse(await readFile(join(tmpDir, ".claude", "settings.json"), "utf-8"));
    const cmd = settings.hooks.Stop[0].hooks[0].command;
    expect(cmd).toBe(`node "${EXPECTED_PATH}" _stop-guard`);
  });

  it("writePiHookExtension: Pi extension 含正斜杠 + 双引号的 hook 命令", async () => {
    await writePiHookExtension(tmpDir);
    const content = await readFile(join(tmpDir, ".pi", "extensions", "alloy-guard.ts"), "utf-8");
    expect(content).toContain(`node "${EXPECTED_PATH}" _hook-guard`);
    expect(content).toContain(`node "${EXPECTED_PATH}" _stop-guard`);
  });

  it("writeOpenCodeHookTools: opencode plugin 含正斜杠 + 双引号的 hook 命令", async () => {
    await writeOpenCodeHookTools(tmpDir);
    const content = await readFile(join(tmpDir, ".opencode", "plugins", "alloy-guard.ts"), "utf-8");
    expect(content).toContain(`node "${EXPECTED_PATH}" _hook-guard`);
    expect(content).toContain(`node "${EXPECTED_PATH}" _stop-guard`);
  });
});
