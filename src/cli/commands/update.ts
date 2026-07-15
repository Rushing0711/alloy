import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { runHealthCheck } from "../../core/health.js";
import { getPackageRoot } from "../../utils/fs.js";
import { promptConfirm } from "../../utils/prompt.js";
import { color } from "../../utils/format.js";
import { section, check, success, info } from "../../utils/output.js";
import { readProjectConfig } from "../utils/state.js";
import { plan } from "./init/plan.js";
import { displayAndConfirm } from "./init/display.js";
import { execute } from "./init/execute.js";
import { collectForUpdate } from "./init/collect.js";
import { installOpenSpecCli, updateOpenSpecCommands } from "../../core/openspec.js";
import { installSuperpowers } from "../../core/superpowers.js";
import { detectSkill } from "../../core/detect-installations.js";
import { KNOWN_AGENTS } from "../../core/agents.js";
import type { AgentInfo, DeployOptions } from "../../core/types.js";

function isDevMode(): boolean {
  return existsSync(join(getPackageRoot(), ".git"));
}

async function checkLatestVersion(): Promise<string | null> {
  try {
    return execSync("npm view @flyin-ai/alloy version", { stdio: "pipe" })
      .toString().trim();
  } catch {
    return null;
  }
}

/**
 * 升级 alloy CLI(用户模式)。
 * 开发模式跳过(本地代码不在 npm 上)。
 * force=true 时跳过 "是否升级 alloy CLI?" 确认,直接执行升级(自动化场景)。
 */
async function upgradeAlloyCli(force?: boolean): Promise<string[]> {
  const results: string[] = [];
  const pkg = JSON.parse(
    readFileSync(join(getPackageRoot(), "package.json"), "utf-8")
  );
  const currentVersion = pkg.version as string;
  const latest = await checkLatestVersion();

  if (latest && latest !== currentVersion) {
    section("alloy CLI 升级");
    info(`发现新版本: v${latest}(当前 v${currentVersion})`);
    const doUpdate = force ? true : await promptConfirm("是否升级 alloy CLI?", false);
    if (doUpdate) {
      try {
        execSync("npm update -g @flyin-ai/alloy", { stdio: "pipe" });
        results.push(`${color.green("✓")} alloy CLI 已升级到 v${latest}`);
      } catch {
        results.push(`${color.yellow("⚠️")} CLI 升级失败`);
      }
    } else {
      results.push("  已跳过 CLI 升级");
    }
  } else if (latest) {
    results.push(`${color.green("✓")} Alloy v${currentVersion} 已是最新`);
  } else {
    results.push(`${color.yellow("⚠️")} 无法检查更新(npm registry 不可达)`);
  }
  return results;
}

/**
 * 升级 Superpowers(scope 逻辑)。
 * - scope=project: 直接 installSuperpowers("project")
 * - scope=global: 先扫所有 agent,任一 plugin 就整体跳过并提示
 */
async function upgradeSuperpowers(
  scope: "global" | "project",
  agents: AgentInfo[],
  projectPath: string
): Promise<{ results: string[]; skipped: boolean }> {
  const results: string[] = [];
  if (scope === "global") {
    // 扫所有 agent,任一 plugin 就整体跳过
    const pluginAgents = agents.filter(a => {
      const detected = detectSkill("brainstorming", a, projectPath, "global");
      return detected.location === "user-plugin";
    });
    if (pluginAgents.length > 0) {
      results.push(
        `${color.yellow("⚠️")} 检测到 plugin 形态的 Superpowers(${pluginAgents.map(a => a.label).join("+")}),` +
        `alloy update 无法升级 plugin,请手动 /plugin update 或 npx skills add -g`
      );
      return { results, skipped: true };
    }
  }
  const spResult = await installSuperpowers(scope, agents, projectPath, true);
  if (spResult.status === "installed") {
    results.push(`${color.green("✓")} Superpowers 已升级(scope=${scope})`);
  } else if (spResult.status === "failed") {
    results.push(`${color.yellow("⚠️")} Superpowers 升级失败`);
  }
  return { results, skipped: false };
}

