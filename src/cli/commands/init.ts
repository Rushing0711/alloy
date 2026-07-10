import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { detectEnv } from "../../core/detect.js";
import { ensureGitRepo, isHeadUnborn, detectMainBranch } from "../../core/git.js";
import { runHealthCheck } from "../../core/health.js";
import { installOpenSpecCli, initOpenSpecProject } from "../../core/openspec.js";
import { installSuperpowers } from "../../core/superpowers.js";
import { deploySkills, deploySchema } from "../../core/skills.js";
import { injectAgentConfigs, hasPermissionsConfig, writePermissionsConfig, getPermissionSupportedAgents, writeHookConfig, getHookSupportedAgents, writeStopHookConfig, getStopHookSupportedAgents, getHookConfigPath } from "../../core/agent-config.js";
import { KNOWN_AGENTS } from "../../core/agents.js";
import type { AgentInfo, DeployOptions } from "../../core/types.js";
import { getPackageRoot } from "../../utils/fs.js";
import { promptSelect, promptMultiSelect, promptConfirm, promptInput } from "../../utils/prompt.js";
import { readProjectConfig, writeProjectConfig } from "../utils/state.js";
import { section, check, success, error, warn, banner, info } from "../../utils/output.js";

export async function selectScope(passedScope?: string): Promise<"global" | "project"> {
  if (passedScope) return passedScope as "global" | "project";

  return promptSelect("Install scope:", [
    { name: "Project (current directory)", value: "project" },
    { name: "Global (home directory)", value: "global" },
  ], { default: "project" }) as Promise<"global" | "project">;
}

export async function selectTargetAgents(): Promise<AgentInfo[]> {
  // 全部 agent 一次性多选展示,选项后备注 tier(stable/experimental)
  // 8 个一屏显示完,无需分级翻页;备注即告知风险,不再额外确认
  const ids = await promptMultiSelect(
    "选择目标 Agent(空格勾选可多选,回车确认;实验性未充分测试,可能遇到兼容性问题):",
    KNOWN_AGENTS.map((a) => ({
      name: `${a.label}(${a.tier === "stable" ? "stable" : "实验性"})`,
      value: a.id,
    })),
    {
      pageSize: 10,
      validate: (ids: string[]) =>
        ids.length > 0 ? true : "请至少选择一个 AI 工具",
    }
  );

  return KNOWN_AGENTS.filter((a) => ids.includes(a.id));
}

export interface InitOptions extends DeployOptions {}

// Alloy + Superpowers 运行时目录（每次逐条检测缺失并补齐）
const GITIGNORE_RUNTIME_RULES = ["docs/superpowers/", ".claude/worktrees/", ".worktrees/", "worktrees/", ".superpowers/", "skills-lock.json", "*.local.*"];

// AI 开发工具产物（整组追加，以标记检测是否已写入）
const GITIGNORE_AI_TOOLS_BLOCK = `### AI 开发工具产物 ###
.idea/
.vscode/*
!.vscode/extensions.json
.playwright-mcp/
.DS_Store
*.log
logs/`;
const GITIGNORE_AI_TOOLS_MARKER = "### AI 开发工具产物 ###";

export async function ensureGitignore(projectPath: string): Promise<void> {
  const gitignorePath = join(projectPath, ".gitignore");
  let content = "";
  try {
    content = await readFile(gitignorePath, "utf-8");
    if (!content.endsWith("\n")) content += "\n";
  } catch {
    // 文件不存在，稍后创建
  }

  // 运行时规则：逐条检测缺失
  const missingRuntime = GITIGNORE_RUNTIME_RULES.filter((rule) => !content.includes(rule));

  // AI 工具产物：整组检测（标记存在则跳过，避免重复追加取反规则造成混乱）
  const needAiBlock = !content.includes(GITIGNORE_AI_TOOLS_MARKER);

  if (missingRuntime.length === 0 && !needAiBlock) return;

  const sections: string[] = [];
  if (missingRuntime.length > 0) {
    sections.push(`### Alloy + Superpowers 运行时 ###\n${missingRuntime.join("\n")}`);
  }
  if (needAiBlock) {
    sections.push(GITIGNORE_AI_TOOLS_BLOCK);
  }
  const block = `\n${sections.join("\n")}\n`;
  await writeFile(gitignorePath, content + block, "utf-8");
  const total = missingRuntime.length + (needAiBlock ? GITIGNORE_AI_TOOLS_BLOCK.split("\n").length : 0);
  success(`.gitignore → 已追加 ${total} 条规则`);
}

