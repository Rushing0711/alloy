// src/cli/commands/internal/env.ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { detectDeployedAgents } from "../../../core/agents.js";

export interface EnvCheckResult {
  ok: boolean;
  missing: string[];
}

/**
 * 环境完整性检测纯函数:4 项基础设施任一缺失即返回 ok=false。
 * 供 envCheckCommand 和 _start precheck 复用,避免逻辑漂移。
 *
 * agent 命名规则真相源在 agents.ts 的 KNOWN_AGENTS,此处复用,消除漂移。
 */
export function checkEnvIntegrity(projectPath: string): EnvCheckResult {
  const missing: string[] = [];

  // 1. git 仓库
  try {
    execSync("git rev-parse --git-dir", { cwd: projectPath, stdio: "pipe" });
  } catch {
    missing.push("git 仓库（git rev-parse --git-dir 失败）");
  }

  // 2. openspec/config.yaml 含 schema: alloy
  const configPath = join(projectPath, "openspec", "config.yaml");
  let configOk = false;
  if (existsSync(configPath)) {
    try {
      const content = execSync(`cat "${configPath}"`, { encoding: "utf-8" });
      configOk = /^schema:\s*alloy\b/m.test(content);
    } catch {
      configOk = false;
    }
  }
  if (!configOk) {
    missing.push("openspec/config.yaml（缺失或不含 schema: alloy）");
  }

  // 3. openspec/schemas/alloy/schema.yaml
  if (!existsSync(join(projectPath, "openspec", "schemas", "alloy", "schema.yaml"))) {
    missing.push("openspec/schemas/alloy/schema.yaml");
  }

  // 4. Alloy skills--复用 detectDeployedAgents,与 init 部署路径(getSkillTargetDir)
  //    共用同一真相源。
  //    手写 commandsDir.split("/")[0] 推导会误判,必须走统一函数。
  const deployedAgents = detectDeployedAgents("project", projectPath);
  if (deployedAgents.length === 0) {
    missing.push("Alloy skills（未找到 alloy-start/SKILL.md，init 未为当前 agent 部署）");
  }

  return { ok: missing.length === 0, missing };
}

/**
 * alloy _env check - 只读环境完整性检测
 *
 * 4 项基础设施任一缺失即 exit(1)，输出缺失项列表。
 * 供 start.md 等 skill 调用，避免 agent 自由实现检测导致误判
 *（如检测 .claude/skills/ 顶层文件数而非 alloy/ 子目录）。
 */
export async function envCheckCommand(): Promise<void> {
  const result = checkEnvIntegrity(process.cwd());

  if (!result.ok) {
    console.log("⛔ PRECONDITION_FAIL: Alloy 环境不完整");
    console.log("");
    console.log("缺失检查项：");
    for (const m of result.missing) {
      console.log(`  ✗ ${m}`);
    }
    console.log("");
    console.log("请先运行：alloy init");
    console.log("（已运行过的话，请检查上次 init 是否完整成功；可运行 alloy doctor 查看详情）");
    process.exit(1);
  }

  console.log("✓ Alloy 环境完整（git ✓ config.yaml ✓ schema.yaml ✓ skills ✓）");
}
