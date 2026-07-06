// src/core/agent-config.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentInfo, DeployOptions } from "./types.js";

/**
 * Alloy 推荐的 Claude Code 权限白名单——allow 安全命令,deny 危险命令。
 * 目标:alloy 执行期间减少用户确认,同时保留对危险操作的拦截。
 *
 * 语法适用:Claude Code / CodeBuddy / Pi(均支持 `Bash(cmd *)` 模式匹配)
 */
export const ALLOY_PERMISSIONS: {
  allow: string[];
  deny: string[];
} = {
  allow: [
    // alloy / openspec CLI
    "Bash(alloy *)",
    "Bash(openspec *)",
    // git 安全子集(读 + 安全写)
    "Bash(git add *)",
    "Bash(git commit *)",
    "Bash(git checkout *)",
    "Bash(git branch *)",
    "Bash(git log *)",
    "Bash(git status *)",
    "Bash(git diff *)",
    "Bash(git merge --squash *)",
    "Bash(git worktree *)",
    "Bash(git rev-parse *)",
    "Bash(git rev-list *)",
    "Bash(git remote *)",
    "Bash(git tag *)",
    "Bash(git pull --ff-only *)",
    "Bash(git fetch *)",
    "Bash(git show *)",
    "Bash(git config *)",
    "Bash(git symbolic-ref *)",
    "Bash(git ls-files *)",
    "Bash(git common-dir *)",
    "Bash(git check-ignore *)",
    // 文件系统读
    "Bash(ls *)",
    "Bash(find *)",
    "Bash(cat *)",
    "Bash(head *)",
    "Bash(tail *)",
    "Bash(grep *)",
    "Bash(sort *)",
    "Bash(wc *)",
    "Bash(basename *)",
    "Bash(dirname *)",
    "Bash(realpath *)",
    "Bash(pwd)",
    "Bash(echo *)",
    "Bash(stat *)",
    "Bash(which *)",
    "Bash(env)",
    "Bash(test *)",
    "Bash(date *)",
    // 文件系统写(安全)
    "Bash(mkdir *)",
    "Bash(touch *)",
    "Bash(cd *)",
    // 执行 alloy 相关脚本(skill-precheck 等)
    "Bash(bash .claude/commands/*)",
    "Bash(bash commands/*)",
    "Bash(sh .claude/commands/*)",
    "Bash(sh commands/*)",
    // 文件读写(alloy 工作区)
    "Read(~/.claude/**)",
    "Edit(openspec/**)",
  ],
  deny: [
    // 危险命令(永远拒绝)
    "Bash(git push --force *)",
    "Bash(git push --force-with-lease *)",
    "Bash(git reset --hard *)",
    "Bash(git checkout . *)",
    "Bash(git restore . *)",
    "Bash(git stash drop *)",
    "Bash(git merge --abort *)",
    "Bash(git clean -fd *)",
    "Bash(rm -rf *)",
    "Bash(rm -fr *)",
    // 危险 git 操作(应需确认)
    "Bash(git rebase *)",
    "Bash(git push *)",
  ],
};

/**
 * 支持项目级 permissions 的 agent 配置——alloy init 可项目级注入。
 * 语法:Claude Code / CodeBuddy / Pi 均支持 `Bash(cmd *)` 模式,格式一致(permissions.allow/deny)。
 *
 * 不含的 agent:
 * - Trae:配置文件路径待确认(traecli config,YAML 格式,冒号语法 Bash(cmd:*))
 * - OpenCode:工具级权限(非命令模式),不够精确,不自动配置
 * - Qoder:官网待验证
 * - Cursor:仅网络控制(sandbox.json),不控制命令
 * - Codex / Gemini CLI:全局配置,非项目级
 */
const ALLOY_PERMISSION_CONFIGS: Record<string, string> = {
  "claude-code": ".claude/settings.json",
  "codebuddy": ".codebuddy/settings.json",
  "pi": ".pi/permissions.json",
};

/** 返回支持项目级 permissions 的 agent id 列表 */
export function getPermissionSupportedAgents(): string[] {
  return Object.keys(ALLOY_PERMISSION_CONFIGS);
}

async function injectSettingsFile(
  projectPath: string,
  agent: AgentInfo
): Promise<void> {
  if (!agent.settingsFile || !agent.settingsContent) return;

  const settingsPath = join(projectPath, agent.settingsFile);
  let settings: Record<string, unknown> = {};
  try {
    const raw = await readFile(settingsPath, "utf-8");
    settings = JSON.parse(raw);
  } catch {
    // 文件不存在或解析失败
  }

  // 幂等深合并：把 settingsContent 合并到现有 settings
  for (const [key, value] of Object.entries(agent.settingsContent)) {
    const existing = settings[key];
    if (existing && typeof existing === "object" && !Array.isArray(existing) &&
        value && typeof value === "object" && !Array.isArray(value)) {
      settings[key] = { ...(existing as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      settings[key] = value;
    }
  }

  const dir = join(settingsPath, "..");
  await mkdir(dir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

export async function injectAgentConfigs(opts: DeployOptions): Promise<void> {
  if (opts.targetAgents.length === 0) return;

  // 注入专有配置（每个 agent 各自的 settingsFile，如 .claude/settings.json 的 worktree.baseRef）
  for (const agent of opts.targetAgents) {
    await injectSettingsFile(opts.projectPath, agent);
  }
}

/** 检测指定 agent 是否已有 permissions.allow 配置 */
export async function hasPermissionsConfig(projectPath: string, agentId: string): Promise<boolean> {
  const settingsFile = ALLOY_PERMISSION_CONFIGS[agentId];
  if (!settingsFile) return false;

  const settingsPath = join(projectPath, settingsFile);
  try {
    const raw = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(raw);
    const permissions = settings.permissions;
    return !!(permissions && Array.isArray(permissions.allow) && permissions.allow.length > 0);
  } catch {
    return false;
  }
}

/** 写入 alloy 推荐的 permissions 到指定 agent 的配置文件(幂等合并,不覆盖用户自定义条目) */
export async function writePermissionsConfig(projectPath: string, agentId: string): Promise<boolean> {
  const settingsFile = ALLOY_PERMISSION_CONFIGS[agentId];
  if (!settingsFile) return false;

  const settingsPath = join(projectPath, settingsFile);
  let settings: Record<string, unknown> = {};
  try {
    const raw = await readFile(settingsPath, "utf-8");
    settings = JSON.parse(raw);
  } catch {
    // 文件不存在或解析失败
  }

  // 幂等合并 permissions.allow / permissions.deny
  const existingPermissions = (settings.permissions ?? {}) as { allow?: string[]; deny?: string[] };
  const existingAllow = existingPermissions.allow ?? [];
  const existingDeny = existingPermissions.deny ?? [];

  // 合并:去重(用户自定义条目保留,alloy 推荐条目补充)
  const mergedAllow = Array.from(new Set([...existingAllow, ...ALLOY_PERMISSIONS.allow]));
  const mergedDeny = Array.from(new Set([...existingDeny, ...ALLOY_PERMISSIONS.deny]));

  settings.permissions = { allow: mergedAllow, deny: mergedDeny };

  const dir = join(settingsPath, "..");
  await mkdir(dir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  return true;
}
