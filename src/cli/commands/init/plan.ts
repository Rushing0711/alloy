import { loadCompat } from "../../../core/compat.js";
import { detectInitMatrix, readPackageVersion } from "../../../core/init-matrix.js";
import { getPackageRoot } from "../../../utils/fs.js";
import { getHookSupportedAgents, getPermissionSupportedAgents, getStopHookSupportedAgents, getQuestionSupportedAgents } from "../../../core/agent-config.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AgentInfo } from "../../../core/types.js";
import type { CollectResult } from "./collect.js";

/** 路径缩写:HOME -> ~,只保留到 skills/ 目录层(去掉 <name> 后缀) */
function shortenPath(p: string | null | undefined): string | undefined {
  if (!p) return undefined;
  const home = homedir();
  let s = p.startsWith(home) ? "~" + p.slice(home.length) : p;
  // 截断到 skills/ 层(去掉 /<skill-name> 后缀)
  const idx = s.indexOf("/skills/");
  if (idx >= 0) s = s.slice(0, idx + "/skills/".length);
  // opsx commands:截断到 commands/ 或 prompts/
  const cmdIdx = s.indexOf("/commands/");
  if (cmdIdx >= 0) s = s.slice(0, cmdIdx + "/commands/".length);
  const promptsIdx = s.indexOf("/prompts/");
  if (promptsIdx >= 0) s = s.slice(0, promptsIdx + "/prompts/".length);
  return s;
}

export type ActionType = "install" | "upgrade" | "skip" | "breaking-upgrade";

export interface ProductAction {
  agentId: string;
  product: "alloy-skills" | "superpowers";
  action: ActionType;
  currentVersion?: string | null;
  targetVersion?: string;
  reason?: string;
}

export interface ResourceAction {
  resource: string;
  action: "install" | "ensure" | "skip";
  description: string;
}

export interface OpenSpecCliAction {
  install: boolean;
  reason: string;
}

export interface ActionPlan {
  scope: "global" | "project";
  targetAgents: AgentInfo[];
  mainBranch: string;
  openSpecCliAction: OpenSpecCliAction;
  agentActions: ProductAction[];
  projectResources: ResourceAction[];
  hasBreaking: boolean;
}

export interface PlanChoices {
  scope: "global" | "project";
  targetAgents: AgentInfo[];
  mainBranch: string;
}

/**
 * 规划 init 动作:基于采集结果(collect)和矩阵(detectInitMatrix),
 * 为每个 agent 的 5 类产物 + 8 类项目资源生成 ActionPlan。
 *
 * permissions action 语义(writePermissionsConfig 幂等合并,已装无需重装):
 * - 支持 + 未装 -> "install"(显示"将装")
 * - 支持 + 已装 -> "skip"(显示"✓")
 * - 不支持 -> "skip"(显示"-")
 *
 * @param collectResult collect 阶段采集结果(环境/目录/git/OpenSpec CLI)
 * @param choices 用户选择(scope/targetAgents/mainBranch)
 * @param projectPath 项目根路径
 */
