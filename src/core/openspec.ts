import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync, cpSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { checkOpenSpec } from "./health.js";
import { loadCompat } from "./compat.js";
import { getPackageRoot } from "../utils/fs.js";
import { detectSkill } from "./detect-installations.js";
import { promptConfirm } from "../utils/prompt.js";
import type { AgentInfo } from "./types.js";

function createCustomProfile(): { env: NodeJS.ProcessEnv; cleanup: () => void } {
  const configHome = mkdtempSync(join(tmpdir(), "alloy-openspec-profile-"));
  const openspecConfigDir = join(configHome, "openspec");
  mkdirSync(openspecConfigDir, { recursive: true });

  const config = {
    featureFlags: {},
    profile: "custom",
    // delivery: both --同时装 command 和 skill(OpenSpec CLI 默认值)。
    // 原因:各 agent 的 command/skill 机制不同--
    //   Claude Code: command 合并进 skill,agent 用 Skill 工具能加载两者
    //   OpenCode/Pi: command 和 skill 分开,agent 的 skill 工具只加载 SKILL.md
    // 装 both 后,能用 command 的用 command(Claude Code),能用 skill 的用 skill(OpenCode agent 调 skill 工具)
    delivery: "both",
    workflows: [
      "propose", "explore", "new", "continue", "apply", "ff",
      "sync", "archive", "bulk-archive", "verify", "onboard",
    ],
  };
  writeFileSync(
    join(openspecConfigDir, "config.json"),
    JSON.stringify(config, null, 2) + "\n",
    "utf-8",
  );

  return {
    env: { ...process.env, XDG_CONFIG_HOME: configHome },
    cleanup: () => rmSync(configHome, { recursive: true, force: true }),
  };
}

export async function installOpenSpecCli(): Promise<"installed" | "skipped" | "failed"> {
  const packageDir = getPackageRoot();
  const config = await loadCompat(packageDir);
  const dep = checkOpenSpec(config.compatible.openspec);

  if (dep.installed && dep.compatible) {
    console.log(`     ℹ OpenSpec CLI ${dep.version} 已安装`);
    const overwrite = await promptConfirm("     是否覆盖安装？", false);
    if (!overwrite) {
      console.log(`     ✓ OpenSpec CLI ${dep.version} 已安装，跳过`);
      return "skipped";
    }
  }

  if (dep.installed && !dep.compatible) {
    console.log(
      `     ⚠ OpenSpec ${dep.version} 不满足要求 ${config.compatible.openspec}，重新安装...`
    );
  }

  try {
    execSync("npm install -g @fission-ai/openspec@1", {
      stdio: "pipe",
      cwd: process.cwd(),
    });
    return "installed";
  } catch {
    return "failed";
  }
}

export async function initOpenSpecProject(
  projectPath: string,
  scope: "global" | "project",
  agents?: AgentInfo[],
  force?: boolean
): Promise<"initialized" | "skipped" | "failed"> {
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  const targetPath = scope === "global" ? home : projectPath;
  const label = scope === "global" ? "全局" : "项目";

  // 检测已有 OpenSpec 安装（按每个 agent 独立检测，仅检测 skill）
  // force 模式跳过确认（用户已在 display 阶段确认整体计划）
  if (!force && agents && agents.length > 0) {
    let hasExisting = false;
    for (const agent of agents) {
      const skillDetected = detectSkill("openspec-explore", agent, projectPath);
      if (skillDetected.found) {
        hasExisting = true;
        console.log(`     ℹ OpenSpec 已安装（${agent.label}：skills: ✓（${skillDetected.path}））`);
      }
    }
    if (hasExisting) {
      const overwrite = await promptConfirm("     openspec init 可能覆盖现有文件，继续？", false);
      if (!overwrite) {
        console.log("     ✓ 跳过 OpenSpec 项目初始化");
        return "skipped";
      }
    }
  }

  const TOOL_MAP: Record<string, string> = {
    "claude-code": "claude",    "opencode": "opencode",
    "pi": "pi",    "codex": "codex",
  };
  const tools = agents && agents.length > 0
    ? agents.map(a => TOOL_MAP[a.id] ?? "claude").join(",")
    : "claude";

  const profile = createCustomProfile();
  try {
    execSync(
      `openspec init ${JSON.stringify(targetPath)} --tools ${tools} --profile custom`,
      { stdio: "pipe", timeout: 120_000, env: profile.env },
    );
    console.log(`     ✓ openspec init 完成（${label}）`);
    // openspec CLI 把 codex 的 opsx skills 装到 .codex/skills/(过时路径),
    // 同步到 codex 实际加载的共享目录 .agents/skills/(见 syncCodexOpenSpecSkills)
    if (agents?.some(a => a.id === "codex")) {
      syncCodexOpenSpecSkills(targetPath);
    }
    return "initialized";
  } catch (error) {
    console.error(`     ✗ openspec init 失败: ${(error as Error).message}`);
    return "failed";
  } finally {
    profile.cleanup();
  }
}

/**
 * openspec CLI 1.6/1.7 的 codex adapter 把 opsx skills 装到 <root>/.codex/skills/
 * (config.js `skillsDir: '.codex'`,沿用旧版实验路径)。
 * codex 官方规范加载 .agents/skills/(REPO)与 ~/.agents/skills/(USER),
 * `.codex/skills/` 不在加载路径(实测 0.146.0:$alloy-start 从 .agents/skills/ 加载)。
 * 这里把 openspec-* skills 同步复制到共享目录,让 codex 能加载 opsx skills。
 * 幂等:目标已存在则覆盖(openspec 重装可能更新内容)。
 * 证据:learn.chatgpt.com/docs/build-skills(加载位置表)+ 实测
 */
export function syncCodexOpenSpecSkills(baseDir: string): void {
  const src = join(baseDir, ".codex", "skills");
  if (!existsSync(src)) return;
  const dest = join(baseDir, ".agents", "skills");
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("openspec-")) continue;
    const destDir = join(dest, entry.name);
    if (existsSync(destDir)) {
      rmSync(destDir, { recursive: true, force: true });
    }
    cpSync(join(src, entry.name), destDir, { recursive: true });
  }
}

/**
 * 刷新 opsx commands（调 openspec update）。
 * targetPath 与 initOpenSpecProject 一致：scope=global 时 home，project 时 projectPath。
 */
export async function updateOpenSpecCommands(
  projectPath: string,
  agents: AgentInfo[],
  scope: "global" | "project"
): Promise<"updated" | "skipped" | "failed"> {
  if (agents.length === 0) return "skipped";

  const home = process.env.HOME || process.env.USERPROFILE || "~";
  const targetPath = scope === "global" ? home : projectPath;

  // openspec update 只支持 --force,不支持 --tools/--profile(那是 openspec init 的选项)。
  // update 基于项目已有 openspec 配置 + XDG_CONFIG_HOME 下的 profile config 识别 tools,
  // 不需要也不接受 --tools/--profile。此前误传 --tools 导致 "unknown option '--tools'" 失败。
  const profile = createCustomProfile();
  try {
    execSync(
      `openspec update ${JSON.stringify(targetPath)}`,
      { stdio: "pipe", timeout: 120_000, env: profile.env },
    );
    // 同 initOpenSpecProject:同步 codex 的 opsx skills 到共享目录
    if (agents.some(a => a.id === "codex")) {
      syncCodexOpenSpecSkills(targetPath);
    }
    return "updated";
  } catch {
    return "failed";
  } finally {
    profile.cleanup();
  }
}
