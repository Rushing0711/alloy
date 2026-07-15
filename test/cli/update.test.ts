import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("node:fs", () => ({ readFileSync: vi.fn(), existsSync: vi.fn() }));
vi.mock("node:child_process", () => ({ execSync: vi.fn() }));

vi.mock("../../src/core/skills.js", () => ({
  deploySkills: vi.fn(),
  deploySchema: vi.fn(),
}));
vi.mock("../../src/core/agents.js", () => ({
  detectDeployedAgents: vi.fn(),
  KNOWN_AGENTS: [
    { id: "claude-code", label: "Claude Code", commandsDir: ".claude/commands/", supportsColonCommands: true },
  ],
}));
vi.mock("../../src/core/health.js", () => ({ runHealthCheck: vi.fn() }));
vi.mock("../../src/utils/fs.js", () => ({ getPackageRoot: vi.fn() }));
vi.mock("../../src/utils/prompt.js", () => ({ promptConfirm: vi.fn() }));
vi.mock("../../src/core/agent-config.js", () => ({ injectAgentConfigs: vi.fn() }));
vi.mock("../../src/cli/utils/state.js", () => ({
  readProjectConfig: vi.fn(),
  writeProjectConfig: vi.fn(),
}));
vi.mock("../../src/cli/commands/init/plan.js", () => ({ plan: vi.fn() }));
vi.mock("../../src/cli/commands/init/display.js", () => ({ displayAndConfirm: vi.fn() }));
vi.mock("../../src/cli/commands/init/execute.js", () => ({ execute: vi.fn() }));
vi.mock("../../src/cli/commands/init/collect.js", () => ({ collectForUpdate: vi.fn() }));
vi.mock("../../src/core/openspec.js", () => ({
  installOpenSpecCli: vi.fn(),
  updateOpenSpecCommands: vi.fn(),
}));
vi.mock("../../src/core/superpowers.js", () => ({ installSuperpowers: vi.fn() }));
vi.mock("../../src/core/detect-installations.js", () => ({ detectSkill: vi.fn() }));

import { readProjectConfig } from "../../src/cli/utils/state.js";
import { plan } from "../../src/cli/commands/init/plan.js";
import { displayAndConfirm } from "../../src/cli/commands/init/display.js";
import { execute } from "../../src/cli/commands/init/execute.js";
import { collectForUpdate } from "../../src/cli/commands/init/collect.js";
import { installOpenSpecCli, updateOpenSpecCommands } from "../../src/core/openspec.js";
import { installSuperpowers } from "../../src/core/superpowers.js";
import { detectSkill } from "../../src/core/detect-installations.js";
import { runHealthCheck } from "../../src/core/health.js";
import { getPackageRoot } from "../../src/utils/fs.js";
import { promptConfirm } from "../../src/utils/prompt.js";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { updateCommand } from "../../src/cli/commands/update.js";

const claudeAgent = {
  id: "claude-code", label: "Claude Code", commandsDir: ".claude/commands/",
  supportsColonCommands: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readProjectConfig).mockResolvedValue({
    schema: "alloy",
    alloy: {
      main_branch: "main",
      install_scope: "project",
      target_agents: ["claude-code"],
    },
  });
  vi.mocked(collectForUpdate).mockResolvedValue({
    env: { nodeVersion: "", nodeOk: true, gitVersion: "", gitOk: true },
    dirRejected: false,
    git: { exists: true, headUnborn: false },
    openSpecCli: { installed: true, version: "1.5.0", needsUpgrade: false },
  });
  vi.mocked(plan).mockResolvedValue({
    scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
    openSpecCliAction: { install: false, reason: "已装" },
    agentActions: [], projectResources: [], hasBreaking: false,
  });
  vi.mocked(displayAndConfirm).mockResolvedValue(true);
  vi.mocked(execute).mockResolvedValue(undefined);
  vi.mocked(installOpenSpecCli).mockResolvedValue("skipped");
  vi.mocked(updateOpenSpecCommands).mockResolvedValue("updated");
  vi.mocked(installSuperpowers).mockResolvedValue({ status: "installed" });
  vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
  vi.mocked(getPackageRoot).mockReturnValue("/fake/package");
  vi.mocked(runHealthCheck).mockResolvedValue([]);
  // upgradeAlloyCli 读 package.json,需返回有效 JSON
  vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: "0.1.0" }));
  // 开发模式 = false(无 .git)
  vi.mocked(existsSync).mockReturnValue(false);
});

