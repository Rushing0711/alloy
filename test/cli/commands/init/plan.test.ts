import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../src/core/compat.js", () => ({ loadCompat: vi.fn() }));
vi.mock("../../../../src/core/init-matrix.js", () => ({
  detectInitMatrix: vi.fn(),
  readPackageVersion: vi.fn(),
}));
vi.mock("../../../../src/core/agent-config.js", () => ({
  getHookSupportedAgents: vi.fn(() => ["claude-code", "pi", "opencode"]),
  getPermissionSupportedAgents: vi.fn(() => ["claude-code", "pi"]),
  getStopHookSupportedAgents: vi.fn(() => ["claude-code", "pi", "opencode"]),
  getQuestionSupportedAgents: vi.fn(() => ["pi"]),
}));
vi.mock("../../../../src/utils/fs.js", () => ({ getPackageRoot: vi.fn() }));

import { loadCompat } from "../../../../src/core/compat.js";
import { detectInitMatrix, readPackageVersion } from "../../../../src/core/init-matrix.js";
import { plan } from "../../../../src/cli/commands/init/plan.js";
import type { AgentInfo } from "../../../../src/core/types.js";
import type { CollectResult } from "../../../../src/cli/commands/init/collect.js";

const claudeAgent: AgentInfo = {
  id: "claude-code", label: "Claude Code", supportsColonCommands: true, commandsDir: ".claude/commands/"};
const opencodeAgent: AgentInfo = {
  id: "opencode", label: "OpenCode", supportsColonCommands: false, commandsDir: ".opencode/commands/", globalBase: ".config/opencode"};

const baseCollectResult: CollectResult = {
  env: { nodeVersion: "20.0.0", nodeOk: true, gitVersion: "2.40.0", gitOk: true },
  dirRejected: false,
  git: { exists: true, headUnborn: false },
  openSpecCli: { installed: true, version: "1.5.0", needsUpgrade: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadCompat).mockResolvedValue({
    compatible: {
      node: ">=18.0.0", git: ">=2.20.0", openspec: ">=1.3.0 <2.0.0",
      superpowers: ">=5.0.0 <7.0.0", alloy: ">=0.3.0", schema: 1,
    },
    install: { openspec: "@fission-ai/openspec@1", superpowers: "obra/superpowers@6" },
  });
  vi.mocked(readPackageVersion).mockReturnValue("0.4.0");
  vi.mocked(detectInitMatrix).mockResolvedValue({
    agents: [{
      agentId: "claude-code", agentLabel: "Claude Code",
      alloySkills: { installed: true, version: "0.4.0", canUpgrade: false, breaking: false , location: null },
      hook: { installed: true },
      permissions: { installed: true },
      superpowers: { installed: true, version: "6.1.1", canUpgrade: false, breaking: false , location: null },
    }],

    opsxCommands: { installed: true, paths: [] },
  });
});