/** 确保 .gitattributes 含 LF 强制规则——避免 Windows 上 git autocrlf 把 LF 转 CRLF */
export async function ensureGitattributes(projectPath: string): Promise<void> {
  const gitattributesPath = join(projectPath, ".gitattributes");
  const lfRule = "* text=auto eol=lf";
  let content = "";
  try {
    content = await readFile(gitattributesPath, "utf-8");
    if (content.includes(lfRule)) return; // 已有规则,跳过
    if (!content.endsWith("\n")) content += "\n";
  } catch {
    // 文件不存在,稍后创建
  }

  const block = `\n### Alloy: 强制 LF 换行(避免 Windows CRLF 混入) ###\n${lfRule}\n`;
  await writeFile(gitattributesPath, content + block, "utf-8");
  success(".gitattributes → * text=auto eol=lf");
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
      return; // 路径正确,幂等跳过
    }
    // 路径过时,替换 _pre-commit-check 行
    const updated = existing.replace(/node\s+\S+\s+_pre-commit-check/g, alloyCheck);
    await writeFile(hookPath, updated, "utf-8");
    chmodSync(hookPath, "755");
    return;
  }

  // 有用户自己的 hook,追加 alloy 检查
  if (existing.trim()) {
    const appended = existing.trimEnd() + `\n\n# Alloy pre-commit check(兜底 PreToolUse hook 盲区)\n${alloyCheck}\n`;
    await writeFile(hookPath, appended, "utf-8");
    chmodSync(hookPath, "755");
    return;
  }

  // 文件不存在,创建
  await mkdir(join(hookPath, ".."), { recursive: true });
  const hookContent = `#!/bin/sh\n# Alloy pre-commit hook:兜底 PreToolUse hook 盲区(agent 用 Bash 写文件绕过 Write/Edit)\n${alloyCheck}\n`;
  await writeFile(hookPath, hookContent, "utf-8");
  chmodSync(hookPath, "755");
}

