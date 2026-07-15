// test/cli/commands/init/execute.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// mock 所有外部依赖
vi.mock("node:child_process", () => ({ execSync: vi.fn() }));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock("node:fs", () => ({ chmodSync: vi.fn(), existsSync: vi.fn() }));
vi.mock("../../../../src/core/git.js", () => ({ ensureGitRepo: vi.fn() }));
vi.mock("../../../../src/core/openspec.js", () => ({
  installOpenSpecCli: vi.fn(),
  initOpenSpecProject: vi.fn(),
}));
vi.mock("../../../../src/core/superpowers.js", () => ({ installSuperpowers: vi.fn() }));
vi.mock("../../../../src/core/skills.js", () => ({
  deploySkills: vi.fn(),
  deploySchema: vi.fn(),
}));
vi.mock("../../../../src/core/agent-config.js", () => ({
  injectAgentConfigs: vi.fn(),
  writePermissionsConfig: vi.fn(),
  writeHookConfig: vi.fn(),
  writeStopHookConfig: vi.fn(),
  getHookSupportedAgents: vi.fn(() => ["claude-code"]),
  getStopHookSupportedAgents: vi.fn(() => ["claude-code"]),
  getPermissionSupportedAgents: vi.fn(() => ["claude-code"]),
}));
vi.mock("../../../../src/core/health.js", () => ({ runHealthCheck: vi.fn() }));
vi.mock("../../../../src/utils/fs.js", () => ({ getPackageRoot: vi.fn() }));
vi.mock("../../../../src/utils/output.js", () => ({
  section: vi.fn(),
  check: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  banner: vi.fn(),
}));
vi.mock("../../../../src/cli/utils/state.js", () => ({
  readProjectConfig: vi.fn(),
  writeProjectConfig: vi.fn(),
}));

import { ensureGitRepo } from "../../../../src/core/git.js";
import { installOpenSpecCli, initOpenSpecProject } from "../../../../src/core/openspec.js";
import { installSuperpowers } from "../../../../src/core/superpowers.js";
import { deploySkills, deploySchema } from "../../../../src/core/skills.js";
import { injectAgentConfigs, writePermissionsConfig, writeHookConfig, writeStopHookConfig } from "../../../../src/core/agent-config.js";
import { runHealthCheck } from "../../../../src/core/health.js";
import { getPackageRoot } from "../../../../src/utils/fs.js";
import { readProjectConfig, writeProjectConfig } from "../../../../src/cli/utils/state.js";
import { readFile } from "node:fs/promises";
import { execute } from "../../../../src/cli/commands/init/execute.js";
import type { ActionPlan } from "../../../../src/cli/commands/init/plan.js";
import type { AgentInfo } from "../../../../src/core/types.js";

const claudeAgent: AgentInfo = {
  id: "claude-code", label: "Claude Code", supportsColonCommands: true, commandsDir: ".claude/commands/"};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ensureGitRepo).mockReturnValue("initialized");
  vi.mocked(installOpenSpecCli).mockResolvedValue("installed");
  vi.mocked(initOpenSpecProject).mockResolvedValue("initialized");
  vi.mocked(installSuperpowers).mockResolvedValue({ status: "installed" });
  vi.mocked(deploySkills).mockResolvedValue([".claude/skills/alloy-start"]);
  vi.mocked(deploySchema).mockResolvedValue("/test/openspec/schemas/alloy");
  vi.mocked(injectAgentConfigs).mockResolvedValue(undefined);
  vi.mocked(writeHookConfig).mockResolvedValue(true);
  vi.mocked(writeStopHookConfig).mockResolvedValue(true);
  vi.mocked(writePermissionsConfig).mockResolvedValue(true);
  vi.mocked(runHealthCheck).mockResolvedValue([]);
  vi.mocked(getPackageRoot).mockReturnValue("/fake/package");
  vi.mocked(readProjectConfig).mockResolvedValue({ schema: "alloy", alloy: {} });
  // readFile 模拟文件不存在(ENOENT),让 ensureGitignore 等函数走"新建"分支
  vi.mocked(readFile).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
});

