import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../src/utils/prompt.js", () => ({ promptConfirm: vi.fn() }));
vi.mock("../../../../src/utils/output.js", () => ({
  section: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn(),
}));

import { promptConfirm } from "../../../../src/utils/prompt.js";
import { displayAndConfirm, formatAgentMatrix, formatBreakingWarnings, formatProjectResources } from "../../../../src/cli/commands/init/display.js";
import type { ActionPlan } from "../../../../src/cli/commands/init/plan.js";
import type { AgentInfo } from "../../../../src/core/types.js";

const claudeAgent: AgentInfo = {
  id: "claude-code", label: "Claude Code", supportsColonCommands: true, commandsDir: ".claude/commands/"};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("displayAndConfirm", () => {
  it("无 breaking 时单次确认默认 Yes", async () => {
    vi.mocked(promptConfirm).mockResolvedValue(true);
    const plan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [{
        agentId: "claude-code", product: "alloy-skills", action: "install", targetVersion: "0.4.0",
      }],
      projectResources: [],
      hasBreaking: false,
    };
    const result = await displayAndConfirm(plan, false);
    expect(result).toBe(true);
    expect(promptConfirm).toHaveBeenCalledTimes(1);
    expect(promptConfirm).toHaveBeenCalledWith("确认执行以上操作?", true);
  });

  it("有 breaking 时双重确认,默认 No", async () => {
    vi.mocked(promptConfirm).mockResolvedValue(true);
    const plan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [{
        agentId: "claude-code", product: "superpowers", action: "breaking-upgrade",
        currentVersion: "4.2.0", targetVersion: "6.1.1",
      }],
      projectResources: [],
      hasBreaking: true,
    };
    const result = await displayAndConfirm(plan, false);
    expect(result).toBe(true);
    expect(promptConfirm).toHaveBeenCalledTimes(2);
    expect(promptConfirm).toHaveBeenNthCalledWith(1, expect.stringContaining("breaking 升级"), false);
    expect(promptConfirm).toHaveBeenNthCalledWith(2, expect.stringContaining("再次确认"), false);
  });

  it("breaking 第一次拒绝时返回 false,不问第二次", async () => {
    vi.mocked(promptConfirm).mockResolvedValueOnce(false);
    const plan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [{
        agentId: "claude-code", product: "superpowers", action: "breaking-upgrade",
        currentVersion: "4.2.0", targetVersion: "6.1.1",
      }],
      projectResources: [],
      hasBreaking: true,
    };
    const result = await displayAndConfirm(plan, false);
    expect(result).toBe(false);
    expect(promptConfirm).toHaveBeenCalledTimes(1);
  });

  it("force=true 时跳过确认", async () => {
    const plan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [],
      projectResources: [],
      hasBreaking: true,
    };
    const result = await displayAndConfirm(plan, true);
    expect(result).toBe(true);
    expect(promptConfirm).not.toHaveBeenCalled();
  });

  it("formatAgentMatrix 输出含表头和 agent 行", () => {
    const plan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [
        { agentId: "claude-code", product: "superpowers", action: "skip", currentVersion: "6.1.1" },
        { agentId: "claude-code", product: "alloy-skills", action: "skip", currentVersion: "0.4.0" },
      ],
      projectResources: [],
      hasBreaking: false,
    };
    const lines = formatAgentMatrix(plan);
    expect(lines[0]).toBe("agent 级产物即将执行的动作:");
    expect(lines[1]).toContain("agent");
    expect(lines[1]).toContain("Superpowers Skills");
    expect(lines[1]).toContain("Alloy Skills");
  });

  it("Superpowers skip 时按 location 显示来源标注", () => {
    const plan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [
        // user-plugin: agent 专属插件,有版本,路径含 plugins/cache
        { agentId: "claude-code", product: "superpowers", action: "skip", currentVersion: "6.1.1", reason: "~/.claude/plugins/cache/" },
      ],
      projectResources: [],
      hasBreaking: false,
    };
    const lines = formatAgentMatrix(plan);
    const spRow = lines.find(l => l.includes("Claude Code"))!;
    expect(spRow).toContain("✓ 6.1.1(~/.claude/plugins/cache/)");
  });

  it("Superpowers skip user-skill 显示路径(全局共享)", () => {
    const plan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [
        { agentId: "claude-code", product: "superpowers", action: "skip", reason: "~/.agents/skills/" },
      ],
      projectResources: [],
      hasBreaking: false,
    };
    const lines = formatAgentMatrix(plan);
    const spRow = lines.find(l => l.includes("Claude Code"))!;
    expect(spRow).toContain("✓(~/.agents/skills/)");
  });

  it("Superpowers skip project-skill 显示路径(项目)", () => {
    const plan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [
        { agentId: "claude-code", product: "superpowers", action: "skip", reason: ".claude/skills/" },
      ],
      projectResources: [],
      hasBreaking: false,
    };
    const lines = formatAgentMatrix(plan);
    const spRow = lines.find(l => l.includes("Claude Code"))!;
    expect(spRow).toContain("✓(.claude/skills/)");
  });

  it("alloy-skills skip global 显示路径(全局共享)", () => {
    const plan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [
        { agentId: "claude-code", product: "alloy-skills", action: "skip", currentVersion: "0.4.0", reason: "~/.claude/skills/" },
      ],
      projectResources: [],
      hasBreaking: false,
    };
    const lines = formatAgentMatrix(plan);
    const alloyRow = lines.find(l => l.includes("Claude Code"))!;
    expect(alloyRow).toContain("✓ 0.4.0(~/.claude/skills/)");
  });

  it("formatBreakingWarnings 输出 breaking 原因", () => {
    const plan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [{
        agentId: "claude-code", product: "superpowers", action: "breaking-upgrade",
        currentVersion: "4.2.0", targetVersion: "6.1.1",
        reason: "4.2.0 不满足 compat.yaml \">=5.0.0 <7.0.0\"",
      }],
      projectResources: [],
      hasBreaking: true,
    };
    const lines = formatBreakingWarnings(plan);
    expect(lines[0]).toContain("breaking 升级");
    expect(lines.some(l => l.includes("4.2.0 -> 6.1.1"))).toBe(true);
    expect(lines.some(l => l.includes("不满足 compat.yaml"))).toBe(true);
  });

  it("formatBreakingWarnings 无 breaking 时返回空数组", () => {
    const plan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [],
      projectResources: [],
      hasBreaking: false,
    };
    const lines = formatBreakingWarnings(plan);
    expect(lines).toEqual([]);
  });

  it("formatProjectResources 跳过 skip 项,列出 install/ensure 项", () => {
    const plan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [],
      projectResources: [
        { resource: "openspec", action: "install", description: "openspec init,新建/更新" },
        { resource: "git-init", action: "skip", description: "当前非 git 仓库时初始化" },
        { resource: "gitignore", action: "ensure", description: "追加 Alloy 运行时规则" },
      ],
      hasBreaking: false,
    };
    const lines = formatProjectResources(plan);
    expect(lines[0]).toBe("项目级资源(将写入当前目录):");
    expect(lines.some(l => l.includes("openspec"))).toBe(true);
    expect(lines.some(l => l.includes("gitignore"))).toBe(true);
    expect(lines.some(l => l.includes("git-init"))).toBe(false);
  });

  it("formatAgentMatrix 版本化单元格显示版本号", () => {
    const plan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [
        { agentId: "claude-code", product: "superpowers", action: "install", targetVersion: "6.0.0" },
        { agentId: "claude-code", product: "alloy-skills", action: "upgrade", currentVersion: "0.3.5", targetVersion: "0.4.0" },
      ],
      projectResources: [],
      hasBreaking: false,
    };
    const lines = formatAgentMatrix(plan);
    // 找到含 "将装 6.0.0" 的行(Superpowers install)
    expect(lines.some(l => l.includes("将装 6.0.0"))).toBe(true);
    // 找到含 "将升级 0.3.5->0.4.0" 的行(alloy upgrade)
    expect(lines.some(l => l.includes("将升级 0.3.5->0.4.0"))).toBe(true);
  });

  it("formatAgentMatrix breaking 单元格含 ⚠️ breaking 标记", () => {
    const plan: ActionPlan = {
      scope: "project", targetAgents: [claudeAgent], mainBranch: "main",
      openSpecCliAction: { install: false, reason: "已装" },
      agentActions: [
        { agentId: "claude-code", product: "superpowers", action: "breaking-upgrade", currentVersion: "4.2.0", targetVersion: "6.1.1" },
        { agentId: "claude-code", product: "alloy-skills", action: "skip", currentVersion: "0.4.0" },
      ],
      projectResources: [],
      hasBreaking: true,
    };
    const lines = formatAgentMatrix(plan);
    expect(lines.some(l => l.includes("⚠️ breaking 4.2.0->6.1.1"))).toBe(true);
  });
});