describe("plan", () => {
  it("alloy skills 未装时 action=install", async () => {
    vi.mocked(detectInitMatrix).mockResolvedValue({
      agents: [{
        agentId: "claude-code", agentLabel: "Claude Code",
        alloySkills: { installed: false, version: null, canUpgrade: false, breaking: false , location: null },
        hook: { installed: false },
        permissions: { installed: null },
        superpowers: { installed: false, version: null, canUpgrade: false, breaking: false , location: null },
      }],

      opsxCommands: { installed: true, paths: [] },
    });
    const result = await plan(baseCollectResult, { scope: "project", targetAgents: [claudeAgent], mainBranch: "main" }, "/test");
    const alloyAction = result.agentActions.find(a => a.product === "alloy-skills");
    expect(alloyAction?.action).toBe("install");
  });

  it("Superpowers breaking 时 action=breaking-upgrade + hasBreaking=true", async () => {
    vi.mocked(detectInitMatrix).mockResolvedValue({
      agents: [{
        agentId: "claude-code", agentLabel: "Claude Code",
        alloySkills: { installed: true, version: "0.4.0", canUpgrade: false, breaking: false , location: null },
        hook: { installed: true },
        permissions: { installed: true },
        superpowers: { installed: true, version: "4.2.0", canUpgrade: true, breaking: true , location: null },
      }],

      opsxCommands: { installed: true, paths: [] },
    });
    const result = await plan(baseCollectResult, { scope: "project", targetAgents: [claudeAgent], mainBranch: "main" }, "/test");
    const spAction = result.agentActions.find(a => a.product === "superpowers");
    expect(spAction?.action).toBe("breaking-upgrade");
    expect(result.hasBreaking).toBe(true);
  });

  it("OpenSpec CLI 未装时 openSpecCliAction.install=true", async () => {
    const collectResult = { ...baseCollectResult, openSpecCli: { installed: false, version: null, needsUpgrade: false } };
    const result = await plan(collectResult, { scope: "project", targetAgents: [claudeAgent], mainBranch: "main" }, "/test");
    expect(result.openSpecCliAction.install).toBe(true);
  });

  it("git 已存在时 git-init action=skip", async () => {
    const result = await plan(baseCollectResult, { scope: "project", targetAgents: [claudeAgent], mainBranch: "main" }, "/test");
    const gitInit = result.projectResources.find(r => r.resource === "git-init");
    expect(gitInit?.action).toBe("skip");
  });

  it("HEAD unborn 时 initial-commit action=install", async () => {
    const collectResult = { ...baseCollectResult, git: { exists: true, headUnborn: true } };
    const result = await plan(collectResult, { scope: "project", targetAgents: [claudeAgent], mainBranch: "main" }, "/test");
    const commit = result.projectResources.find(r => r.resource === "initial-commit");
    expect(commit?.action).toBe("install");
  });

  it("permissions 支持+已装时 projectResource action=ensure(writePermissionsConfig 幂等合并)", async () => {
    // claude-code 支持 permissions 且已装 -> ensure(幂等合并,无需重装)
    const result = await plan(baseCollectResult, { scope: "project", targetAgents: [claudeAgent], mainBranch: "main" }, "/test");
    const perm = result.projectResources.find(r => r.resource === "permissions");
    expect(perm?.action).toBe("ensure");
  });

  it("permissions 支持+未装时 projectResource action=install", async () => {
    vi.mocked(detectInitMatrix).mockResolvedValue({
      agents: [{
        agentId: "claude-code", agentLabel: "Claude Code",
        alloySkills: { installed: true, version: "0.4.0", canUpgrade: false, breaking: false , location: null },
        hook: { installed: true },
        permissions: { installed: false },
        superpowers: { installed: true, version: "6.1.1", canUpgrade: false, breaking: false, location: null }, path: null,
      }],

      opsxCommands: { installed: true, paths: [] },
    });
    const result = await plan(baseCollectResult, { scope: "project", targetAgents: [claudeAgent], mainBranch: "main" }, "/test");
    const perm = result.projectResources.find(r => r.resource === "permissions");
    expect(perm?.action).toBe("install");
  });

  it("permissions 不支持时 projectResource action=skip(opencode)", async () => {
    // opencode 不在 getPermissionSupportedAgents 返回值里
    vi.mocked(detectInitMatrix).mockResolvedValue({
      agents: [{
        agentId: "opencode", agentLabel: "OpenCode",
        alloySkills: { installed: true, version: "0.4.0", canUpgrade: false, breaking: false , location: null },
        hook: { installed: true },
        permissions: { installed: null },
        superpowers: { installed: true, version: "6.1.1", canUpgrade: false, breaking: false, location: null }, path: null,
      }],

      opsxCommands: { installed: true, paths: [] },
    });
    const result = await plan(baseCollectResult, { scope: "project", targetAgents: [opencodeAgent], mainBranch: "main" }, "/test");
    const perm = result.projectResources.find(r => r.resource === "permissions");
    expect(perm?.action).toBe("skip");
  });

  it("settings-json 含 claude-code 时 action=ensure", async () => {
    const result = await plan(baseCollectResult, { scope: "project", targetAgents: [claudeAgent], mainBranch: "main" }, "/test");
    const settings = result.projectResources.find(r => r.resource === "settings-json");
    expect(settings?.action).toBe("ensure");
  });

  it("settings-json 不含 claude-code 时 action=skip", async () => {
    vi.mocked(detectInitMatrix).mockResolvedValue({
      agents: [{
        agentId: "opencode", agentLabel: "OpenCode",
        alloySkills: { installed: true, version: "0.4.0", canUpgrade: false, breaking: false , location: null },
        hook: { installed: true },
        permissions: { installed: null },
        superpowers: { installed: true, version: "6.1.1", canUpgrade: false, breaking: false, location: null }, path: null,
      }],

      opsxCommands: { installed: true, paths: [] },
    });
    const result = await plan(baseCollectResult, { scope: "project", targetAgents: [opencodeAgent], mainBranch: "main" }, "/test");
    const settings = result.projectResources.find(r => r.resource === "settings-json");
    expect(settings?.action).toBe("skip");
  });

  it("alloy skills 可升级非 breaking 时 action=upgrade", async () => {
    vi.mocked(detectInitMatrix).mockResolvedValue({
      agents: [{
        agentId: "claude-code", agentLabel: "Claude Code",
        alloySkills: { installed: true, version: "0.3.5", canUpgrade: true, breaking: false , location: null },
        hook: { installed: true },
        permissions: { installed: true },
        superpowers: { installed: true, version: "6.1.1", canUpgrade: false, breaking: false, location: null }, path: null,
      }],

      opsxCommands: { installed: true, paths: [] },
    });
    const result = await plan(baseCollectResult, { scope: "project", targetAgents: [claudeAgent], mainBranch: "main" }, "/test");
    const alloyAction = result.agentActions.find(a => a.product === "alloy-skills");
    expect(alloyAction?.action).toBe("upgrade");
    expect(alloyAction?.currentVersion).toBe("0.3.5");
    expect(alloyAction?.targetVersion).toBe("0.4.0");
  });

  it("opsx commands 未装时 projectResource action=install", async () => {
    vi.mocked(detectInitMatrix).mockResolvedValue({
      agents: [{
        agentId: "claude-code", agentLabel: "Claude Code",
        alloySkills: { installed: true, version: "0.4.0", canUpgrade: false, breaking: false , location: null },
        hook: { installed: true },
        permissions: { installed: true },
        superpowers: { installed: true, version: "6.1.1", canUpgrade: false, breaking: false, location: null }, path: null,
      }],
      opsxCommands: { installed: false, paths: [] },
    });
    const result = await plan(baseCollectResult, { scope: "project", targetAgents: [claudeAgent], mainBranch: "main" }, "/test");
    const opsxResource = result.projectResources.find(r => r.resource === "openspec-commands");
    expect(opsxResource?.action).toBe("install");
  });

  it("opsx commands 已装时 projectResource action=ensure", async () => {
    vi.mocked(detectInitMatrix).mockResolvedValue({
      agents: [{
        agentId: "claude-code", agentLabel: "Claude Code",
        alloySkills: { installed: true, version: "0.4.0", canUpgrade: false, breaking: false , location: null },
        hook: { installed: true },
        permissions: { installed: true },
        superpowers: { installed: true, version: "6.1.1", canUpgrade: false, breaking: false, location: null }, path: null,
      }],
      opsxCommands: { installed: true, paths: ["/fake/.claude/commands/opsx"] },
    });
    const result = await plan(baseCollectResult, { scope: "project", targetAgents: [claudeAgent], mainBranch: "main" }, "/test");
    const opsxResource = result.projectResources.find(r => r.resource === "openspec-commands");
    expect(opsxResource?.action).toBe("ensure");
  });

  it("hook 支持+未装时 projectResource action=install", async () => {
    vi.mocked(detectInitMatrix).mockResolvedValue({
      agents: [{
        agentId: "claude-code", agentLabel: "Claude Code",
        alloySkills: { installed: true, version: "0.4.0", canUpgrade: false, breaking: false , location: null },
        hook: { installed: false },
        permissions: { installed: true },
        superpowers: { installed: true, version: "6.1.1", canUpgrade: false, breaking: false, location: null }, path: null,
      }],

      opsxCommands: { installed: true, paths: [] },
    });
    const result = await plan(baseCollectResult, { scope: "project", targetAgents: [claudeAgent], mainBranch: "main" }, "/test");
    const hook = result.projectResources.find(r => r.resource === "hook");
    expect(hook?.action).toBe("install");
  });

  it("OpenSpec CLI 需升级时 openSpecCliAction.install=true", async () => {
    const collectResult = {
      ...baseCollectResult,
      openSpecCli: { installed: true, version: "1.0.0", needsUpgrade: true },
    };
    const result = await plan(collectResult, { scope: "project", targetAgents: [claudeAgent], mainBranch: "main" }, "/test");
    expect(result.openSpecCliAction.install).toBe(true);
    expect(result.openSpecCliAction.reason).toContain("1.0.0");
  });

  it("git 不存在时 git-init action=install", async () => {
    const collectResult = { ...baseCollectResult, git: { exists: false, headUnborn: false } };
    const result = await plan(collectResult, { scope: "project", targetAgents: [claudeAgent], mainBranch: "main" }, "/test");
    const gitInit = result.projectResources.find(r => r.resource === "git-init");
    expect(gitInit?.action).toBe("install");
  });

  it("返回值含 scope/targetAgents/mainBranch 透传", async () => {
    const result = await plan(baseCollectResult, { scope: "global", targetAgents: [claudeAgent], mainBranch: "develop" }, "/test");
    expect(result.scope).toBe("global");
    expect(result.targetAgents).toEqual([claudeAgent]);
    expect(result.mainBranch).toBe("develop");
  });
});
