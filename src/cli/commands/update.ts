import { readFile, writeFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { deployCommands, deploySchema } from "../../core/skills.js";
import { detectDeployedAgents } from "../../core/agents.js";
import { runHealthCheck } from "../../core/health.js";
import { getPackageRoot } from "../../utils/fs.js";
import { promptConfirm } from "../../utils/prompt.js";
import { color } from "../../utils/format.js";
import type { DeployOptions } from "../../core/types.js";

const CLAUDE_MD_MARKER_START = "<!-- ALLOY-WORKFLOW:START -->";
const CLAUDE_MD_MARKER_END = "<!-- ALLOY-WORKFLOW:END -->";

function isDevMode(): boolean {
  // npm link 下包根目录不是 symlink，但 .git 存在标记了开发环境
  return existsSync(join(getPackageRoot(), ".git"));
}

function detectScope(projectPath: string): "global" | "project" | null {
  const probe = (dir: string) => existsSync(join(dir, "commands", "alloy"));

  // 先检测项目级别
  if (probe(join(projectPath, ".claude"))) return "project";

  // 再检测全局
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  if (probe(join(home, ".claude"))) return "global";

  return null;
}

async function checkLatestVersion(): Promise<string | null> {
  try {
    return execSync("npm view @flyin-ai/alloy version", { stdio: "pipe" })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

export async function updateCommand(projectPath: string): Promise<string[]> {
  const results: string[] = [];

  // 1. 自动检测 scope
  const scope = detectScope(projectPath);
  if (!scope) {
    results.push(`${color.yellow("⚠️")} Alloy 未初始化，请先运行 alloy init`);
    return results;
  }

  // 2. 开发模式 vs 用户模式
  const dev = isDevMode();

  if (dev) {
    console.log("  🔧 开发模式，从本地构建重新部署…");
  } else {
    const pkg = JSON.parse(
      readFileSync(join(getPackageRoot(), "package.json"), "utf-8")
    );
    const currentVersion = pkg.version as string;
    const latest = await checkLatestVersion();

    if (latest && latest !== currentVersion) {
      console.log(`\n  发现新版本: ${color.cyan(`v${latest}`)}（当前 v${currentVersion}）`);

      // 兼容性检查
      console.log("  🩺 兼容性检查…");
      const health = await runHealthCheck(getPackageRoot(), projectPath);
      const warnings = health.filter((h) => h.status !== "pass");
      if (warnings.length > 0) {
        for (const w of warnings) {
          console.log(`     ${color.yellow("⚠")} ${w.name}: ${color.cyan(w.current)}`);
        }
      } else {
        console.log(`     ${color.green("✓")} 兼容性检查通过`);
      }

      // 询问确认
      const doUpdate = await promptConfirm("是否升级 alloy？", false);

      if (doUpdate) {
        try {
          execSync("npm update -g @flyin-ai/alloy", { stdio: "pipe" });
          results.push(`${color.green("✓")} alloy CLI 已升级`);
        } catch {
          results.push(`${color.yellow("⚠️")} CLI 升级失败`);
        }
      } else {
        results.push("  已跳过 CLI 升级");
      }
    } else if (latest) {
      results.push(`${color.green("✓")} Alloy v${currentVersion} 已是最新`);
    } else {
      results.push(`${color.yellow("⚠️")} 无法检查更新（npm registry 不可达）`);
    }
  }

  // 3. 部署 commands
  const deployedAgents = detectDeployedAgents(scope, projectPath);
  if (deployedAgents.length === 0) {
    results.push(`${color.yellow("⚠️")} 未检测到已部署的 Alloy commands，请先运行 alloy init`);
    return results;
  }

  const deployOpts: DeployOptions = {
    scope,
    injectClaudeMd: false,
    projectPath,
    targetAgents: deployedAgents,
  };

  try {
    const paths = await deployCommands(deployOpts);
    results.push(`${color.green("✓")} commands/ → 部署 ${paths.length} 个文件到 ${deployedAgents.length} 个 agent`);
  } catch {
    results.push(`${color.yellow("⚠️")} command 部署失败`);
  }
  try {
    await deploySchema(deployOpts);
    results.push(`${color.green("✓")} schema/ → 已部署`);
  } catch {
    results.push(`${color.yellow("⚠️")} schema 部署失败`);
  }

  // 4. 更新 CLAUDE.md 标记区域
  const claudeMdPath = join(projectPath, "CLAUDE.md");
  if (existsSync(claudeMdPath)) {
    try {
      let content = await readFile(claudeMdPath, "utf-8");
      if (content.includes(CLAUDE_MD_MARKER_START)) {
        const latestFragment = getLatestClaudeMdFragment();
        const startIdx = content.indexOf(CLAUDE_MD_MARKER_START);
        const endIdx = content.indexOf(CLAUDE_MD_MARKER_END);
        if (endIdx > startIdx) {
          content =
            content.slice(0, startIdx) +
            latestFragment +
            content.slice(endIdx + CLAUDE_MD_MARKER_END.length);
          await writeFile(claudeMdPath, content, "utf-8");
          results.push(`${color.green("✓")} CLAUDE.md → Alloy 标记区域已更新`);
        }
      }
    } catch {
      results.push(`${color.yellow("⚠️")} CLAUDE.md 更新失败`);
    }
  }

  return results;
}

function getLatestClaudeMdFragment(): string {
  return [
    "",
    CLAUDE_MD_MARKER_START,
    "## Alloy 工作流",
    "",
    "本项目使用 [Alloy](https://github.com/Rushing0711/alloy) 管理开发工作流。",
    "",
    "常用命令：",
    "- `/alloy-start [topic]` - 智能入口",
    "- `/alloy-plan [name]` - 制品规划",
    "- `/alloy-apply [name]` - 执行实现",
    "- `/alloy-archive [name]` - 归档与收尾",
    "- `/alloy-finish [name]` - 独立收尾",
    "- `/alloy-fix` - Bug 修复",
    "- `/alloy-status [name]` - 查看状态",
    "",
    CLAUDE_MD_MARKER_END,
    "",
  ].join("\n");
}
