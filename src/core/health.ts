import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import semver from "semver";
import type { DepCheckResult, HealthCheckResult } from "./types.js";
import { loadCompat } from "./compat.js";
import { detectEnv } from "./detect.js";

const EXPECTED_SKILLS = [
  "alloy",
  "alloy-start",
  "alloy-plan",
  "alloy-apply",
  "alloy-archive",
  "alloy-discard",
  "alloy-finish",
  "alloy-fix",
  "alloy-status",
];

/**
 * 检测 OpenSpec CLI 是否安装且版本兼容。
 * 供 doctor 诊断和 init 安装前检测复用。
 */
export function checkOpenSpec(requiredRange: string): DepCheckResult {
  try {
    const version = execSync("openspec --version", { stdio: "pipe" })
      .toString()
      .trim();
    return {
      installed: true,
      version,
      compatible: semver.satisfies(version, requiredRange),
    };
  } catch {
    return { installed: false, compatible: false };
  }
}

/**
 * 检测 Superpowers 是否安装且版本兼容。
 * 优先检查 Claude Code 插件（~/.claude/plugins/installed_plugins.json），
 * fallback 到 npx skills list。
 * 供 doctor 诊断和 init 安装前检测复用。
 */
export async function checkSuperpowers(requiredRange: string): Promise<DepCheckResult> {
  // 1. 检查 Claude Code 插件
  try {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    const pluginsJsonPath = join(home, ".claude", "plugins", "installed_plugins.json");
    const pluginsRaw = await readFile(pluginsJsonPath, "utf-8");
    const plugins = JSON.parse(pluginsRaw);
    const sp = plugins?.plugins?.["superpowers@claude-plugins-official"];
    if (sp && sp.length > 0) {
      return {
        installed: true,
        version: sp[0].version,
        compatible: semver.satisfies(sp[0].version, requiredRange),
      };
    }
  } catch {
    // 插件文件不存在或无 superpowers 条目，继续 fallback
  }

  // 2. fallback: npx skills list
  try {
    const output = execSync("npx skills list", { stdio: "pipe" }).toString();
    if (output.includes("brainstorming") && output.includes("using-git-worktrees")) {
      return { installed: true, compatible: true };
    }
  } catch {
    // 未安装
  }

  return { installed: false, compatible: false };
}

/**
 * 运行 7 项健康检查，统一编排并返回结果数组。
 * 每一项检查独立运行，一项失败不影响其他项。
 *
 * @param packageDir 包安装目录（读取 compat.yaml 和 package.json）
 * @param projectPath 用户项目根路径（检查 change 和 skills 目录）
 * @param scope 技能安装范围："global" 检查 ~/.claude/skills/，"project"（默认）检查 projectPath/.claude/skills/
 */