function makePlan(overrides: Partial<ActionPlan> = {}): ActionPlan {
  return {
    scope: "project",
    targetAgents: [claudeAgent],
    mainBranch: "main",
    openSpecCliAction: { install: false, reason: "已装" },
    agentActions: [
      { agentId: "claude-code", product: "alloy-skills" as const, action: "install" as const },
    ],
    projectResources: [
      { resource: "git-init", action: "skip", description: "" },
      { resource: "initial-commit", action: "skip", description: "" },
    ],
    hasBreaking: false,
    ...overrides,
  };
}

describe("execute", () => {
  it("git-init action=install 时调用 ensureGitRepo", async () => {
    const plan = makePlan({
      projectResources: [
        { resource: "git-init", action: "install", description: "" },
        { resource: "initial-commit", action: "skip", description: "" },
      ],
    });
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false });
    expect(ensureGitRepo).toHaveBeenCalledWith("/test", "main");
  });

  it("git-init action=skip 时不调用 ensureGitRepo", async () => {
    const plan = makePlan({
      projectResources: [
        { resource: "git-init", action: "skip", description: "" },
        { resource: "initial-commit", action: "skip", description: "" },
      ],
    });
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false });
    expect(ensureGitRepo).not.toHaveBeenCalled();
  });

  it("openSpecCliAction.install=true 时调用 installOpenSpecCli", async () => {
    const plan = makePlan({
      openSpecCliAction: { install: true, reason: "未装" },
    });
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false });
    expect(installOpenSpecCli).toHaveBeenCalled();
  });

  it("openSpecCliAction.install=false 时不调用 installOpenSpecCli", async () => {
    const plan = makePlan({
      openSpecCliAction: { install: false, reason: "已装" },
    });
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false });
    expect(installOpenSpecCli).not.toHaveBeenCalled();
  });

  it("initOpenSpecProject 用 scope + targetAgents + force=true 调用", async () => {
    const plan = makePlan();
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false });
    expect(initOpenSpecProject).toHaveBeenCalledWith("/test", "project", [claudeAgent], true);
  });

  it("installSuperpowers 传 force=true(跳过内部确认)", async () => {
    const plan = makePlan();
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false });
    expect(installSuperpowers).toHaveBeenCalledWith("project", [claudeAgent], "/test", true);
  });

  it("deploySkills 用 opts 调用", async () => {
    const plan = makePlan();
    const opts = { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false };
    await execute(plan, opts);
    expect(deploySkills).toHaveBeenCalledWith(opts);
  });

  it("deploySchema 用 opts 调用", async () => {
    const plan = makePlan();
    const opts = { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false };
    await execute(plan, opts);
    expect(deploySchema).toHaveBeenCalledWith(opts);
  });

  it("injectAgentConfigs 用 opts 调用", async () => {
    const plan = makePlan();
    const opts = { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false };
    await execute(plan, opts);
    expect(injectAgentConfigs).toHaveBeenCalledWith(opts);
  });

  it("为支持 hook 的 agent 调用 writeHookConfig", async () => {
    const plan = makePlan();
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false });
    expect(writeHookConfig).toHaveBeenCalledWith("/test", "claude-code");
  });

  it("为支持 Stop hook 的 agent 调用 writeStopHookConfig", async () => {
    const plan = makePlan();
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false });
    expect(writeStopHookConfig).toHaveBeenCalledWith("/test", "claude-code");
  });

  it("为支持 permissions 的 agent 调用 writePermissionsConfig", async () => {
    const plan = makePlan();
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false });
    expect(writePermissionsConfig).toHaveBeenCalledWith("/test", "claude-code");
  });

  it("写入 main_branch 到 openspec/config.yaml", async () => {
    const plan = makePlan({ mainBranch: "main" });
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false });
    expect(readProjectConfig).toHaveBeenCalledWith("/test");
    expect(writeProjectConfig).toHaveBeenCalledWith("/test", expect.objectContaining({
      alloy: expect.objectContaining({ main_branch: "main" }),
    }));
  });

  it("initial-commit action=install 时执行 git commit", async () => {
    const { execSync } = await import("node:child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    const plan = makePlan({
      projectResources: [
        { resource: "git-init", action: "skip", description: "" },
        { resource: "initial-commit", action: "install", description: "" },
      ],
    });
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false });
    const calls = vi.mocked(execSync).mock.calls.map(c => c[0] as string);
    expect(calls.some(cmd => cmd.includes('git commit -m "chore: alloy init 项目初始化"'))).toBe(true);
  });

  it("initial-commit 根据 targetAgents 动态 add agent 目录", async () => {
    const { execSync } = await import("node:child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    const opencodeAgent: AgentInfo = {
      id: "opencode", label: "OpenCode", supportsColonCommands: false, commandsDir: ".opencode/commands/"    };
    const plan = makePlan({
      targetAgents: [claudeAgent, opencodeAgent],
      projectResources: [
        { resource: "git-init", action: "skip", description: "" },
        { resource: "initial-commit", action: "install", description: "" },
      ],
    });
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent, opencodeAgent], force: false });
    const calls = vi.mocked(execSync).mock.calls.map(c => c[0] as string);
    // Claude Code 的 .claude/ 被 add
    expect(calls.some(cmd => cmd.includes('git add .claude/'))).toBe(true);
    // OpenCode 的 .opencode/ 被 add
    expect(calls.some(cmd => cmd.includes('git add .opencode/'))).toBe(true);
    // 非 claude-code agent 的共享 .agents/ 也被 add
    expect(calls.some(cmd => cmd.includes('git add .agents/'))).toBe(true);
  });

  it("initial-commit targetAgents 含 opencode 时 add 根 opencode.json", async () => {
    const { execSync } = await import("node:child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    const opencodeAgent: AgentInfo = {
      id: "opencode", label: "OpenCode", supportsColonCommands: false, commandsDir: ".opencode/commands/" };
    const plan = makePlan({
      targetAgents: [claudeAgent, opencodeAgent],
      projectResources: [
        { resource: "git-init", action: "skip", description: "" },
        { resource: "initial-commit", action: "install", description: "" },
      ],
    });
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent, opencodeAgent], force: false });
    const calls = vi.mocked(execSync).mock.calls.map(c => c[0] as string);
    // opencode.json 在项目根(不在 .opencode/ 目录下),需单独 add
    expect(calls.some(cmd => cmd.includes('git add opencode.json'))).toBe(true);
  });

  it("initial-commit targetAgents 不含 opencode 时不 add opencode.json", async () => {
    const { execSync } = await import("node:child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    const plan = makePlan({
      targetAgents: [claudeAgent],
      projectResources: [
        { resource: "git-init", action: "skip", description: "" },
        { resource: "initial-commit", action: "install", description: "" },
      ],
    });
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false });
    const calls = vi.mocked(execSync).mock.calls.map(c => c[0] as string);
    expect(calls.some(cmd => cmd.includes('git add opencode.json'))).toBe(false);
  });

  it("initial-commit claude-code only 也 add .agents/(superpowers 共享目录)", async () => {
    const { execSync } = await import("node:child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    const plan = makePlan({
      targetAgents: [claudeAgent],
      projectResources: [
        { resource: "git-init", action: "skip", description: "" },
        { resource: "initial-commit", action: "install", description: "" },
      ],
    });
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false });
    const calls = vi.mocked(execSync).mock.calls.map(c => c[0] as string);
    // .claude/skills/ 下有符号链接指向 ../../.agents/skills/,
    // .agents/ 必须 commit,否则 clone 后断链
    expect(calls.some(cmd => cmd.includes('git add .agents/'))).toBe(true);
  });

  it("initial-commit action=skip 时不执行 git commit", async () => {
    const { execSync } = await import("node:child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    const plan = makePlan({
      projectResources: [
        { resource: "git-init", action: "skip", description: "" },
        { resource: "initial-commit", action: "skip", description: "" },
      ],
    });
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false });
    const calls = vi.mocked(execSync).mock.calls.map(c => c[0] as string);
    expect(calls.some(cmd => cmd.includes("git commit"))).toBe(false);
  });

  it("runHealthCheck 用 packageRoot + projectPath + scope 调用", async () => {
    vi.mocked(getPackageRoot).mockReturnValue("/fake/package");
    const plan = makePlan();
    await execute(plan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent], force: false });
    expect(runHealthCheck).toHaveBeenCalledWith("/fake/package", "/test", "project");
  });

  it("写 config 时含 install_scope + target_agents", async () => {
    // mock writeProjectConfig 捕获写入的 config
    const writtenConfigs: any[] = [];
    vi.mocked(writeProjectConfig).mockImplementation(async (_path, config) => {
      writtenConfigs.push(config);
    });

    const opencodeAgent: AgentInfo = {
      id: "opencode", label: "OpenCode", supportsColonCommands: false,
      commandsDir: ".opencode/commands/"    };
    const actionPlan: ActionPlan = {
      scope: "project",
      targetAgents: [claudeAgent, opencodeAgent],
      mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [],
      projectResources: [],
      hasBreaking: false,
    };
    await execute(actionPlan, {
      projectPath: "/test",
      scope: "project",
      targetAgents: [claudeAgent, opencodeAgent],
    });

    expect(writtenConfigs.length).toBeGreaterThan(0);
    const lastConfig = writtenConfigs[writtenConfigs.length - 1];
    expect(lastConfig.alloy.install_scope).toBe("project");
    expect(lastConfig.alloy.target_agents).toEqual(["claude-code", "opencode"]);
  });
});