describe("updateCommand - 配置校验", () => {
  it("config 缺 install_scope 时提示跑 init", async () => {
    vi.mocked(readProjectConfig).mockResolvedValue({
      schema: "alloy",
      alloy: { main_branch: "main" },  // 无 install_scope
    });
    const results = await updateCommand("/test");
    expect(results.some(r => r.includes("请运行 alloy init"))).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("config 缺 target_agents 时提示跑 init", async () => {
    vi.mocked(readProjectConfig).mockResolvedValue({
      schema: "alloy",
      alloy: { main_branch: "main", install_scope: "project" },  // 无 target_agents
    });
    const results = await updateCommand("/test");
    expect(results.some(r => r.includes("请运行 alloy init"))).toBe(true);
  });

  it("target_agents 为空数组时提示跑 init", async () => {
    vi.mocked(readProjectConfig).mockResolvedValue({
      schema: "alloy",
      alloy: { main_branch: "main", install_scope: "project", target_agents: [] },
    });
    const results = await updateCommand("/test");
    expect(results.some(r => r.includes("请运行 alloy init"))).toBe(true);
  });
});

describe("updateCommand - 流程编排(用户模式)", () => {
  it("调用 plan + displayAndConfirm + execute(不再冗余调 detectInitMatrix)", async () => {
    await updateCommand("/test");
    expect(plan).toHaveBeenCalled();
    expect(displayAndConfirm).toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), "update");
  });

  it("openSpecCliAction.install=true 时调 installOpenSpecCli 升级", async () => {
    vi.mocked(plan).mockResolvedValue({
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: true, reason: "版本不满足" },
      agentActions: [], projectResources: [], hasBreaking: false,
    });
    await updateCommand("/test");
    expect(installOpenSpecCli).toHaveBeenCalled();
  });

  it("openSpecCliAction.install=false 时跳过 installOpenSpecCli(已装且兼容)", async () => {
    await updateCommand("/test");
    expect(installOpenSpecCli).not.toHaveBeenCalled();
  });

  it("调用 updateOpenSpecCommands 刷新 opsx", async () => {
    await updateCommand("/test");
    expect(updateOpenSpecCommands).toHaveBeenCalledWith("/test", expect.any(Array), "project");
  });

  it("force=true 跳过 displayAndConfirm", async () => {
    await updateCommand("/test", true);
    expect(displayAndConfirm).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalled();
  });

  it("force=true 跳过 upgradeAlloyCli 内部的 promptConfirm(有新版本时)", async () => {
    // 模拟有新版本: 当前 0.1.0, 最新 0.2.0
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: "0.1.0" }));
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === "string" && cmd.includes("npm view")) {
        return Buffer.from("0.2.0");
      }
      return Buffer.from("");
    });
    await updateCommand("/test", true);
    expect(promptConfirm).not.toHaveBeenCalled();
  });

  it("force=false(默认) 有新版本时仍走 promptConfirm", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: "0.1.0" }));
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === "string" && cmd.includes("npm view")) {
        return Buffer.from("0.2.0");
      }
      return Buffer.from("");
    });
    vi.mocked(promptConfirm).mockResolvedValue(false);
    await updateCommand("/test");
    expect(promptConfirm).toHaveBeenCalledWith("是否升级 alloy CLI?", false);
  });
});

describe("updateCommand - 开发模式", () => {
  beforeEach(() => {
    // 开发模式 = true(有 .git)
    vi.mocked(existsSync).mockImplementation((p) => p.toString().includes(".git"));
  });

  it("开发模式跳过 installOpenSpecCli", async () => {
    await updateCommand("/test");
    expect(installOpenSpecCli).not.toHaveBeenCalled();
  });

  it("开发模式跳过 installSuperpowers", async () => {
    await updateCommand("/test");
    expect(installSuperpowers).not.toHaveBeenCalled();
  });

  it("开发模式仍调 updateOpenSpecCommands 和 execute", async () => {
    await updateCommand("/test");
    expect(updateOpenSpecCommands).toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), "update");
  });
});

describe("updateCommand - Superpowers 升级 scope 逻辑", () => {
  it("scope=project 时调 installSuperpowers('project')", async () => {
    await updateCommand("/test");
    expect(installSuperpowers).toHaveBeenCalledWith(
      "project", expect.any(Array), "/test", true
    );
  });

  it("scope=global + user-skill 形态时调 installSuperpowers('global')", async () => {
    vi.mocked(readProjectConfig).mockResolvedValue({
      schema: "alloy",
      alloy: { main_branch: "main", install_scope: "global", target_agents: ["claude-code"] },
    });
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-skill", path: "/home/.agents/skills/brainstorming", version: null,
    });
    await updateCommand("/test");
    expect(installSuperpowers).toHaveBeenCalledWith(
      "global", expect.any(Array), "/test", true
    );
  });

  it("scope=global + user-plugin 形态时跳过 installSuperpowers 并提示", async () => {
    vi.mocked(readProjectConfig).mockResolvedValue({
      schema: "alloy",
      alloy: { main_branch: "main", install_scope: "global", target_agents: ["claude-code"] },
    });
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/home/.claude/plugins/cache/...", version: "6.1.0",
    });
    const results = await updateCommand("/test");
    expect(installSuperpowers).not.toHaveBeenCalled();
    expect(results.some(r => r.includes("plugin"))).toBe(true);
  });
});