export async function updateCommand(
  projectPath: string,
  force?: boolean
): Promise<string[]> {
  const results: string[] = [];

  // 1. 读 config(scope + target_agents)
  const config = await readProjectConfig(projectPath);
  const scope = config.alloy?.install_scope;
  const targetAgentIds = config.alloy?.target_agents;

  if (!scope || !targetAgentIds || targetAgentIds.length === 0) {
    results.push(`${color.yellow("⚠️")} 配置过旧或缺字段,请运行 alloy init 补全`);
    return results;
  }

  const targetAgents: AgentInfo[] = targetAgentIds
    .map(id => KNOWN_AGENTS.find(a => a.id === id))
    .filter((a): a is AgentInfo => a !== undefined);

  if (targetAgents.length === 0) {
    results.push(`${color.yellow("⚠️")} 未识别到目标 agent,请运行 alloy init`);
    return results;
  }

  const dev = isDevMode();

  // 2. plan(plan 内部会调 detectInitMatrix,无需在此冗余调用)
  const collectResult = await collectForUpdate(projectPath);
  const actionPlan = await plan(collectResult, {
    scope,
    targetAgents,
    mainBranch: config.alloy?.main_branch ?? "main",
  }, projectPath);

  // 3. displayAndConfirm(force 跳过)
  if (!force) {
    const confirmed = await displayAndConfirm(actionPlan, false);
    if (!confirmed) {
      results.push("已取消");
      return results;
    }
  }

  // 5a. [用户模式] alloy CLI 升级
  if (!dev) {
    results.push(...await upgradeAlloyCli(force));
  } else {
    info("开发模式:跳过 alloy CLI 升级");
  }

  // 5b. [用户模式] OpenSpec CLI 升级(仅当 plan 判定需要升级时,对齐 init execute.ts 逻辑)
  if (!dev) {
    if (actionPlan.openSpecCliAction.install) {
      section("OpenSpec CLI 升级");
      const osResult = await installOpenSpecCli();
      if (osResult === "installed") {
        results.push(`${color.green("✓")} OpenSpec CLI 已升级`);
      } else if (osResult === "skipped") {
        results.push(`  OpenSpec CLI 已是最新`);
      } else {
        results.push(`${color.yellow("⚠️")} OpenSpec CLI 升级失败`);
      }
    } else {
      info(`OpenSpec CLI ${actionPlan.openSpecCliAction.reason}`);
    }
  } else {
    info("开发模式:跳过 OpenSpec CLI 升级");
  }

  // 5c. [用户模式] Superpowers 升级
  if (!dev) {
    section("Superpowers 升级");
    const spRes = await upgradeSuperpowers(scope, targetAgents, projectPath);
    results.push(...spRes.results);
  } else {
    info("开发模式:跳过 Superpowers 升级");
  }

  // 5d. opsx 刷新
  section("刷新 opsx commands");
  const opsxResult = await updateOpenSpecCommands(projectPath, targetAgents, scope);
  if (opsxResult === "updated") {
    results.push(`${color.green("✓")} opsx commands 已刷新`);
  } else if (opsxResult === "skipped") {
    results.push(`  opsx commands 跳过(无目标 agent)`);
  } else {
    results.push(`${color.yellow("⚠️")} opsx commands 刷新失败`);
  }

  // 5e. execute(mode="update")
  const deployOpts: DeployOptions = {
    scope,
    projectPath,
    targetAgents,
  };
  await execute(actionPlan, deployOpts, "update");
  results.push(`${color.green("✓")} alloy 产物已刷新(skills/schema/hook/permissions/pre-commit/.gitignore)`);

  // 6. 兼容性检查
  section("兼容性检查");
  const health = await runHealthCheck(getPackageRoot(), projectPath, scope);
  const warnings = health.filter(h => h.status !== "pass");
  if (warnings.length > 0) {
    for (const w of warnings) {
      check(w.name, w.current, w.status);
    }
  } else {
    success("兼容性检查通过");
  }

  return results;
}
