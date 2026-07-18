// src/cli/commands/init/execute.ts
// 幂等执行 ActionPlan:按 15 步顺序执行 init 动作。
// 用户已在 display 阶段确认,这里直接执行(覆盖/升级/breaking 不再问)。
import { execSync } from "node:child_process";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chmodSync } from "node:fs";
import { section, check, success, error, warn, info, banner } from "../../../utils/output.js";
import { ensureGitRepo } from "../../../core/git.js";
import { installOpenSpecCli, initOpenSpecProject } from "../../../core/openspec.js";
import { installSuperpowers } from "../../../core/superpowers.js";
import { detectSkill } from "../../../core/detect-installations.js";
import { deploySkills, deploySchema, deployOpenCodeCommands, deployPiCommands } from "../../../core/skills.js";
import {
  injectAgentConfigs, writePermissionsConfig, writeHookConfig, writeStopHookConfig,
  getHookSupportedAgents, getStopHookSupportedAgents, getPermissionSupportedAgents,
  writeQuestionConfig, getQuestionSupportedAgents,
} from "../../../core/agent-config.js";
import { runHealthCheck } from "../../../core/health.js";
import { getPackageRoot } from "../../../utils/fs.js";
import { readProjectConfig, writeProjectConfig } from "../../utils/state.js";
import type { ActionPlan } from "./plan.js";
import type { DeployOptions } from "../../../core/types.js";

// Alloy + Superpowers 运行时目录(每次逐条检测缺失并补齐)
const GITIGNORE_RUNTIME_RULES = ["docs/superpowers/", ".claude/worktrees/", ".worktrees/", "worktrees/", ".superpowers/", "skills-lock.json", "*.local.*"];

// AI 开发工具产物(整组追加,以标记检测是否已写入)
const GITIGNORE_AI_TOOLS_BLOCK = `### AI 开发工具产物 ###
.idea/
.vscode/*
!.vscode/extensions.json
.playwright-mcp/
.DS_Store
*.log
logs/`;
const GITIGNORE_AI_TOOLS_MARKER = "### AI 开发工具产物 ###";

/** 确保 .gitignore 包含 Alloy 运行时规则 + AI 工具产物规则(幂等追加) */
export async function ensureGitignore(projectPath: string): Promise<void> {
  const gitignorePath = join(projectPath, ".gitignore");
  let content = "";
  try {
    content = await readFile(gitignorePath, "utf-8");
    if (!content.endsWith("\n")) content += "\n";
  } catch {
    // 文件不存在,稍后创建
  }

  // 运行时规则:逐条检测缺失
  const missingRuntime = GITIGNORE_RUNTIME_RULES.filter((rule) => !content.includes(rule));
  // AI 工具产物:整组检测(标记存在则跳过,避免重复追加取反规则造成混乱)
  const needAiBlock = !content.includes(GITIGNORE_AI_TOOLS_MARKER);

  if (missingRuntime.length === 0 && !needAiBlock) {
    info("gitignore 规则已配置,跳过");
    return;
  }

  const sections: string[] = [];
  if (missingRuntime.length > 0) {
    sections.push(`### Alloy + Superpowers 运行时 ###\n${missingRuntime.join("\n")}`);
  }
  if (needAiBlock) {
    sections.push(GITIGNORE_AI_TOOLS_BLOCK);
  }
  const block = `\n${sections.join("\n")}\n`;
  await writeFile(gitignorePath, content + block, "utf-8");
  success(".gitignore -> 已追加规则");
}

/** 确保 .gitattributes 含 LF 强制规则--避免 Windows 上 git autocrlf 把 LF 转 CRLF */
export async function ensureGitattributes(projectPath: string): Promise<void> {
  const gitattributesPath = join(projectPath, ".gitattributes");
  const lfRule = "* text=auto eol=lf";
  let content = "";
  try {
    content = await readFile(gitattributesPath, "utf-8");
    if (content.includes(lfRule)) {
    info("gitattributes 规则已配置,跳过");
    return;
  }
    if (!content.endsWith("\n")) content += "\n";
  } catch {
    // 文件不存在,稍后创建
  }

  const block = `\n### Alloy: 强制 LF 换行 ###\n${lfRule}\n`;
  await writeFile(gitattributesPath, content + block, "utf-8");
  success(".gitattributes -> * text=auto eol=lf");
}

/**
 * 确保 .git/hooks/pre-commit 装 alloy _pre-commit-check(兜底 PreToolUse hook 盲区)。
 * - 不存在:创建(可执行)
 * - 已含 _pre-commit-check + 路径正确:幂等跳过
 * - 已含 _pre-commit-check + 路径过时:替换为当前路径
 * - 有用户自己的 hook(不含 _pre-commit-check):追加 alloy 检查
 */
