// src/core/clean.ts
// alloy clean 命令的核心清理逻辑:扫描 init 装的产物 + 执行清理。
// 只清 alloy 注入的部分,保留用户配置。
//
// 反向清理时识别 init 写入的标记:
// - .pre-commit: _pre-commit-check 字样
// - settings.json: hooks.PreToolUse/Stop 的 command 含 _hook-guard/_stop-guard
// - settings.json: permissions 含 ALLOY_PERMISSIONS 条目
// - settings.json: worktree.baseRef === "head"(claude-code 注入)
// - .pi/extensions/alloy-guard.ts / .opencode/plugins/alloy-guard.ts(旧:.opencode/tools/write.ts+edit.ts): _hook-guard 字样
// - openspec/config.yaml: schema: alloy 行 + alloy: block
// - skills-lock.json: npx skills add 创建的锁文件
//
// 不清 .gitignore/.gitattributes(影响甚微,保留用户规则)
import { readdir, rm, readFile, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { getSkillTargetDir } from "./agents.js";
import { ALLOY_PERMISSIONS } from "./agent-config.js";
import { getPackageRoot } from "../utils/fs.js";
import type { AgentInfo } from "./types.js";

// init 写入的 block 标记(见 src/cli/commands/init/execute.ts)
const GITATTRIBUTES_MARKER = "### Alloy: 强制 LF 换行 ###";

export interface CleanPlan {
  scope: "global" | "project";
  /** 将删的 alloy-* skills 目录(绝对路径) */
  alloySkillsPaths: string[];
  /** 将删的 .alloy-version 文件(绝对路径,每个 agent 的 skills 目录下) */
  alloyVersionFiles: string[];
  /** 将删的 opsx 文件/目录(绝对路径) */
  opsxPaths: string[];
  /** 将删的 OpenCode command wrapper 文件(绝对路径,alloy init 装的 /alloy-* 触发器) */
  opencodeCommandWrappers: string[];
  /** 将删的 superpowers skill 名(通过 `skills ls` 检测,executeClean 调 `skills remove` 清理) */
  superpowersSkillNames: string[];
  /** 将删的 skills-lock.json 文件(绝对路径,npx skills add 创建) */
  skillsLockFiles: string[];
  /** 将改/删的 hook 配置文件(绝对路径,仅 project scope) */
  hookConfigs: { file: string; agentId: string }[];
  /** 将改的 permissions 配置文件(绝对路径,仅 project scope) */
  permissionConfigs: { file: string; agentId: string }[];
  /** 将改/删的 .pre-commit(绝对路径,仅 project scope) */
  preCommitFile: string | null;
  /** 将删的 openspec/schemas/alloy 目录(绝对路径,仅 project scope) */
  openspecSchemaDir: string | null;
  /** 将删的 openspec/config.yaml(绝对路径,仅 project scope) */
  openspecConfigFile: string | null;
  /** 将删的空残留配置文件(空 {} 或空文件,旧清理可能留下;仅 project scope) */
  emptyConfigFiles: string[];
}

export interface CleanResult {
  /** 已删除的文件/目录路径 */
  removed: string[];
  /** 已修改的文件路径 */
  modified: string[];
  /** Superpowers npx remove 是否成功(成功则不删文件) */
  superpowersNpxSuccess: boolean;
  /** 清理过程中的错误信息 */
  errors: string[];
}

/** 获取 home 目录(与 cli/index.ts:installCompletion 一致,支持 HOME/USERPROFILE 环境变量) */
function getHome(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

/** base 目录:global 用 home,project 用 projectPath */
function basePath(scope: "global" | "project", projectPath: string): string {
  return scope === "global" ? getHome() : projectPath;
}

/** 扫描指定 skills 目录下的 alloy-* 子目录 */
async function scanAlloySkillsInDir(skillsDir: string): Promise<string[]> {
  if (!existsSync(skillsDir)) return [];
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && e.name.startsWith("alloy-"))
      .map((e) => join(skillsDir, e.name));
  } catch {
    return [];
  }
}

/**
 * 调 `skills ls` 列出已装 skill,解析输出,返回 Superpowers 的 skill 名。
 * 精确识别:读 alloy 包的 vendor/superpowers/skills/ 目录获取 Superpowers 的 skill 名列表(随包发布),
 * `skills ls` 输出中 skill 名在列表里的才是 Superpowers 的--排除用户独立装的 caveman/find-skills 等,
 * 也排除其他包(如 vercel-labs/agent-skills)装到 .agents/skills/ 的 skill。
 * npx 失败(网络问题或 skills 未装)返回空数组。
 */
