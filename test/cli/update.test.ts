import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock 外部依赖
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("../../src/core/skills.js", () => ({
  deployCommands: vi.fn(),
  deploySchema: vi.fn(),
}));

vi.mock("../../src/core/agents.js", () => ({
  detectDeployedAgents: vi.fn(),
}));

vi.mock("../../src/core/health.js", () => ({
  runHealthCheck: vi.fn(),
}));

vi.mock("../../src/utils/fs.js", () => ({
  getPackageRoot: vi.fn(),
}));

vi.mock("../../src/utils/prompt.js", () => ({
  promptConfirm: vi.fn(),
}));

vi.mock("../../src/core/agent-config.js", () => ({
  injectAgentConfigs: vi.fn(),
}));

vi.mock("../../src/cli/utils/state.js", () => ({
  readProjectConfig: vi.fn(),
  writeProjectConfig: vi.fn(),
}));

import { readFile, writeFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { deployCommands, deploySchema } from "../../src/core/skills.js";
import { detectDeployedAgents } from "../../src/core/agents.js";
import { runHealthCheck } from "../../src/core/health.js";
import { getPackageRoot } from "../../src/utils/fs.js";
import { promptConfirm } from "../../src/utils/prompt.js";
import { injectAgentConfigs } from "../../src/core/agent-config.js";
import { readProjectConfig, writeProjectConfig } from "../../src/cli/utils/state.js";
import { updateCommand } from "../../src/cli/commands/update.js";

describe("updateCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readProjectConfig).mockResolvedValue({ schema: "alloy", alloy: { inject_depth: "medium" } });
    vi.mocked(writeProjectConfig).mockResolvedValue(undefined);
    vi.mocked(injectAgentConfigs).mockResolvedValue(undefined);
  });

  it("未初始化时应提示先运行 alloy init", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const results = await updateCommand("/fake/project");
    expect(results).toContain("⚠️ Alloy 未初始化，请先运行 alloy init");
  });

  it("开发模式应从本地构建重新部署", async () => {
    // mock getPackageRoot
    vi.mocked(getPackageRoot).mockReturnValue("/package/root");

    // mock scope 检测：项目级存在
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path.toString().includes(".claude/commands/alloy")) return true;
      if (path.toString().includes(".git")) return true; // 开发模式
      return false;
    });

    // mock deployed agents
    vi.mocked(detectDeployedAgents).mockReturnValue([
      {
        id: "claude-code",
        label: "Claude Code",
        supportsColonCommands: true,
        commandsDir: ".claude/commands/",
        instructionFile: "CLAUDE.md",
        instructionFormat: "md" as const,
      },
    ]);

    // mock deploy
    vi.mocked(deployCommands).mockResolvedValue(["/path/to/command.md"]);
    vi.mocked(deploySchema).mockResolvedValue("/path/to/schema");

    const results = await updateCommand("/fake/project");
    expect(results).toContain("✓ commands/ → 部署 1 个文件到 1 个 agent");
    expect(results).toContain("✓ schema/ → 已部署");
  });

  it("用户模式且已是最新版本时应提示", async () => {
    // mock scope 检测：项目级存在
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path.toString().includes(".claude/commands/alloy")) return true;
      if (path.toString().includes(".git")) return false; // 用户模式
      return false;
    });

    // mock package.json
    vi.mocked(getPackageRoot).mockReturnValue("/package/root");
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: "0.1.1" }));

    // mock npm view 返回相同版本
    vi.mocked(execSync).mockReturnValue("0.1.1\n");

    // mock deployed agents
    vi.mocked(detectDeployedAgents).mockReturnValue([
      {
        id: "claude-code",
        label: "Claude Code",
        supportsColonCommands: true,
        commandsDir: ".claude/commands/",
        instructionFile: "CLAUDE.md",
        instructionFormat: "md" as const,
      },
    ]);

    // mock deploy
    vi.mocked(deployCommands).mockResolvedValue(["/path/to/command.md"]);
    vi.mocked(deploySchema).mockResolvedValue("/path/to/schema");

    const results = await updateCommand("/fake/project");
    expect(results).toContain("✓ Alloy v0.1.1 已是最新");
  });

  it("用户模式有新版本且用户确认升级时应执行升级", async () => {
    // mock scope 检测：项目级存在
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path.toString().includes(".claude/commands/alloy")) return true;
      if (path.toString().includes(".git")) return false; // 用户模式
      return false;
    });

    // mock package.json
    vi.mocked(getPackageRoot).mockReturnValue("/package/root");
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: "0.1.0" }));

    // mock execSync：第一次返回版本号（npm view），第二次返回空（npm update）
    vi.mocked(execSync)
      .mockReturnValueOnce("0.1.1\n")
      .mockReturnValue("");

    // mock health check
    vi.mocked(runHealthCheck).mockResolvedValue([]);

    // mock 用户确认升级
    vi.mocked(promptConfirm).mockResolvedValue(true);

    // mock deployed agents
    vi.mocked(detectDeployedAgents).mockReturnValue([
      {
        id: "claude-code",
        label: "Claude Code",
        supportsColonCommands: true,
        commandsDir: ".claude/commands/",
        instructionFile: "CLAUDE.md",
        instructionFormat: "md" as const,
      },
    ]);

    // mock deploy
    vi.mocked(deployCommands).mockResolvedValue(["/path/to/command.md"]);
    vi.mocked(deploySchema).mockResolvedValue("/path/to/schema");

    const results = await updateCommand("/fake/project");
    expect(results).toContain("✓ alloy CLI 已升级");
  });

  it("用户模式有新版本但用户拒绝升级时应跳过", async () => {
    // mock scope 检测：项目级存在
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path.toString().includes(".claude/commands/alloy")) return true;
      if (path.toString().includes(".git")) return false; // 用户模式
      return false;
    });

    // mock package.json
    vi.mocked(getPackageRoot).mockReturnValue("/package/root");
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: "0.1.0" }));

    // mock npm view 返回新版本
    vi.mocked(execSync).mockReturnValue("0.1.1\n");

    // mock health check
    vi.mocked(runHealthCheck).mockResolvedValue([]);

    // mock 用户拒绝升级
    vi.mocked(promptConfirm).mockResolvedValue(false);

    // mock deployed agents
    vi.mocked(detectDeployedAgents).mockReturnValue([
      {
        id: "claude-code",
        label: "Claude Code",
        supportsColonCommands: true,
        commandsDir: ".claude/commands/",
        instructionFile: "CLAUDE.md",
        instructionFormat: "md" as const,
      },
    ]);

    // mock deploy
    vi.mocked(deployCommands).mockResolvedValue(["/path/to/command.md"]);
    vi.mocked(deploySchema).mockResolvedValue("/path/to/schema");

    const results = await updateCommand("/fake/project");
    expect(results).toContain("  已跳过 CLI 升级");
  });

  it("未检测到已部署的 agent 时应提示先运行 init", async () => {
    // mock scope 检测：项目级存在
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path.toString().includes(".claude/commands/alloy")) return true;
      if (path.toString().includes(".git")) return true; // 开发模式
      return false;
    });

    // mock 未检测到已部署的 agent
    vi.mocked(detectDeployedAgents).mockReturnValue([]);

    const results = await updateCommand("/fake/project");
    expect(results).toContain("⚠️ 未检测到已部署的 Alloy commands，请先运行 alloy init");
  });

  it("应调用注入器重新注入 agent 配置", async () => {
    // mock scope 检测：项目级存在
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path.toString().includes(".claude/commands/alloy")) return true;
      if (path.toString().includes(".git")) return true; // 开发模式
      return false;
    });

    // mock deployed agents
    vi.mocked(detectDeployedAgents).mockReturnValue([
      {
        id: "claude-code",
        label: "Claude Code",
        supportsColonCommands: true,
        commandsDir: ".claude/commands/",
        instructionFile: "CLAUDE.md",
        instructionFormat: "md" as const,
      },
    ]);

    // mock deploy
    vi.mocked(deployCommands).mockResolvedValue(["/path/to/command.md"]);
    vi.mocked(deploySchema).mockResolvedValue("/path/to/schema");

    // mock config 有 inject_depth
    vi.mocked(readProjectConfig).mockResolvedValue({ schema: "alloy", alloy: { inject_depth: "medium" } });
    vi.mocked(injectAgentConfigs).mockResolvedValue(undefined);

    const results = await updateCommand("/fake/project");
    expect(results).toContain("✓ agent 配置已重新注入（深度: medium）");
    expect(injectAgentConfigs).toHaveBeenCalled();
  });

  it("config 缺失 inject_depth 时兜底 medium 并补写 config", async () => {
    // mock scope 检测：项目级存在
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path.toString().includes(".claude/commands/alloy")) return true;
      if (path.toString().includes(".git")) return true; // 开发模式
      return false;
    });

    vi.mocked(detectDeployedAgents).mockReturnValue([
      {
        id: "claude-code",
        label: "Claude Code",
        supportsColonCommands: true,
        commandsDir: ".claude/commands/",
        instructionFile: "CLAUDE.md",
        instructionFormat: "md" as const,
      },
    ]);

    vi.mocked(deployCommands).mockResolvedValue(["/path/to/command.md"]);
    vi.mocked(deploySchema).mockResolvedValue("/path/to/schema");

    // mock config 无 inject_depth（旧项目）
    vi.mocked(readProjectConfig).mockResolvedValue({ schema: "alloy", alloy: {} });
    vi.mocked(writeProjectConfig).mockResolvedValue(undefined);
    vi.mocked(injectAgentConfigs).mockResolvedValue(undefined);

    const results = await updateCommand("/fake/project");
    expect(results).toContain("✓ agent 配置已重新注入（深度: medium）");
    // 应补写 inject_depth 到 config
    expect(writeProjectConfig).toHaveBeenCalledWith(
      "/fake/project",
      expect.objectContaining({
        alloy: expect.objectContaining({ inject_depth: "medium" }),
      })
    );
  });
});