export async function ensurePreCommitHook(projectPath: string): Promise<void> {
  const hookPath = join(projectPath, ".git", "hooks", "pre-commit");
  const alloyCliPath = join(getPackageRoot(), "dist", "cli", "index.js");
  const alloyCheck = `node ${alloyCliPath} _pre-commit-check`;

  let existing = "";
  try {
    existing = await readFile(hookPath, "utf-8");
  } catch {
    // 文件不存在
  }

  // 已含 _pre-commit-check
  if (existing.includes("_pre-commit-check")) {
    if (existing.includes(alloyCliPath)) {
      info("pre-commit hook 已配置,跳过");
      return;
    }
    // 路径过时,替换 _pre-commit-check 行
    const updated = existing.replace(/node\s+\S+\s+_pre-commit-check/g, alloyCheck);
    await writeFile(hookPath, updated, "utf-8");
    chmodSync(hookPath, "755");
    success("pre-commit hook 路径已更新");
    return;
  }

  // 有用户自己的 hook,追加 alloy 检查
  if (existing.trim()) {
    const appended = existing.trimEnd() + `\n\n# Alloy pre-commit check\n${alloyCheck}\n`;
    await writeFile(hookPath, appended, "utf-8");
    chmodSync(hookPath, "755");
    success("pre-commit hook -> 已追加 alloy 检查");
    return;
  }

  // 文件不存在,创建
  await mkdir(join(hookPath, ".."), { recursive: true });
  const hookContent = `#!/bin/sh\n# Alloy pre-commit hook\n${alloyCheck}\n`;
  await writeFile(hookPath, hookContent, "utf-8");
  chmodSync(hookPath, "755");
  success("pre-commit hook -> 已创建");
}

/** 注册 shell 补全到 ~/.zshrc 或 ~/.bashrc(幂等) */
async function ensureShellCompletion(): Promise<void> {
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  const shell = process.env.SHELL || "";
  let completionLine = "source <(alloy completion bash)";
  let rcFile: string | null = null;
  if (shell.includes("zsh")) {
    rcFile = join(home, ".zshrc");
    completionLine = "source <(alloy completion zsh)";
  } else if (shell.includes("bash")) {
    rcFile = join(home, ".bashrc");
  }
  if (!rcFile) {
    warn("未检测到 bash/zsh,跳过补全注册");
    return;
  }

  let rcContent = "";
  try {
    rcContent = await readFile(rcFile, "utf-8");
  } catch {
    // 文件不存在,稍后创建
  }
  if (rcContent.includes("alloy completion")) {
    success("shell 补全已存在,跳过");
    return;
  }
  const block = ["", "# Alloy shell 补全", completionLine, ""].join("\n");
  await writeFile(rcFile, rcContent.trimEnd() + block, "utf-8");
  success(`shell 补全已注册 -> ${rcFile}`);
}

/**
 * 幂等执行 ActionPlan:按 15 步顺序执行 init 动作。
 *
 * 步骤顺序:
 *  1. git init(如需)              2. OpenSpec CLI 安装/升级(如需)
 *  3. openspec init                4. Superpowers 安装(force=true)
 *  5. Alloy skills 部署            6-8. opsx/hook/permissions(通过 injectAgentConfigs 等)
 *  9-10. .gitignore + .gitattributes + pre-commit
 *  11. settings.json(injectAgentConfigs 处理)
 *  12. openspec/config.yaml main_branch
 *  13. 初始 commit(如 HEAD unborn)
 *  14. shell 补全
 *  15. 兼容性检查(健康检查)
 *
 * @param actionPlan plan 阶段生成的执行计划
 * @param opts DeployOptions(projectPath/scope/targetAgents/force)
 * @param mode "init"(默认,全量执行)或 "update"(跳过一次性步骤:git init / OpenSpec CLI 安装 / openspec init / Superpowers 安装 / 初始 commit / shell 补全)
 */