export async function initCommand(opts: InitOptions): Promise<void> {
  // 1. 环境检测（detectEnv 是同步操作，无需 spinner）
  section("检测环境...");
  const env = detectEnv();
  check("Node.js", env.nodeVersion, "pass");
  check("git", env.gitInstalled ? "已安装" : "未安装", env.gitInstalled ? "pass" : "fail");

  if (!env.gitInstalled) {
    error("❌ 缺少必要依赖，请先安装 git");
    process.exit(1);
    return;
  }

  // 1.5 HOME 拦截——拒绝在用户主目录初始化（scope 不影响此判断，projectPath 始终不能是 $HOME）
  const resolved = resolve(opts.projectPath);
  const home = resolve(homedir());
  const isHome =
    (process.platform === "win32" || process.platform === "darwin")
      ? resolved.toLowerCase() === home.toLowerCase()
      : resolved === home;
  if (isHome) {
    error("⛔ 拒绝在用户主目录初始化 Alloy");
    info("当前目录是 $HOME，初始化会在主目录写入 openspec/、.gitignore 等文件，并可能将整个主目录变成 git 仓库。");
    info("请先 cd 到具体项目目录后再运行 alloy init。");
    process.exit(1);
    return;
  }

  const hasClaudeCode = opts.targetAgents.some(a => a.id === "claude-code");

  // ============ 阶段 1：采集（不改变项目目录）============
  section("采集项目状态...");

  // 1.6 检测 git 仓库状态（不执行 git init，仅检测）
  let gitExists = false;
  try {
    execSync("git rev-parse --git-dir", { cwd: opts.projectPath, stdio: "pipe" });
    gitExists = true;
  } catch {
    gitExists = false;
  }
  check("git 仓库", gitExists ? "已存在" : "不存在（将执行 git init）", "pass");

  // 1.7 检测 HEAD 状态（是否 unborn）
  let headUnborn = true;
  if (gitExists) {
    headUnborn = isHeadUnborn(opts.projectPath);
  }
  // 非 git 仓库视为 unborn（git init 后默认 unborn）

  // 1.8 读取现有 config 的 main_branch
  const existingConfig = await readProjectConfig(opts.projectPath);
  const existingMainBranch = (existingConfig.alloy as Record<string, unknown>)?.main_branch as string | undefined;

  // 1.9 主分支确认
  let confirmedMainBranch: string;
  if (existingMainBranch) {
    check("主分支", `已配置: ${existingMainBranch}（跳过确认）`, "pass");
    confirmedMainBranch = existingMainBranch;
  } else {
    const detected = gitExists ? detectMainBranch(opts.projectPath) : null;
    const defaultBranch = detected || "main";

    // USER_GATE 1：确认主分支
    const branchChoice = await promptSelect(
      `确认主分支名（当前 git 默认: ${defaultBranch}）：`,
      [
        { name: `${defaultBranch}（检测值）`, value: defaultBranch },
        { name: "自定义分支名", value: "__custom__" },
      ],
      { default: defaultBranch }
    );

    if (branchChoice === "__custom__") {
      confirmedMainBranch = await promptInput("请输入主分支名：", {
        validate: (v: string) => v.trim().length > 0 ? true : "分支名不能为空",
      });
    } else {
      confirmedMainBranch = branchChoice;
    }
  }

  // 1.9.1 非 0 commit 项目校验主分支已存在——避免 config 记录不存在分支导致 finish 卡死
  if (gitExists && !headUnborn) {
    let branchMissing = false;
    let allBranches = "";
    try {
      const branchList = execSync(`git branch --list ${confirmedMainBranch}`, {
        cwd: opts.projectPath,
        encoding: "utf-8",
        stdio: "pipe",
      }).trim();
      if (!branchList) {
        branchMissing = true;
        try {
          allBranches = execSync("git branch", {
            cwd: opts.projectPath,
            encoding: "utf-8",
            stdio: "pipe",
          }).trim();
        } catch {
          // 忽略
        }
      }
    } catch {
      // git branch 命令失败视为校验通过（不阻断 init，后续部署阶段会暴露真实问题）
    }
    if (branchMissing) {
      error(`⛔ 主分支 '${confirmedMainBranch}' 不存在于当前仓库`);
      if (allBranches) info(`仓库现有分支：\n${allBranches}`);
      info("请选择已存在的分支作为主分支，或先创建该分支后再运行 alloy init");
      process.exit(1);
      return;
    }
  }

  // 1.10 构造执行清单
  const willGitInit = !gitExists;
  const willCommit = headUnborn;  // unborn 时才 commit

  // 1.9.3 权限白名单配置(可选,减少执行确认)——支持项目级 permissions 的 agent
  // 支持:Claude Code / CodeBuddy / Pi(语法一致,Bash(cmd *))
  // 不支持:Trae(配置文件路径待确认)/ OpenCode(工具级,不精确)/ Qoder(待验证)/ Cursor(仅网络)/ Codex / Gemini CLI(全局)
  let configurePermissions = false;
  const supportedAgents = opts.targetAgents
    .map(a => a.id)
    .filter(id => getPermissionSupportedAgents().includes(id));
  const permissionAgentLabels = opts.targetAgents
    .filter(a => supportedAgents.includes(a.id))
    .map(a => a.label);

  if (supportedAgents.length > 0) {
    // 检测是否有 agent 已有 permissions 配置
    const existingChecks = await Promise.all(
      supportedAgents.map(id => hasPermissionsConfig(opts.projectPath, id))
    );
    const hasAnyExisting = existingChecks.some(Boolean);
    const agentListStr = permissionAgentLabels.join(" / ");

    if (hasAnyExisting) {
      // 重复执行:已有配置,问是否更新(幂等合并)
      const choice = await promptSelect(
        `检测到 ${agentListStr} 已有 permissions 配置。是否更新(幂等合并 alloy 推荐条目,不覆盖自定义)?`,
        [
          { name: "更新(合并 alloy 推荐的 allow/deny)", value: "update" },
          { name: "跳过(保留现有配置)", value: "skip" },
        ],
        { default: "skip" }
      );
      configurePermissions = (choice === "update");
    } else {
      // 首次配置
      configurePermissions = await promptConfirm(
        `\n是否配置 ${agentListStr} 权限白名单(allow alloy/git/openspec 等命令,deny 危险命令,减少执行确认)?`,
        true
      );
    }
  }

  // USER_GATE 2：确认执行清单
  section("即将执行以下操作");
  info("文件部署：");
  for (const agent of opts.targetAgents) {
    const agentBase = agent.commandsDir.split("/")[0];
    info(`  + ${agentBase}/skills/alloy-*/         （新建/更新）`);
  }
  if (hasClaudeCode) {
    info("  + .claude/commands/opsx/          （新建/更新）");
  }
  for (const agent of opts.targetAgents) {
    if (agent.id === "claude-code") continue; // 已在上面显示
    const agentBase = agent.commandsDir.split("/")[0];
    info(`  + ${agentBase}/commands/opsx/          （新建/更新）`);
  }
  info(`  + openspec/config.yaml            （新建/更新，含 main_branch: ${confirmedMainBranch}）`);
  info("  + openspec/schemas/alloy/         （新建/更新）");
  if (hasClaudeCode) {
    info("  + .claude/settings.json           （新建/更新，worktree.baseRef: head）");
  }
  const hookAgents = opts.targetAgents.filter(a => getHookSupportedAgents().includes(a.id));
  for (const agent of hookAgents) {
    info(`  + hook 闸门                         （${agent.label}: ${getHookConfigPath(agent.id)},alloy _hook-guard 真闸门）`);
  }
  if (configurePermissions && supportedAgents.length > 0) {
    info(`  + 权限白名单                         （${permissionAgentLabels.join(" / ")} 的 permissions.allow/deny）`);
  }
  info("  + .gitignore                      （新建/追加 Alloy 运行时规则）");
  info("  + .gitattributes                  （新建/追加 * text=auto eol=lf，避免 Windows CRLF）");
  info("");
  info("Git 操作：");
  if (willGitInit) {
    info("  + git init                        （当前不是 git 仓库）");
  }
  if (willCommit) {
    const agentBases = [...new Set(opts.targetAgents.map(a => a.commandsDir.split("/")[0]))];
    info(`  + git add ${agentBases.join(" ")} .gitignore .gitattributes openspec/config.yaml openspec/schemas/`);
    info(`  + git commit -m "chore: alloy init 项目初始化"`);
    info(`    （仓库无任何 commit，将在 ${confirmedMainBranch} 分支创建初始 commit，锁定 main 分支）`);
  } else {
    info("  （仓库已有 commit，不自动提交——alloy 部署文件留工作目录，由你自行 commit）");
  }
  info("");
  info(`主分支: ${confirmedMainBranch}`);

  const confirmed = await promptConfirm("\n确认执行以上操作？", !existingMainBranch);
  if (!confirmed) {
    info("✗ 已取消初始化，项目未发生任何变化");
    process.exit(0);
    return;
  }

  // ============ 阶段 2：执行（用户确认后）============

  // 2. 确保 git 仓库就绪
  section("初始化 git 仓库...");
  if (gitExists) {
    check("git 仓库", "已存在", "pass");
  } else {
    const gitResult = ensureGitRepo(opts.projectPath, confirmedMainBranch);
    if (gitResult === "initialized") {
      check("git 仓库", `原无仓库，本次已初始化（初始分支: ${confirmedMainBranch}）`, "pass");
    } else {
      error("git init 失败，请检查目录权限或磁盘空间");
      process.exit(1);
      return;
    }
  }

  // 3. 安装 OpenSpec CLI（npm 全局包）
  section("安装 OpenSpec CLI...");
  const openspecResult = await installOpenSpecCli();
  if (openspecResult === "installed") {
    success("@fission-ai/openspec@1 已安装");
  } else if (openspecResult === "failed") {
    error("OpenSpec CLI 安装失败");
    process.exit(1);
    return;
  }
  // "skipped" — 函数内部已输出跳过信息

  // 4. 初始化 OpenSpec 项目结构（openspec/ 目录 + .claude/commands/opsx/）
  section("初始化 OpenSpec 项目结构...");
  const initResult = await initOpenSpecProject(opts.projectPath, opts.scope, opts.targetAgents);
  if (initResult === "failed") {
    error("OpenSpec 项目初始化失败");
    process.exit(1);
    return;
  }

  // 5. 安装 Superpowers
  section("安装 Superpowers...");
  const claudeAgent = opts.targetAgents.find(a => a.id === "claude-code");
  const superpowersResult = await installSuperpowers(opts.scope, claudeAgent, opts.projectPath);
  if (superpowersResult.status === "installed") {
    success("Superpowers 已安装");
  } else if (superpowersResult.status === "failed") {
    warn("Superpowers 安装失败，请稍后手动运行 alloy init 重试");
  } else if (superpowersResult.status === "skipped") {
    const versionInfo = superpowersResult.version ? ` v${superpowersResult.version}` : "";
    const locationInfo = superpowersResult.location ? `（${superpowersResult.location}）` : "";
    success(`Superpowers${versionInfo} 已安装${locationInfo}，跳过`);
  }

  // 6. 部署 Alloy skills
  section("部署 Alloy skills...");
  if (opts.targetAgents.length === 0) {
    warn("未选择任何 AI 工具，跳过 skill 部署");
  } else {
    try {
      const paths = await deploySkills(opts);
      for (const p of paths) {
        success(p);
      }
    } catch (e) {
      error(`skill 部署失败: ${(e as Error).message}`);
      process.exit(1);
      return;
    }
  }
  const schemaPath = await deploySchema(opts);
  success(`项目 schema → ${schemaPath}`);

  // 7. 确保 .gitignore 包含 Alloy 运行时目录 + .gitattributes 强制 LF
  await ensureGitignore(opts.projectPath);
  await ensureGitattributes(opts.projectPath);
  await ensurePreCommitHook(opts.projectPath);

  // 7.5 注入 agent 专有配置（如 .claude/settings.json 的 worktree.baseRef）
  section("注入 agent 专有配置...");
  try {
    await injectAgentConfigs(opts);
    if (hasClaudeCode) success(".claude/settings.json → worktree.baseRef: head");
  } catch (e) {
    warn(`agent 配置注入失败: ${(e as Error).message}`);
  }

  // 7.6 写入权限白名单(如果用户选了)——对每个支持且已安装的 agent 写配置
  if (configurePermissions && supportedAgents.length > 0) {
    section("写入权限白名单...");
    for (const agentId of supportedAgents) {
      const agentLabel = opts.targetAgents.find(a => a.id === agentId)?.label ?? agentId;
      try {
        const written = await writePermissionsConfig(opts.projectPath, agentId);
        if (written) {
          success(`${agentLabel} → permissions.allow/deny`);
        }
      } catch (e) {
        warn(`${agentLabel} 权限白名单写入失败: ${(e as Error).message}`);
      }
    }
  }

  // 7.7 写入 PreToolUse hook(真闸门)--对支持 hook 的 agent 自动装(claude-code/codex settings.json,pi 扩展,opencode custom tool)
  const hookSupportedAgentIds = opts.targetAgents
    .map(a => a.id)
    .filter(id => getHookSupportedAgents().includes(id));
  if (hookSupportedAgentIds.length > 0) {
    section("写入 PreToolUse hook...");
    for (const agentId of hookSupportedAgentIds) {
      const agentLabel = opts.targetAgents.find(a => a.id === agentId)?.label ?? agentId;
      try {
        const written = await writeHookConfig(opts.projectPath, agentId);
        if (written) {
          success(`${agentLabel} -> ${getHookConfigPath(agentId)}`);
        }
      } catch (e) {
        warn(`${agentLabel} hook 写入失败: ${(e as Error).message}`);
      }
    }
  }

  // 7.8 写入 Stop hook(检测文本输出代替 AskUserQuestion)--对支持 Stop hook 的 agent 自动装(仅 claude-code)
  const stopHookSupportedAgentIds = opts.targetAgents
    .map(a => a.id)
    .filter(id => getStopHookSupportedAgents().includes(id));
  if (stopHookSupportedAgentIds.length > 0) {
    section("写入 Stop hook...");
    for (const agentId of stopHookSupportedAgentIds) {
      const agentLabel = opts.targetAgents.find(a => a.id === agentId)?.label ?? agentId;
      try {
        const written = await writeStopHookConfig(opts.projectPath, agentId);
        if (written) {
          success(`${agentLabel} -> hooks.Stop (alloy _stop-guard)`);
        }
      } catch (e) {
        warn(`${agentLabel} Stop hook 写入失败: ${(e as Error).message}`);
      }
    }
  }

  // 8.5 写入 openspec/config.yaml 的 main_branch
  section("写入主分支配置...");
  const configToWrite = await readProjectConfig(opts.projectPath);
  if (!configToWrite.alloy) configToWrite.alloy = {};
  (configToWrite.alloy as Record<string, unknown>).main_branch = confirmedMainBranch;
  await writeProjectConfig(opts.projectPath, configToWrite);
  success(`openspec/config.yaml → main_branch: ${confirmedMainBranch}`);

  // 8.6 若 HEAD unborn，创建初始 commit 锁定 main 分支
  if (willCommit) {
    section("创建初始 commit（锁定主分支）...");
    try {
      // 设置 git user（若未配置）
      try {
        execSync('git config user.name', { cwd: opts.projectPath, stdio: "pipe" });
      } catch {
        execSync('git config user.name "alloy-init"', { cwd: opts.projectPath, stdio: "pipe" });
        execSync('git config user.email "alloy-init@local"', { cwd: opts.projectPath, stdio: "pipe" });
      }

      // 若 gitExists=true（用户曾 git init 但无 commit），git init -b 未被执行过，
      // HEAD 可能指向默认 main 与用户确认的主分支不一致。需用 symbolic-ref 调整。
      // 若 gitExists=false（alloy init 执行了 git init -b），HEAD 已正确，跳过。
      if (gitExists) {
        try {
          const currentHeadBranch = execSync("git symbolic-ref --short HEAD", {
            cwd: opts.projectPath,
            encoding: "utf-8",
            stdio: "pipe",
          }).trim();
          if (currentHeadBranch !== confirmedMainBranch) {
            execSync(`git symbolic-ref HEAD refs/heads/${confirmedMainBranch}`, {
              cwd: opts.projectPath,
              stdio: "pipe",
            });
            info(`ℹ HEAD 已从 ${currentHeadBranch} 调整为 ${confirmedMainBranch}（与配置对齐）`);
          }
        } catch {
          // symbolic-ref 失败不阻断——继续用默认 HEAD，commit 仍会落在某分支
        }
      }
      // 逐个 add，避免某个文件不存在导致整条 git add 失败
      const addTargets = [".claude/", ".gitignore", ".gitattributes", "openspec/config.yaml", "openspec/schemas/"];
      for (const target of addTargets) {
        try {
          execSync(`git add ${target}`, { cwd: opts.projectPath, stdio: "pipe" });
        } catch {
          // 文件不存在则跳过
        }
      }
      execSync('git commit -m "chore: alloy init 项目初始化"', {
        cwd: opts.projectPath,
        stdio: "pipe",
      });
      success(`✓ 已在 ${confirmedMainBranch} 分支创建初始 commit，main 分支诞生`);
    } catch (e) {
      const err = e as { stderr?: Buffer; message: string };
      const stderr = err.stderr?.toString() ?? "";
      error(`初始 commit 失败: ${err.message}${stderr ? `\n${stderr}` : ""}`);
      info("alloy 部署文件已写入工作目录，但 main 分支未锁定。");
      info("请手动执行 git add + git commit 完成初始化。");
      process.exit(1);
      return;
    }
  } else {
    info("ℹ 仓库已有 commit，alloy 部署文件留工作目录，请自行审查并 commit：");
    info("    git status");
    info("    git add .claude/ openspec/ .gitignore");
    info('    git commit -m "chore: alloy init 项目初始化"');
  }

  // 9. 兼容性检查
  section("兼容性检查...");
  const packageDir = getPackageRoot();
  const results = await runHealthCheck(packageDir, opts.projectPath, opts.scope);
  for (const r of results) {
    check(r.name, `${r.current}（要求 ${r.required}）`, r.status);
  }

  // 10. 自动注册 shell 补全（失败不阻断 init）
  section("注册 shell 补全...");
  try {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    const shell = process.env.SHELL || "";
    let completionLine = "source <(alloy completion bash)";
    let rcFile: string | null = null;

    if (shell.includes("zsh")) {
      rcFile = join(home, ".zshrc");
      completionLine = "source <(alloy completion zsh)";
    } else if (shell.includes("bash")) {
      rcFile = join(home, ".bashrc");
      completionLine = "source <(alloy completion bash)";
    }

    if (rcFile) {
      let rcContent = "";
      try {
        rcContent = await readFile(rcFile, "utf-8");
      } catch {
        // 文件不存在，稍后创建
      }
      if (!rcContent.includes("alloy completion")) {
        const block = [
          "",
          "# Alloy shell 补全 — Tab 自动补全 alloy 命令",
          completionLine,
          "",
        ].join("\n");
        await writeFile(
          rcFile,
          rcContent.trimEnd() + block,
          "utf-8"
        );
        success(`shell 补全已注册 → ${rcFile}`);
      } else {
        success("shell 补全已存在，跳过");
      }
    } else {
      warn("未检测到 bash/zsh，跳过补全注册");
    }
  } catch {
    // 注册失败不阻断 init，静默忽略
  }

  banner("✅ Alloy 就绪！");
  const labels = opts.targetAgents.length > 0
    ? opts.targetAgents.map(a => a.label).join(" / ")
    : "目标 Agent";
  info(`在 ${labels} 中输入 /alloy-start <topic> 开始工作\n`);
}