export async function runHealthCheck(
  packageDir: string,
  projectPath: string,
  scope?: "global" | "project"
): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  const config = await loadCompat(packageDir);
  const env = detectEnv();

  // 1. Node.js 版本
  results.push({
    name: "Node.js",
    current: env.nodeVersion,
    required: config.compatible.node,
    status: semver.satisfies(env.nodeVersion, config.compatible.node) ? "pass" : "fail",
  });

  // 2. OpenSpec
  const osCheck = checkOpenSpec(config.compatible.openspec);
  if (osCheck.installed) {
    results.push({
      name: "OpenSpec",
      current: osCheck.version!,
      required: config.compatible.openspec,
      status: osCheck.compatible ? "pass" : "warn",
    });
  } else {
    results.push({
      name: "OpenSpec",
      current: "未安装",
      required: config.compatible.openspec,
      status: "fail",
    });
  }

  // 3. Superpowers
  const spCheck = await checkSuperpowers(config.compatible.superpowers);
  if (spCheck.installed) {
    const versionInfo = spCheck.version ? ` v${spCheck.version}` : "";
    results.push({
      name: "Superpowers",
      current: `已安装${versionInfo}`,
      required: config.compatible.superpowers,
      status: spCheck.compatible ? "pass" : "warn",
    });
  } else {
    results.push({
      name: "Superpowers",
      current: "未安装",
      required: config.compatible.superpowers,
      status: "fail",
    });
  }

  // 4. Alloy 自身版本
  try {
    const pkg = JSON.parse(
      await readFile(join(packageDir, "package.json"), "utf-8")
    );
    const version = pkg.version as string;
    results.push({
      name: "Alloy",
      current: version,
      required: config.compatible.alloy,
      status: semver.satisfies(version, config.compatible.alloy)
        ? "pass"
        : "warn",
    });
  } catch {
    results.push({
      name: "Alloy",
      current: "未知",
      required: config.compatible.alloy,
      status: "fail",
    });
  }

  // 5. Schema 版本
  try {
    const changesDir = join(projectPath, "openspec", "changes");
    const schemaStatus = await checkSchemaVersions(
      changesDir,
      config.compatible.schema
    );
    results.push(schemaStatus);
  } catch {
    results.push({
      name: "Schema",
      current: "无法检测",
      required: String(config.compatible.schema),
      status: "warn",
      message: "openspec/changes/ 目录不存在或无法读取",
    });
  }

  // 6. Skill 文件完整性（检查 .claude/skills/ 和 skills/ 两个路径）
  try {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    const skillsDir =
      scope === "global"
        ? join(home, ".claude", "skills")
        : join(projectPath, ".claude", "skills");
    const sourceSkillsDir = join(projectPath, "skills");

    let skillsStatus = checkSkillsIntegrity(skillsDir);
    // 如果 .claude/skills/ 不完整，尝试检查 skills/（源码目录）
    if (skillsStatus.status === "fail") {
      const sourceStatus = checkSkillsIntegrity(sourceSkillsDir);
      if (sourceStatus.status === "pass") {
        skillsStatus = {
          ...sourceStatus,
          current: `${sourceStatus.current}（来源: skills/）`,
        };
      }
    }
    results.push(skillsStatus);
  } catch {
    results.push({
      name: "Skills",
      current: "无法检测",
      required: `9 个目录`,
      status: "warn",
    });
  }

  // 7. 环境检测
  const envOk = env.gitInstalled && env.claudeCodeInstalled;
  const envDetails: string[] = [];
  if (env.gitInstalled) envDetails.push("git ✓");
  else envDetails.push("git ✗");
  if (env.claudeCodeInstalled) envDetails.push("Claude Code ✓");
  else envDetails.push("Claude Code ✗");
  results.push({
    name: "Environment",
    current: envDetails.join("  "),
    required: "git + Claude Code",
    status: envOk ? "pass" : "warn",
  });

  return results;
}

/**
 * 检查 openspec/changes/ 下各 change 的 schema_version 是否与兼容版本一致。
 * 内部 helper，不导出。
 */
async function checkSchemaVersions(
  changesDir: string,
  requiredVersion: number
): Promise<HealthCheckResult> {
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(changesDir, { withFileTypes: true });
    const mismatches: string[] = [];
    const yaml = await import("yaml");

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const content = await readFile(
          join(changesDir, entry.name, ".alloy.yaml"),
          "utf-8"
        );
        const state = yaml.parse(content) as { schema_version?: number };
        if (
          state.schema_version !== undefined &&
          state.schema_version !== requiredVersion
        ) {
          mismatches.push(`${entry.name}=${state.schema_version}`);
        }
      } catch {
        // 跳过无 .alloy.yaml 的目录
      }
    }

    if (mismatches.length === 0) {
      return {
        name: "Schema",
        current: `version ${requiredVersion}`,
        required: String(requiredVersion),
        status: "pass",
      };
    }
    return {
      name: "Schema",
      current: mismatches.join(", "),
      required: String(requiredVersion),
      status: "warn",
      message: `以下 change 的 schema_version 不匹配: ${mismatches.join(", ")}`,
    };
  } catch {
    return {
      name: "Schema",
      current: "无 changes",
      required: String(requiredVersion),
      status: "pass",
      message: "没有活跃 change，跳过 schema_version 检查",
    };
  }
}

/**
 * 检查 .claude/skills/ 下 9 个 alloy 技能目录是否完整。
 * 内部 helper，不导出。
 */
function checkSkillsIntegrity(skillsDir: string): HealthCheckResult {
  const missing: string[] = [];
  for (const name of EXPECTED_SKILLS) {
    if (!existsSync(join(skillsDir, name))) {
      missing.push(name);
    }
  }
  const found = EXPECTED_SKILLS.length - missing.length;
  if (missing.length === 0) {
    return {
      name: "Skills",
      current: `${found}/${EXPECTED_SKILLS.length} 目录完整`,
      required: `${EXPECTED_SKILLS.length} 个目录`,
      status: "pass",
    };
  }
  return {
    name: "Skills",
    current: `${found}/${EXPECTED_SKILLS.length}（缺失: ${missing.join(", ")}）`,
    required: `${EXPECTED_SKILLS.length} 个目录`,
    status: "fail",
    message: `缺失: ${missing.join(", ")}`,
  };
}