export async function plan(
  collectResult: CollectResult,
  choices: PlanChoices,
  projectPath: string
): Promise<ActionPlan> {
  const compat = await loadCompat(getPackageRoot());
  const currentAlloyVersion = readPackageVersion();
  const matrix = await detectInitMatrix(projectPath, choices.targetAgents, choices.scope);

  const hookSupported = getHookSupportedAgents();
  const permSupported = getPermissionSupportedAgents();

  const spInstallSpec = compat.install.superpowers;
  const spMajor = spInstallSpec.split("@").pop()!;
  const spTargetVersion = `${spMajor}.x`;

  const agentActions: ProductAction[] = [];

  for (const agent of choices.targetAgents) {
    const status = matrix.agents.find(a => a.agentId === agent.id)!;

    // Superpowers
    if (!status.superpowers.installed) {
      agentActions.push({
        agentId: agent.id,
        product: "superpowers",
        action: "install",
        targetVersion: spTargetVersion,
      });
    } else if (status.superpowers.breaking) {
      agentActions.push({
        agentId: agent.id,
        product: "superpowers",
        action: "breaking-upgrade",
        currentVersion: status.superpowers.version,
        targetVersion: spTargetVersion,
        reason: `${status.superpowers.version} 不满足 compat.yaml "${compat.compatible.superpowers}"`,
      });
    } else if (status.superpowers.canUpgrade) {
      agentActions.push({
        agentId: agent.id,
        product: "superpowers",
        action: "upgrade",
        currentVersion: status.superpowers.version,
        targetVersion: spTargetVersion,
      });
    } else {
      agentActions.push({
        agentId: agent.id,
        product: "superpowers",
        action: "skip",
        currentVersion: status.superpowers.version,
        reason: shortenPath(status.superpowers.path),
      });
    }

    // alloy skills
    if (!status.alloySkills.installed) {
      agentActions.push({
        agentId: agent.id,
        product: "alloy-skills",
        action: "install",
        targetVersion: currentAlloyVersion,
      });
    } else if (status.alloySkills.breaking) {
      agentActions.push({
        agentId: agent.id,
        product: "alloy-skills",
        action: "breaking-upgrade",
        currentVersion: status.alloySkills.version,
        targetVersion: currentAlloyVersion,
        reason: `${status.alloySkills.version} 不满足 compat.yaml "${compat.compatible.alloy}"`,
      });
    } else if (status.alloySkills.canUpgrade) {
      agentActions.push({
        agentId: agent.id,
        product: "alloy-skills",
        action: "upgrade",
        currentVersion: status.alloySkills.version,
        targetVersion: currentAlloyVersion,
      });
    } else {
      agentActions.push({
        agentId: agent.id,
        product: "alloy-skills",
        action: "skip",
        currentVersion: status.alloySkills.version,
        reason: shortenPath(status.alloySkills.path),
      });
    }
  }

  // hook / permissions 汇总(项目级资源,与 agent 无关,从矩阵移出)
  // 各 agent 的 hook/permissions 状态汇总为"将装/已配置",展示在项目资源列表
  const hookAgents = choices.targetAgents.filter(a => hookSupported.includes(a.id));

  const questionSupported = getQuestionSupportedAgents();
  const questionAgents = choices.targetAgents.filter(a => questionSupported.includes(a.id));
  const permAgents = choices.targetAgents.filter(a => permSupported.includes(a.id));
  const hookAllConfigured = hookAgents.length > 0 && hookAgents.every(a => matrix.agents.find(s => s.agentId === a.id)!.hook.installed);
  const permAllConfigured = permAgents.length > 0 && permAgents.every(a => {
    const p = matrix.agents.find(s => s.agentId === a.id)!.permissions.installed;
    return p === true;
  });

  // OpenSpec CLI 动作
  const openSpecCliAction: OpenSpecCliAction = {
    install: !collectResult.openSpecCli.installed || collectResult.openSpecCli.needsUpgrade,
    reason: !collectResult.openSpecCli.installed
      ? "未安装"
      : collectResult.openSpecCli.needsUpgrade
      ? `版本 ${collectResult.openSpecCli.version} 不满足 compat.yaml`
      : "已安装且满足",
  };

  // 项目资源动作(总是装到当前目录)
  // 检测 gitignore/gitattributes/pre-commit 是否已配置
  const gitignoreConfigured = await isGitignoreConfigured(projectPath);
  const gitattributesConfigured = await isGitattributesConfigured(projectPath);
  const preCommitConfigured = await isPreCommitConfigured(projectPath);
  const projectResources: ResourceAction[] = [
    { resource: "openspec", action: "install", description: "openspec init,新建/更新" },
    {
      resource: "openspec-commands",
      action: matrix.opsxCommands.installed ? "ensure" : "install",
      description: `${choices.targetAgents.map(a => a.label).join("+")} opsx ${matrix.opsxCommands.installed ? "已装" : "将装"}`,
    },
    { resource: "gitignore", action: "ensure", description: gitignoreConfigured ? "已配置" : "追加 Alloy 运行时规则" },
    { resource: "gitattributes", action: "ensure", description: gitattributesConfigured ? "已配置" : "追加 LF 强制规则" },
    { resource: "pre-commit", action: "ensure", description: preCommitConfigured ? "已配置" : "alloy _pre-commit-check,新建/更新" },
    {
      resource: "hook",
      action: hookAgents.length === 0 ? "skip" : (hookAllConfigured ? "ensure" : "install"),
      description: hookAgents.length === 0
        ? "无支持 hook 的 agent"
        : `${hookAgents.map(a => a.label).join("+")} PreToolUse${hookAgents.some(a => getStopHookSupportedAgents().includes(a.id)) ? "+Stop" : ""} ${hookAllConfigured ? "已配置" : "将装"}`,
    },
    {
      resource: "permissions",
      action: permAgents.length === 0 ? "skip" : (permAllConfigured ? "ensure" : "install"),
      description: permAgents.length === 0
        ? "无支持 permissions 的 agent"
        : `${permAgents.map(a => a.label).join("+")} allow ${permAllConfigured ? "已配置" : "将装"}`,
    },
    {
      resource: "question-extension",
      action: questionAgents.length === 0 ? "skip" : "install",
      description: questionAgents.length === 0
        ? "无支持 question 的 agent"
        : `${questionAgents.map(a => a.label).join("+")} alloy-question 工具将装`,
    },
    {
      resource: "settings-json",
      action: choices.targetAgents.some(a => a.id === "claude-code") ? "ensure" : "skip",
      description: "worktree.baseRef: head,Claude Code",
    },
    { resource: "shell-completion", action: "ensure", description: "~/.zshrc,新增 alloy completion" },
    {
      resource: "git-init",
      action: collectResult.git.exists ? "skip" : "install",
      description: "当前非 git 仓库时初始化",
    },
    {
      resource: "initial-commit",
      action: collectResult.git.headUnborn ? "install" : "skip",
      description: "HEAD unborn 时锁定主分支",
    },
  ];

  const hasBreaking = agentActions.some(a => a.action === "breaking-upgrade");

  return {
    scope: choices.scope,
    targetAgents: choices.targetAgents,
    mainBranch: choices.mainBranch,
    openSpecCliAction,
    agentActions,
    projectResources,
    hasBreaking,
  };
}

// Alloy + Superpowers 运行时目录(与 execute.ts 保持同步)
const GITIGNORE_RUNTIME_RULES = ["docs/superpowers/", ".claude/worktrees/", ".worktrees/", "worktrees/", ".superpowers/", "skills-lock.json", "*.local.*"];

async function isGitignoreConfigured(projectPath: string): Promise<boolean> {
  try {
    const content = await readFile(join(projectPath, ".gitignore"), "utf-8");
    return GITIGNORE_RUNTIME_RULES.every(rule => content.includes(rule));
  } catch {
    return false;
  }
}

async function isGitattributesConfigured(projectPath: string): Promise<boolean> {
  try {
    const content = await readFile(join(projectPath, ".gitattributes"), "utf-8");
    return content.includes("* text=auto eol=lf");
  } catch {
    return false;
  }
}

async function isPreCommitConfigured(projectPath: string): Promise<boolean> {
  try {
    const content = await readFile(join(projectPath, ".git", "hooks", "pre-commit"), "utf-8");
    return content.includes("_pre-commit-check");
  } catch {
    return false;
  }
}