function scanSuperpowersViaSkillsLs(
  scope: "global" | "project",
  projectPath: string
): string[] {
  const superpowersNames = getSuperpowersSkillNames();
  if (superpowersNames.length === 0) return []; // vendor 目录不存在,无法识别
  const scopeFlag = scope === "global" ? "-g" : "";
  const cmd = `npx skills ls ${scopeFlag}`.trim();
  try {
    const output = execSync(cmd, {
      stdio: "pipe",
      cwd: scope === "global" ? getHome() : projectPath,
    }).toString();
    // 剥离 ANSI 颜色码(skills ls 输出含 \x1b[36m 等转义码,不剥离会导致正则匹配的 skill 名含转义码)
    return parseSuperpowersSkills(stripAnsi(output), superpowersNames);
  } catch {
    return [];
  }
}

/** 剥离 ANSI 颜色码(如 \x1b[36m、\x1b[0m、\x1b[38;5;102m) */
function stripAnsi(output: string): string {
  return output.replace(/\x1b\[[0-9;]*m/g, "");
}

/** 读 vendor/superpowers/skills/ 目录,返回 Superpowers 的 skill 名列表(随 alloy 包发布) */
function getSuperpowersSkillNames(): string[] {
  const vendorDir = join(getPackageRoot(), "vendor", "superpowers", "skills");
  try {
    const entries = readdirSync(vendorDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** 解析 `skills ls` 输出,只收 skill 名在 Superpowers vendor 列表里的(精确识别,不依赖路径) */
function parseSuperpowersSkills(
  output: string,
  superpowersNames: string[]
): string[] {
  const skills: string[] = [];
  const lines = output.split("\n");
  for (const line of lines) {
    // 匹配:  <skill-name>  <path>  Agents: ...
    // 注意:stripAnsi 后行首可能无空白(skills ls 原始输出行首是 ANSI 码,剥离后 skill 名在行首),用 ^\s* 兼容
    const match = line.match(/^\s*(\S+)\s+(~?\/\S+)\s+Agents:/);
    if (match) {
      const [, name] = match;
      if (superpowersNames.includes(name)) {
        skills.push(name);
      }
    }
  }
  return skills;
}

/** 扫描指定 commands/prompts 目录下的 opsx 文件/目录 */
async function scanOpsxInDir(commandsDir: string): Promise<string[]> {
  if (!existsSync(commandsDir)) return [];
  try {
    const entries = await readdir(commandsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.name === "opsx" || e.name.startsWith("opsx-"))
      .map((e) => join(commandsDir, e.name));
  } catch {
    return [];
  }
}

/** 扫描指定 skills 目录下的 openspec-* skill 目录(delivery=both 时 OpenSpec CLI 装的 skill)。
 * 精确识别 openspec- 前缀(不误删 alloy- 前缀的 alloy 自己的 skill)。 */
async function scanOpsxSkillsInDir(skillsDir: string): Promise<string[]> {
  if (!existsSync(skillsDir)) return [];
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && e.name.startsWith("openspec-"))
      .map((e) => join(skillsDir, e.name));
  } catch {
    return [];
  }
}

/** alloy init 装的 OpenCode command wrapper 覆盖的流程 id(与 skills.ts OPENCODE_COMMAND_IDS 一致) */
const OPENCODE_COMMAND_IDS = [
  "start", "plan", "apply", "archive",
  "finish", "fix", "status", "discard",
] as const;

/** 扫描 OpenCode commands 目录,识别 alloy 装的 command wrapper。
 * 精确识别:文件名是 alloy-{8个id}.md 且内容含 `skill({ name: "alloy-` 字样(避免误删用户自定义的 alloy-* command) */
async function scanOpenCodeCommandWrappers(commandsDir: string): Promise<string[]> {
  if (!existsSync(commandsDir)) return [];
  const found: string[] = [];
  for (const id of OPENCODE_COMMAND_IDS) {
    const file = join(commandsDir, `alloy-${id}.md`);
    try {
      const content = await readFile(file, "utf-8");
      if (content.includes(`skill({ name: "alloy-${id}" })`)) {
        found.push(file);
      }
    } catch {
      // 文件不存在或读失败,跳过
    }
  }
  return found;
}

/** 扫描 Pi prompts 目录,识别 alloy 装的 command wrapper。
 * 精确识别:文件名是 alloy-{8个id}.md 且内容含 `.pi/skills/alloy-${id}/SKILL.md` 字样
 * (Pi wrapper 指示 agent read 该路径,避免误删用户自定义的 alloy-* prompt) */
async function scanPiCommandWrappers(promptsDir: string): Promise<string[]> {
  if (!existsSync(promptsDir)) return [];
  const found: string[] = [];
  for (const id of OPENCODE_COMMAND_IDS) {
    const file = join(promptsDir, `alloy-${id}.md`);
    try {
      const content = await readFile(file, "utf-8");
      if (content.includes(`.pi/skills/alloy-${id}/SKILL.md`)) {
        found.push(file);
      }
    } catch {
      // 文件不存在或读失败,跳过
    }
  }
  return found;
}

/** 检测 settings.json 是否含 alloy hook 条目(command 含 _hook-guard 或 _stop-guard) */
function settingsHasAlloyHook(settings: Record<string, unknown>): boolean {
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const checkEntries = (entries: unknown): boolean => {
    if (!Array.isArray(entries)) return false;
    return entries.some((entry: any) => {
      const hookList = entry?.hooks;
      if (!Array.isArray(hookList)) return false;
      return hookList.some(
        (h: any) =>
          typeof h?.command === "string" &&
          (h.command.includes("_hook-guard") ||
            h.command.includes("_stop-guard"))
      );
    });
  };
  return checkEntries(hooks.PreToolUse) || checkEntries(hooks.Stop);
}

/** 把 alloy 的 Bash(cmd *) allow/deny 转为 opencode 的 { "cmd *": "allow"|"deny" } 格式(与 agent-config.ts 一致) */
function toOpenCodeBashPermissions(
  allow: string[],
  deny: string[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of allow) {
    const match = entry.match(/^Bash\((.+)\)$/);
    if (match) result[match[1]] = "allow";
  }
  for (const entry of deny) {
    const match = entry.match(/^Bash\((.+)\)$/);
    if (match) result[match[1]] = "deny";
  }
  return result;
}

/** 检测 settings.json 是否含 alloy permission 条目 */
function settingsHasAlloyPermissions(
  settings: Record<string, unknown>,
  agentId: string
): boolean {
  if (agentId === "opencode") {
    const bash = (settings as any)?.permission?.bash;
    if (!bash || typeof bash !== "object") return false;
    const alloyBashPerms = toOpenCodeBashPermissions(
      ALLOY_PERMISSIONS.allow,
      ALLOY_PERMISSIONS.deny
    );
    return Object.keys(alloyBashPerms).some((key) => bash[key] === alloyBashPerms[key]);
  }
  const permissions = (settings as any)?.permissions;
  if (!permissions) return false;
  const allow: string[] = Array.isArray(permissions.allow) ? permissions.allow : [];
  const deny: string[] = Array.isArray(permissions.deny) ? permissions.deny : [];
  return (
    ALLOY_PERMISSIONS.allow.some((e) => allow.includes(e)) ||
    ALLOY_PERMISSIONS.deny.some((e) => deny.includes(e))
  );
}

/** 按 agent 扫描 hook 配置文件路径(仅 project scope 调用) */
async function scanHookConfigs(
  projectPath: string,
  agents: AgentInfo[]
): Promise<{ file: string; agentId: string }[]> {
  const result: { file: string; agentId: string }[] = [];
  for (const agent of agents) {
    if (agent.id === "claude-code") {
      const settingsFile = ".claude/settings.json";
      const settingsPath = join(projectPath, settingsFile);
      try {
        const raw = await readFile(settingsPath, "utf-8");
        const settings = JSON.parse(raw);
        if (settingsHasAlloyHook(settings)) {
          result.push({ file: settingsPath, agentId: agent.id });
        }
      } catch {
        // 文件不存在或解析失败
      }
    } else if (agent.id === "pi") {
      const extPath = join(projectPath, ".pi", "extensions", "alloy-guard.ts");
      if (existsSync(extPath)) {
        try {
          const content = await readFile(extPath, "utf-8");
          if (content.includes("_hook-guard")) {
            result.push({ file: extPath, agentId: "pi" });
          }
        } catch {
          // 读取失败
        }
      }
      // alloy-question.ts(question 工具 extension,与 alloy-guard.ts 同目录但独立文件)
      const questionPath = join(projectPath, ".pi", "extensions", "alloy-question.ts");
      if (existsSync(questionPath)) {
        try {
          const content = await readFile(questionPath, "utf-8");
          if (content.includes("alloy-question") && content.includes("registerTool")) {
            result.push({ file: questionPath, agentId: "pi" });
          }
        } catch {
          // 读取失败
        }
      }
    } else if (agent.id === "codex") {
      // Codex:hooks.json(与 settings.json 同款 hooks 结构)
      const hooksPath = join(projectPath, ".codex", "hooks.json");
      try {
        const raw = await readFile(hooksPath, "utf-8");
        const settings = JSON.parse(raw);
        if (settingsHasAlloyHook(settings)) {
          result.push({ file: hooksPath, agentId: agent.id });
        }
      } catch {
        // 文件不存在或解析失败
      }
    } else if (agent.id === "opencode") {
      // 新方案:plugin(.opencode/plugins/alloy-guard.ts)
      const pluginPath = join(projectPath, ".opencode", "plugins", "alloy-guard.ts");
      if (existsSync(pluginPath)) {
        try {
          const content = await readFile(pluginPath, "utf-8");
          if (content.includes("_hook-guard")) {
            result.push({ file: pluginPath, agentId: "opencode" });
          }
        } catch {
          // 读取失败
        }
      }
      // 旧方案兼容:custom tool(.opencode/tools/write.ts + edit.ts),迁移前部署的项目
      const oldWritePath = join(projectPath, ".opencode", "tools", "write.ts");
      if (existsSync(oldWritePath)) {
        try {
          const content = await readFile(oldWritePath, "utf-8");
          if (content.includes("_hook-guard")) {
            result.push({ file: oldWritePath, agentId: "opencode" });
          }
        } catch {
          // 读取失败
        }
      }
    }
  }
  return result;
}

/** 按 agent 扫描 permissions 配置文件路径(仅 project scope 调用) */
async function scanPermissionConfigs(
  projectPath: string,
  agents: AgentInfo[]
): Promise<{ file: string; agentId: string }[]> {
  const result: { file: string; agentId: string }[] = [];
  const fileMap: Record<string, string> = {
    "claude-code": ".claude/settings.json",
    pi: ".pi/permissions.json",
    opencode: "opencode.json",
  };
  for (const agent of agents) {
    const settingsFile = fileMap[agent.id];
    if (!settingsFile) continue;
    const settingsPath = join(projectPath, settingsFile);
    try {
      const raw = await readFile(settingsPath, "utf-8");
      const settings = JSON.parse(raw);
      if (settingsHasAlloyPermissions(settings, agent.id)) {
        result.push({ file: settingsPath, agentId: agent.id });
      }
    } catch {
      // 文件不存在或解析失败
    }
  }
  return result;
}

/**
 * 扫描 alloy init 装的产物(不删除),返回清理计划。
 * @param projectPath 项目路径
 * @param scope 清理范围:global 扫 home,project 扫 projectPath
 * @param agents 目标 agent 列表(通常传 KNOWN_AGENTS)
 */
export async function scanForClean(
  projectPath: string,
  scope: "global" | "project",
  agents: AgentInfo[]
): Promise<CleanPlan> {
  const home = getHome();
  const base = basePath(scope, projectPath);

  // 1. Alloy skills:遍历 agent,getSkillTargetDir 推导路径,扫 alloy-* 子目录 + .alloy-version 文件
  const alloySkillsPaths: string[] = [];
  const alloyVersionFiles: string[] = [];
  for (const agent of agents) {
    const skillsDir = getSkillTargetDir(agent, scope, projectPath);
    const found = await scanAlloySkillsInDir(skillsDir);
    alloySkillsPaths.push(...found);
    // .alloy-version 文件(deploySkills 写的版本标记,见 src/core/skills.ts:47)
    const versionFile = join(skillsDir, ".alloy-version");
    if (existsSync(versionFile)) {
      alloyVersionFiles.push(versionFile);
    }
  }

  // 2. opsx:按 agent 扫描 commands/prompts 目录 + skills 目录(delivery=both 时 OpenSpec CLI 同时装 command 和 skill)
  const opsxPaths: string[] = [];
  const opencodeCommandWrappers: string[] = [];
  for (const agent of agents) {
    const agentBase = agent.commandsDir.split("/")[0];
    const commandsSubdir = agent.commandsDir.split("/")[1] || "commands";
    const commandsDir = join(base, agentBase, commandsSubdir);
    opsxPaths.push(...(await scanOpsxInDir(commandsDir)));
    // skills 目录(delivery=both 时 OpenSpec CLI 装 openspec-* skill)
    const skillsDir = getSkillTargetDir(agent, scope, projectPath);
    opsxPaths.push(...(await scanOpsxSkillsInDir(skillsDir)));
    // OpenCode:额外扫 command wrapper(alloy init 装的 /alloy-* 触发器)
    if (agent.id === "opencode") {
      opencodeCommandWrappers.push(...(await scanOpenCodeCommandWrappers(commandsDir)));
    }
    // Pi:扫 command wrapper + global scope 补扫 ~/.pi/agent/prompts/
    // Pi wrapper 装在 .pi/prompts/(project) 或 ~/.pi/agent/prompts/(global)
    // global scope 时 commandsDir 是 ~/.pi/prompts/(OpenSpec CLI 装 opsx),Pi 实际读 ~/.pi/agent/prompts/
    if (agent.id === "pi") {
      const piWrapperDirs = [commandsDir];
      if (scope === "global") {
        const piAgentPrompts = join(home, ".pi", "agent", "prompts");
        piWrapperDirs.push(piAgentPrompts);
        opsxPaths.push(...(await scanOpsxInDir(piAgentPrompts)));
      }
      for (const dir of piWrapperDirs) {
        opencodeCommandWrappers.push(...(await scanPiCommandWrappers(dir)));
      }
    }
  }

  // 3. Superpowers:调 `skills ls` 列出已装 skill,解析输出,识别 Superpowers 的 skill
  // Superpowers 的 skill 装到 .agents/skills/(installSuperpowers 装这里),路径含 .agents/skills/ 的是 Superpowers 的
  // 不用 detectSkill(只检测单个 skill,漏其他 13 个);用 skills ls 一次列出所有
  const superpowersSkillNames = scanSuperpowersViaSkillsLs(scope, projectPath);

  // 5-6. hook/permissions(仅 project scope)
  const hookConfigs =
    scope === "project" ? await scanHookConfigs(projectPath, agents) : [];
  const permissionConfigs =
    scope === "project" ? await scanPermissionConfigs(projectPath, agents) : [];

  // 7. skills-lock.json(npx skills add 创建的锁文件,scope=global 在 home,project 在项目根)
  const skillsLockFiles: string[] = [];
  const lockFile = join(base, "skills-lock.json");
  if (existsSync(lockFile)) {
    skillsLockFiles.push(lockFile);
  }

  // 8. .pre-commit(仅 project scope)
  let preCommitFile: string | null = null;
  if (scope === "project") {
    const pcPath = join(projectPath, ".git", "hooks", "pre-commit");
    try {
      const content = await readFile(pcPath, "utf-8");
      if (content.includes("_pre-commit-check")) {
        preCommitFile = pcPath;
      }
    } catch {
      // 文件不存在
    }
  }

  // 10. openspec(仅 project scope)
  let openspecSchemaDir: string | null = null;
  let openspecConfigFile: string | null = null;
  if (scope === "project") {
    const schemaDir = join(projectPath, "openspec", "schemas", "alloy");
    if (existsSync(schemaDir)) {
      openspecSchemaDir = schemaDir;
    }
    const configPath = join(projectPath, "openspec", "config.yaml");
    try {
      const content = await readFile(configPath, "utf-8");
      if (content.includes("schema: alloy") || /^alloy:/m.test(content)) {
        openspecConfigFile = configPath;
      }
    } catch {
      // 文件不存在
    }
  }

  // 11. 空残留配置文件(alloy 管理的配置文件如果为空 {} /空文件,可能是旧清理残留;仅 project scope)
  const emptyConfigFiles: string[] = [];
  if (scope === "project") {
    const configFiles = [
      join(projectPath, ".claude", "settings.json"),      join(projectPath, ".pi", "permissions.json"),
      join(projectPath, "opencode.json"),
      join(projectPath, "openspec", "config.yaml"),
    ];
    for (const file of configFiles) {
      try {
        const content = (await readFile(file, "utf-8")).trim();
        if (content === "" || content === "{}") {
          emptyConfigFiles.push(file);
        }
      } catch {
        // 文件不存在
      }
    }
  }

  return {
    scope,
    alloySkillsPaths,
    alloyVersionFiles,
    opsxPaths,
    opencodeCommandWrappers,
    superpowersSkillNames,
    skillsLockFiles,
    hookConfigs,
    permissionConfigs,
    preCommitFile,
    openspecSchemaDir,
    openspecConfigFile,
    emptyConfigFiles,
  };
}

// ============ 执行清理辅助函数 ============

/** 从 settings.json 移除 alloy 注入的 hook 条目 + permissions 条目 + worktree.baseRef。
 * 返回 "removed"(文件被删,清理后空)/ "modified"(文件被改)/ "unchanged"(无变化或解析失败) */
async function cleanSettingsJson(
  settingsPath: string,
  agentId: string
): Promise<"removed" | "modified" | "unchanged"> {
  let raw: string;
  try {
    raw = await readFile(settingsPath, "utf-8");
  } catch {
    return "removed"; // 文件不存在,视为已删
  }
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(raw);
  } catch {
    return "unchanged"; // 解析失败,不动
  }

  let modified = false;

  // 1. 移除 alloy hook 条目(PreToolUse + Stop)
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  for (const key of ["PreToolUse", "Stop"]) {
    const entries = hooks[key];
    if (!Array.isArray(entries)) continue;
    let entryModified = false;
    const filtered = entries.filter((entry: any) => {
      const hookList = entry?.hooks;
      if (!Array.isArray(hookList)) return true; // 不识别的格式,保留
      // 移除含 _hook-guard 或 _stop-guard 的 command
      const kept = hookList.filter(
        (h: any) =>
          !(
            typeof h?.command === "string" &&
            (h.command.includes("_hook-guard") ||
              h.command.includes("_stop-guard"))
          )
      );
      if (kept.length === 0) {
        // 整个 entry 没有其他 hook,移除 entry
        entryModified = true;
        return false;
      }
      if (kept.length !== hookList.length) {
        // 有 hook 被移除,更新 entry.hooks
        entryModified = true;
        entry.hooks = kept;
      }
      return true;
    });
    if (entryModified) {
      modified = true;
      if (filtered.length === 0) {
        delete hooks[key];
      } else {
        hooks[key] = filtered;
      }
    }
  }
  if (Object.keys(hooks).length === 0) {
    if (settings.hooks !== undefined) {
      delete settings.hooks;
      modified = true;
    }
  } else {
    settings.hooks = hooks;
  }

  // 2. 移除 alloy permissions
  if (agentId === "opencode") {
    const permission = (settings as any)?.permission;
    const bash = permission?.bash;
    if (bash && typeof bash === "object") {
      const alloyBashPerms = toOpenCodeBashPermissions(
        ALLOY_PERMISSIONS.allow,
        ALLOY_PERMISSIONS.deny
      );
      for (const key of Object.keys(alloyBashPerms)) {
        if (bash[key] === alloyBashPerms[key]) {
          delete bash[key];
          modified = true;
        }
      }
      if (Object.keys(bash).length === 0) {
        delete permission.bash;
        if (Object.keys(permission).length === 0) {
          delete (settings as any).permission;
        }
      }
    }
  } else {
    const permissions = (settings as any)?.permissions;
    if (permissions) {
      const allow: string[] = Array.isArray(permissions.allow)
        ? permissions.allow
        : [];
      const deny: string[] = Array.isArray(permissions.deny)
        ? permissions.deny
        : [];
      const newAllow = allow.filter((e) => !ALLOY_PERMISSIONS.allow.includes(e));
      const newDeny = deny.filter((e) => !ALLOY_PERMISSIONS.deny.includes(e));
      if (newAllow.length !== allow.length || newDeny.length !== deny.length) {
        modified = true;
        if (newAllow.length > 0) {
          permissions.allow = newAllow;
        } else {
          delete permissions.allow;
        }
        if (newDeny.length > 0) {
          permissions.deny = newDeny;
        } else {
          delete permissions.deny;
        }
        if (Object.keys(permissions).length === 0) {
          delete (settings as any).permissions;
        }
      }
    }
  }

  // 3. 移除 alloy 设的 worktree.baseRef(仅 claude-code)
  if (agentId === "claude-code") {
    const worktree = (settings as any)?.worktree;
    if (worktree && worktree.baseRef === "head") {
      delete worktree.baseRef;
      modified = true;
      if (Object.keys(worktree).length === 0) {
        delete (settings as any).worktree;
      }
    }
  }

  if (modified) {
    // 清理后 settings 为空(没有任何 key,如 opencode.json 只剩 {})则删文件
    if (Object.keys(settings).length === 0) {
      await rm(settingsPath, { force: true });
      return "removed";
    }
    await writeFile(
      settingsPath,
      JSON.stringify(settings, null, 2) + "\n",
      "utf-8"
    );
    return "modified";
  }
  return "unchanged";
}

/** 清理 .pre-commit hook 文件:如果只剩 shebang/空内容则删文件,否则移除 alloy 行 */
async function cleanPreCommitHook(
  hookPath: string
): Promise<"removed" | "modified"> {
  let content: string;
  try {
    content = await readFile(hookPath, "utf-8");
  } catch {
    return "removed"; // 文件不存在,视为已删
  }

  const lines = content.split("\n");
  const result: string[] = [];
  for (const line of lines) {
    // 跳过 alloy 注释行(# Alloy pre-commit check / # Alloy pre-commit hook)
    if (/^# Alloy pre-commit (check|hook)$/.test(line)) continue;
    // 跳过 alloy _pre-commit-check 行
    if (/_pre-commit-check/.test(line)) continue;
    result.push(line);
  }

  const newContent = result
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  // 判断剩余内容是否只有 shebang 或为空(shebang 可能无尾换行,用 \n? 兼容)
  const stripped = newContent.replace(/^#![^\n]*\n?/, "").trim();
  if (stripped === "") {
    await rm(hookPath, { force: true });
    return "removed";
  }
  await writeFile(hookPath, newContent + "\n", "utf-8");
  return "modified";
}

/** 从 openspec/config.yaml 移除 alloy 配置(schema: alloy 行 + alloy: block) */
async function cleanOpenspecConfig(
  configPath: string
): Promise<"removed" | "modified"> {
  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch {
    return "removed"; // 文件不存在,视为已删
  }

  const lines = content.split("\n");
  const result: string[] = [];
  let inAlloyBlock = false;
  for (const line of lines) {
    // 移除 schema: alloy 行
    if (/^schema:\s*alloy\s*$/.test(line)) continue;

    // alloy: block 开始(顶级 key,无缩进)
    if (/^alloy:\s*$/.test(line)) {
      inAlloyBlock = true;
      continue;
    }
    if (inAlloyBlock) {
      // 缩进行 -> 跳过(alloy block 内的子 key)
      if (/^\s+/.test(line)) continue;
      // 空行 -> 跳过(block 内的空行)
      if (line === "") continue;
      // 顶级 key(无缩进) -> 结束 alloy block,保留该行
      inAlloyBlock = false;
    }
    result.push(line);
  }

  const newContent = result
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  // 清理后内容为空 -> 删文件(不留空文件)
  if (newContent === "") {
    await rm(configPath, { force: true });
    return "removed";
  }
  await writeFile(configPath, newContent + "\n", "utf-8");
  return "modified";
}

/** 删目录如果为空,并递归删空子目录 + 往上删父目录(到 stopAt 停止);返回是否删了 */
async function removeDirIfEmpty(
  dir: string,
  stopAt?: string
): Promise<boolean> {
  // 不删 stopAt 或其上级
  if (stopAt && (dir === stopAt || !dir.startsWith(stopAt))) return false;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    // 先递归删空子目录(自底向上)
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await removeDirIfEmpty(join(dir, entry.name), stopAt);
      }
    }
    // 重新检查(子目录可能已删)
    const remaining = await readdir(dir, { withFileTypes: true });
    if (remaining.length === 0) {
      await rm(dir, { recursive: true, force: true });
      // 递归检查父目录(到 stopAt 停止)
      const parent = join(dir, "..");
      if (parent !== dir && (!stopAt || parent !== stopAt)) {
        await removeDirIfEmpty(parent, stopAt);
      }
      return true;
    }
  } catch {
    // 目录不存在
  }
  return false;
}