describe("execute - mode=update", () => {
  it("mode=update 跳过 git init(即使 action=install)", async () => {
    const actionPlan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [],
      projectResources: [
        { resource: "git-init", action: "install", description: "" },
      ],
      hasBreaking: false,
    };
    await execute(actionPlan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent] }, "update");
    expect(ensureGitRepo).not.toHaveBeenCalled();
  });

  it("mode=update 跳过 OpenSpec CLI 安装(即使 install=true)", async () => {
    const actionPlan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: true, reason: "未装" },
      agentActions: [],
      projectResources: [],
      hasBreaking: false,
    };
    await execute(actionPlan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent] }, "update");
    expect(installOpenSpecCli).not.toHaveBeenCalled();
  });

  it("mode=update 跳过 openspec init", async () => {
    const actionPlan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [],
      projectResources: [],
      hasBreaking: false,
    };
    await execute(actionPlan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent] }, "update");
    expect(initOpenSpecProject).not.toHaveBeenCalled();
  });

  it("mode=update 跳过 Superpowers 安装", async () => {
    const actionPlan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [],
      projectResources: [],
      hasBreaking: false,
    };
    await execute(actionPlan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent] }, "update");
    expect(installSuperpowers).not.toHaveBeenCalled();
  });

  it("mode=update 跳过初始 commit(即使 action=install)", async () => {
    const { execSync } = await import("node:child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    const actionPlan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [],
      projectResources: [
        { resource: "initial-commit", action: "install", description: "" },
      ],
      hasBreaking: false,
    };
    await execute(actionPlan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent] }, "update");
    const calls = vi.mocked(execSync).mock.calls.map(c => c[0] as string);
    expect(calls.some(cmd => cmd.includes("git commit"))).toBe(false);
  });

  it("mode=update 跳过 shell 补全", async () => {
    const actionPlan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [],
      projectResources: [],
      hasBreaking: false,
    };
    await execute(actionPlan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent] }, "update");
    // shell 补全会读 ~/.zshrc,检查没读
    expect(vi.mocked(readFile)).not.toHaveBeenCalledWith(expect.stringContaining(".zshrc"), "utf-8");
  });

  it("mode=update 仍然跑 deploySkills", async () => {
    const actionPlan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [
        { agentId: "claude-code", product: "alloy-skills" as const, action: "install" as const },
      ],
      projectResources: [],
      hasBreaking: false,
    };
    await execute(actionPlan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent] }, "update");
    expect(deploySkills).toHaveBeenCalled();
  });

  it("mode=update 仍然跑 injectAgentConfigs + 写 config,但跳过健康检查(init 专用收尾)", async () => {
    const actionPlan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [],
      projectResources: [],
      hasBreaking: false,
    };
    await execute(actionPlan, { projectPath: "/test", scope: "project", targetAgents: [claudeAgent] }, "update");
    expect(injectAgentConfigs).toHaveBeenCalled();
    expect(writeProjectConfig).toHaveBeenCalled();
    expect(runHealthCheck).not.toHaveBeenCalled();
  });
});