export async function execute(
  actionPlan: ActionPlan,
  opts: DeployOptions,
  mode: "init" | "update" = "init"
): Promise<void> {
  const { projectPath, scope, targetAgents, mainBranch } = {
    projectPath: opts.projectPath,
    scope: actionPlan.scope,
    targetAgents: actionPlan.targetAgents,
    mainBranch: actionPlan.mainBranch,
  };
  const hasClaudeCode = targetAgents.some(a => a.id === "claude-code");
  const isUpdate = mode === "update";

  // 1. git init(如需,update 模式跳过--update 复用已有 git 仓库)
  if (!isUpdate) {
    section("初始化 git 仓库...");
    if (actionPlan.projectResources.find(r => r.resource === "git-init")?.action === "install") {
      const gitResult = ensureGitRepo(projectPath, mainBranch);
      if (gitResult === "initialized") {
        check("git 仓库", `已初始化(初始分支: ${mainBranch})`, "pass");
      } else {
        error("git init 失败");
        process.exit(1);
      }
    } else {
      check("git 仓库", "已存在", "pass");
    }
  }

  // 2. OpenSpec CLI 安装/升级(如需,update 模式跳过--由 updateCommand 自己管升级)
  if (!isUpdate) {
    if (actionPlan.openSpecCliAction.install) {
      section("安装 OpenSpec CLI...");
      const result = await installOpenSpecCli();
      if (result === "installed") {
        success("@fission-ai/openspec@1 已安装");
      } else if (result === "failed") {
        error("OpenSpec CLI 安装失败");
        process.exit(1);
      }
    } else {
      info(`OpenSpec CLI ${actionPlan.openSpecCliAction.reason}`);
    }
  }

  // 3. openspec init(项目级 openspec/ 目录,update 模式跳过--由 updateCommand 调 openspec update)
  if (!isUpdate) {
    section("初始化 OpenSpec 项目结构...");
    const initResult = await initOpenSpecProject(projectPath, scope, targetAgents, true);
    if (initResult === "failed") {
      error("OpenSpec 项目初始化失败");
      process.exit(1);
    }
  }

  // 4. Superpowers 安装/升级(update 模式跳过--由 updateCommand 自己管,npx 一次装所有 agent)
  if (!isUpdate) {
    section("安装 Superpowers...");
    const spResult = await installSuperpowers(scope, targetAgents, projectPath, true);
    if (spResult.status === "installed") {
      if (spResult.partialFailures?.length) {
        warn(`Superpowers 部分失败(${spResult.partialFailures.join(" / ")})`);
      }
      // 细分每个 agent 的 Superpowers 状态
      for (const agent of targetAgents) {
        const detected = detectSkill("brainstorming", agent, projectPath);
        if (detected.found) {
          const versionInfo = detected.version ? ` v${detected.version}` : "";
          success(`${agent.label} Superpowers${versionInfo} 已装`);
        } else {
          warn(`${agent.label} Superpowers 未装`);
        }
      }
    } else if (spResult.status === "failed") {
      warn("Superpowers 安装失败,请稍后重试");
    }
  }

  // 5. Alloy skills 部署(只对 action≠skip 的 agent)
  section("部署 Alloy skills...");
  const skillsAgents = targetAgents.filter(agent => {
    const action = actionPlan.agentActions.find(a => a.agentId === agent.id && a.product === "alloy-skills");
    return action && action.action !== "skip";
  });
  if (skillsAgents.length > 0) {
    const paths = await deploySkills({ ...opts, targetAgents: skillsAgents });
    for (const p of paths) success(p);
  } else {
    info("Alloy skills 全部已装,跳过");
  }
  const schemaPath = await deploySchema(opts);
  success(`项目 schema -> ${schemaPath}`);

  // 5.1 OpenCode command wrapper(让 /alloy-start 等 slash command 能触发 skill)
  // OpenCode 的 / 只列 commands,skills 不在 / 列表;补装 wrapper 到 .opencode/commands/alloy-*.md
  if (skillsAgents.some(a => a.id === "opencode")) {
    const wrapperPaths = await deployOpenCodeCommands({ ...opts, targetAgents: skillsAgents });
    for (const p of wrapperPaths) success(p);
  }

  // 5.2 Pi command wrapper(Pi 的 / 只从 .pi/prompts/ 加载,skills 不自动触发;补装 wrapper 指示 agent read SKILL.md)
  if (skillsAgents.some(a => a.id === "pi")) {
    const wrapperPaths = await deployPiCommands({ ...opts, targetAgents: skillsAgents });
    for (const p of wrapperPaths) success(p);
  }

  // 6-8. opsx commands / hook / permissions(通过 injectAgentConfigs + writeHookConfig + writePermissionsConfig)
  section("注入 agent 专有配置...");
  await injectAgentConfigs(opts);
  if (hasClaudeCode) {
    success(".claude/settings.json -> worktree.baseRef: head");
  }

  const hookAgentIds = targetAgents.map(a => a.id).filter(id => getHookSupportedAgents().includes(id));
  for (const agentId of hookAgentIds) {
    const written = await writeHookConfig(projectPath, agentId);
    if (written) success(`${agentId} -> PreToolUse hook`);
  }

  const stopAgentIds = targetAgents.map(a => a.id).filter(id => getStopHookSupportedAgents().includes(id));
  for (const agentId of stopAgentIds) {
    const written = await writeStopHookConfig(projectPath, agentId);
    if (written) success(`${agentId} -> Stop hook`);
  }

  const permAgentIds = targetAgents.map(a => a.id).filter(id => getPermissionSupportedAgents().includes(id));
  for (const agentId of permAgentIds) {
    const written = await writePermissionsConfig(projectPath, agentId);
    if (written) success(`${agentId} -> permissions`);
  }

  // question extension(Pi 专用:注册 alloy-question 工具供 LLM 调用 USER_GATE)
  const questionAgentIds = targetAgents.map(a => a.id).filter(id => getQuestionSupportedAgents().includes(id));
  for (const agentId of questionAgentIds) {
    const written = await writeQuestionConfig(projectPath, agentId);
    if (written) success(`${agentId} -> alloy-question extension`);
  }

  // 9-10. .gitignore + .gitattributes + pre-commit
  section("写入项目资源...");
  await ensureGitignore(projectPath);
  await ensureGitattributes(projectPath);
  await ensurePreCommitHook(projectPath);

  // 11. settings.json(worktree.baseRef 已在 injectAgentConfigs 处理)

  // 12. openspec/config.yaml(main_branch + install_scope + target_agents)
  section("写入主分支配置...");
  const configToWrite = await readProjectConfig(projectPath);
  if (!configToWrite.alloy) configToWrite.alloy = {};
  configToWrite.alloy.main_branch = mainBranch;
  configToWrite.alloy.install_scope = actionPlan.scope;
  configToWrite.alloy.target_agents = actionPlan.targetAgents.map(a => a.id);
  await writeProjectConfig(projectPath, configToWrite);
  success(`openspec/config.yaml -> main_branch: ${mainBranch}, scope: ${actionPlan.scope}, agents: ${actionPlan.targetAgents.length} 个`);

  // 13. 初始 commit(update 模式跳过--如 HEAD unborn,update 不应自动 commit)
  if (!isUpdate && actionPlan.projectResources.find(r => r.resource === "initial-commit")?.action === "install") {
    section("创建初始 commit...");
    try {
      // 设置 git user(若未配置)
      try {
        execSync('git config user.name', { cwd: projectPath, stdio: "pipe" });
      } catch {
        execSync('git config user.name "alloy-init"', { cwd: projectPath, stdio: "pipe" });
        execSync('git config user.email "alloy-init@local"', { cwd: projectPath, stdio: "pipe" });
      }
      // 复用 getInfraCommitTargets 动态推导 agent 目录 + 项目资源
      // (alloy _infra-commit 命令也复用同一逻辑,确保 init 和 change 创建后的基础设施 commit 一致)
      const { getInfraCommitTargets } = await import("../../../core/infra-commit.js");
      const targets = getInfraCommitTargets(projectPath, targetAgents);
      for (const target of targets) {
        try {
          execSync(`git add ${target}`, { cwd: projectPath, stdio: "pipe" });
        } catch {
          // 文件不存在则跳过
        }
      }
      execSync('git commit -m "chore: alloy init 项目初始化"', { cwd: projectPath, stdio: "pipe" });
      success(`已在 ${mainBranch} 分支创建初始 commit`);
    } catch (e) {
      error(`初始 commit 失败: ${(e as Error).message}`);
      process.exit(1);
    }
  }

  // 14. shell 补全(update 模式跳过)
  if (!isUpdate) {
    section("注册 shell 补全...");
    await ensureShellCompletion();
  }

  // 15. 兼容性检查 + 就绪 banner(update 模式跳过--由 updateCommand 步骤 6 做唯一兼容性检查,且 banner 是 init 专用收尾)
  if (!isUpdate) {
    section("兼容性检查...");
    const results = await runHealthCheck(getPackageRoot(), projectPath, scope);
    for (const r of results) {
      check(r.name, `${r.current}(要求 ${r.required})`, r.status);
    }

    banner("✅ Alloy 就绪!");
    const labels = targetAgents.length > 0
      ? targetAgents.map(a => a.label).join(" / ")
      : "目标 Agent";
    info(`在 ${labels} 中输入 /alloy-start <topic> 开始工作\n`);

    // Pi 不支持 worktree + SDD 提醒(Pi bash 工具无 cwd 参数 + 无原生 subagent)
    // 详见 docs/reference/agent-instruction-files.md 第 11 章 Worktree + 第 12 章 Subagent
    if (targetAgents.some(a => a.id === "pi")) {
      warn("⚠️ Pi 不支持 git worktree 隔离:apply 阶段将在 feature 分支执行,不创建 worktree。");
      warn("   原因:Pi bash 工具无 cwd 参数,session cwd 不解绑到 worktree,创建后 commit 会落错分支。");
      warn("⚠️ Pi 不支持 SDD(subagent-driven-development):apply 阶段只能用 executing-plans。");
      warn("   原因:Pi 无原生 subagent(需装 pi-subagents 可选包,alloy 不依赖),SDD 的'分派子 agent'不可用。");
      info("");
    }
  }
}