/**
 * 执行清理:按 plan 删除/修改文件。
 * @param projectPath 项目路径
 * @param scope 清理范围
 * @param plan scanForClean 返回的清理计划
 */
export async function executeClean(
  projectPath: string,
  scope: "global" | "project",
  plan: CleanPlan
): Promise<CleanResult> {
  const removed: string[] = [];
  const modified: string[] = [];
  const errors: string[] = [];
  let superpowersNpxSuccess = false;

  // 1. 删 alloy skills 目录
  for (const path of plan.alloySkillsPaths) {
    try {
      await rm(path, { recursive: true, force: true });
      removed.push(path);
    } catch (e) {
      errors.push(`删除失败 ${path}: ${(e as Error).message}`);
    }
  }

  // 2. 删 .alloy-version 文件(deploySkills 写的版本标记,见 src/core/skills.ts:47)
  for (const path of plan.alloyVersionFiles) {
    try {
      await rm(path, { force: true });
      removed.push(path);
    } catch (e) {
      errors.push(`删除 .alloy-version 失败 ${path}: ${(e as Error).message}`);
    }
  }

  // 3. 删 opsx 文件/目录
  for (const path of plan.opsxPaths) {
    try {
      await rm(path, { recursive: true, force: true });
      removed.push(path);
    } catch (e) {
      errors.push(`删除失败 ${path}: ${(e as Error).message}`);
    }
  }

  // 3.1 删 OpenCode command wrapper(alloy init 装的 /alloy-* 触发器)
  for (const path of plan.opencodeCommandWrappers) {
    try {
      await rm(path, { force: true });
      removed.push(path);
    } catch (e) {
      errors.push(`删除 OpenCode command wrapper 失败 ${path}: ${(e as Error).message}`);
    }
  }

  // 4. Superpowers:调 `skills remove <skill...> -g -y` 批量删(scan 阶段已用 skills ls 检测到 skill 名)
  if (plan.superpowersSkillNames.length > 0) {
    try {
      const scopeFlag = scope === "global" ? "-g" : "";
      const cmd = `npx skills remove ${plan.superpowersSkillNames.join(" ")} ${scopeFlag} -y`.trim();
      execSync(cmd, {
        stdio: "pipe",
        cwd: scope === "global" ? getHome() : projectPath,
      });
      superpowersNpxSuccess = true;
    } catch {
      errors.push(
        `Superpowers npx remove 失败,请手动运行: npx skills remove ${plan.superpowersSkillNames.join(" ")}${scope === "global" ? " -g" : ""} -y`
      );
    }
  }

  // 5. 改 hook 配置文件 + permissions 配置文件(合并处理避免重复读写同一个 settings.json)
  // pi 的 hook 是 .pi/extensions/alloy-guard.ts(直接删文件)
  // opencode 的 hook 是 .opencode/plugins/alloy-guard.ts(直接删文件,旧方案 .opencode/tools/write.ts+edit.ts 兼容)
  // claude-code 的 hook 是 settings.json(改文件,移除 alloy hook 条目)
  const configFiles = new Map<string, Set<string>>();
  for (const { file, agentId } of plan.hookConfigs) {
    if (!configFiles.has(file)) configFiles.set(file, new Set());
    configFiles.get(file)!.add(agentId);
  }
  for (const { file, agentId } of plan.permissionConfigs) {
    if (!configFiles.has(file)) configFiles.set(file, new Set());
    configFiles.get(file)!.add(agentId);
  }
  for (const [file, agentIds] of configFiles) {
    // 同一个文件可能有多个 agentId(罕见,如 settings.json 同时被 hook 和 permissions 引用),
    // 取第一个作为处理 agent(同一文件的 agentId 应该一致)
    const agentId = agentIds.values().next().value as string;
    try {
      // pi 扩展文件 / opencode 工具文件:直接删
      if (
        file.endsWith("alloy-guard.ts") ||
        file.endsWith("alloy-question.ts") ||
        file.endsWith(".opencode/tools/write.ts") ||
        file.endsWith(".opencode/tools/edit.ts")
      ) {
        await rm(file, { force: true });
        removed.push(file);
        // opencode 的 write.ts 和 edit.ts 是一对,一起删
        if (file.endsWith("write.ts")) {
          const editPath = join(file, "..", "edit.ts");
          try {
            await rm(editPath, { force: true });
            removed.push(editPath);
          } catch {
            // edit.ts 不存在,忽略
          }
        }
        continue;
      }
      // settings.json:移除 alloy hook 条目 + alloy permissions + worktree.baseRef
      const cleanResult = await cleanSettingsJson(file, agentId);
      if (cleanResult === "removed") {
        removed.push(file);
      } else if (cleanResult === "modified") {
        modified.push(file);
      }
    } catch (e) {
      errors.push(`清理配置失败 ${file}: ${(e as Error).message}`);
    }
  }

  // 6. 删 skills-lock.json(npx skills add 创建的锁文件)
  for (const path of plan.skillsLockFiles) {
    try {
      await rm(path, { force: true });
      removed.push(path);
    } catch (e) {
      errors.push(`删除 skills-lock.json 失败 ${path}: ${(e as Error).message}`);
    }
  }

  // 7. 改/删 .pre-commit
  if (plan.preCommitFile) {
    try {
      const result = await cleanPreCommitHook(plan.preCommitFile);
      if (result === "removed") {
        removed.push(plan.preCommitFile);
      } else {
        modified.push(plan.preCommitFile);
      }
    } catch (e) {
      errors.push(`清理 .pre-commit 失败: ${(e as Error).message}`);
    }
  }

  // 9. 删 openspec/schemas/alloy + 如果 schemas/ 空则递归删
  if (plan.openspecSchemaDir) {
    try {
      await rm(plan.openspecSchemaDir, { recursive: true, force: true });
      removed.push(plan.openspecSchemaDir);
      // 删 alloy 后,如果 schemas/ 为空,递归删(schemas/ -> openspec/ 如果也空)
      const schemasDir = join(plan.openspecSchemaDir, "..");
      if (await removeDirIfEmpty(schemasDir, projectPath)) {
        removed.push(schemasDir);
      }
    } catch (e) {
      errors.push(`删除 openspec schema 失败: ${(e as Error).message}`);
    }
  }

  // 10. 改/删 openspec/config.yaml(清理后空则删文件)
  if (plan.openspecConfigFile) {
    try {
      const result = await cleanOpenspecConfig(plan.openspecConfigFile);
      if (result === "removed") {
        removed.push(plan.openspecConfigFile);
      } else {
        modified.push(plan.openspecConfigFile);
      }
    } catch (e) {
      errors.push(`清理 openspec/config.yaml 失败: ${(e as Error).message}`);
    }
  }

  // 11. 清理后检查 alloy 管理的配置文件,空 {} 或空文件则删(旧代码可能留下空残留)
  // 仅 project scope(global 时这些文件在 home,可能含其他项目配置,不删)
  if (scope === "project") {
    const configFiles = [
      join(projectPath, ".claude", "settings.json"),      join(projectPath, ".pi", "permissions.json"),
      join(projectPath, "opencode.json"),
      join(projectPath, "openspec", "config.yaml"),
    ];
    for (const file of configFiles) {
      try {
        const content = (await readFile(file, "utf-8")).trim();
        if (content === "" || content === "{}") {
          await rm(file, { force: true });
          removed.push(file);
        }
      } catch {
        // 文件不存在
      }
    }
  }

  // 12. 清理后检查空目录并递归删(openspec/ + agent 目录)
  // 递归删:删 .agents/skills/ 后 .agents/ 变空也删,到 projectPath/home 停止
  const base = basePath(scope, projectPath);

  // openspec/ 如果空(specs/changes/config.yaml/schemas 都没了),递归删
  if (scope === "project") {
    const openspecDir = join(projectPath, "openspec");
    if (await removeDirIfEmpty(openspecDir, projectPath)) {
      removed.push(openspecDir);
    }
  }

  // agent 目录(.claude/.agents/.opencode/.pi)如果空,递归删
  // 这些目录可能含用户自定义资源,只在完全为空时删
  const agentDirs = [".claude", ".agents", ".opencode", ".pi"];
  for (const dir of agentDirs) {
    const fullPath = join(base, dir);
    if (await removeDirIfEmpty(fullPath, base)) {
      removed.push(fullPath);
    }
  }

  return {
    removed,
    modified,
    superpowersNpxSuccess,
    errors,
  };
}
