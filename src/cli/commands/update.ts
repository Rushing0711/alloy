import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { deployCommands, deploySchema } from "../../core/skills.js";
import { detectDeployedAgents } from "../../core/agents.js";
import { runHealthCheck } from "../../core/health.js";
import { getPackageRoot } from "../../utils/fs.js";
import { promptConfirm } from "../../utils/prompt.js";
import { color } from "../../utils/format.js";
import { section, check, success, info } from "../../utils/output.js";
import type { DeployOptions } from "../../core/types.js";
import { injectAgentConfigs } from "../../core/agent-config.js";
import { readProjectConfig, writeProjectConfig } from "../utils/state.js";

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
    info("🔧 开发模式，从本地构建重新部署…");
  } else {
    const pkg = JSON.parse(
      readFileSync(join(getPackageRoot(), "package.json"), "utf-8")
    );
    const currentVersion = pkg.version as string;
    const latest = await checkLatestVersion();

    if (latest && latest !== currentVersion) {
      section("版本检查");
      info(`发现新版本: v${latest}（当前 v${currentVersion}）`);

      // 兼容性检查
      section("兼容性检查");
      const health = await runHealthCheck(getPackageRoot(), projectPath);
      const warnings = health.filter((h) => h.status !== "pass");
      if (warnings.length > 0) {
        for (const w of warnings) {
          check(w.name, w.current, "warn");
        }
      } else {
        success("兼容性检查通过");
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

  // 读取已记录的注入深度（缺失则兜底 medium）
  const config = await readProjectConfig(projectPath);
  const depth = config.alloy?.inject_depth ?? "medium";

  const deployOpts: DeployOptions = {
    scope,
    injectDepth: depth,
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

  // 4. 重新注入 agent 配置（指令文件 + 专有配置）
  try {
    await injectAgentConfigs(deployOpts, depth);
    results.push(`${color.green("✓")} agent 配置已重新注入（深度: ${depth}）`);
    // 若 config 缺失 inject_depth，补写
    if (!config.alloy?.inject_depth) {
      if (!config.alloy) config.alloy = {};
      config.alloy.inject_depth = depth;
      await writeProjectConfig(projectPath, config);
    }
  } catch {
    results.push(`${color.yellow("⚠️")} agent 配置注入失败`);
  }

  return results;
}
