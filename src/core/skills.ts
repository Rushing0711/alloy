import { mkdir, cp, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getPackageRoot } from "../utils/fs.js";
import type { AgentInfo, DeployOptions } from "./types.js";
import { getSkillTargetDir } from "./agents.js";
import { detectAlloySkill } from "./detect-installations.js";
import { promptConfirm } from "../utils/prompt.js";

/** 读取当前 alloy 包版本(从 package.json) */
function readPackageVersion(): string {
  const pkgPath = join(getPackageRoot(), "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  return pkg.version as string;
}

export async function deploySkills(opts: DeployOptions): Promise<string[]> {
  const deployed: string[] = [];
  const packageRoot = getPackageRoot();
  const currentVersion = readPackageVersion();

  // 源目录：skills/，遍历 alloy-* 子目录
  const skillsSourceDir = join(packageRoot, "skills");
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(skillsSourceDir, { withFileTypes: true });
  const skillDirs = entries.filter(
    (e) => e.isDirectory() && e.name.startsWith("alloy-")
  );

  for (const agent of opts.targetAgents) {
    // 检测已有 Alloy skills
    const detected = detectAlloySkill(agent, opts.projectPath);
    if (detected.found) {
      const locationLabel = ({
        "project-skill": "项目级",
        "user-skill": "用户级",
      } as Record<string, string>)[detected.location!] || detected.location;
      console.log(`     ℹ Alloy skills 已部署（${locationLabel}：${detected.path}）`);
      if (opts.force) {
        // --force 跳过覆盖确认,直接重装
        console.log(`     --force 模式:直接覆盖 ${agent.label} 的 Alloy skills`);
      } else {
        const overwrite = await promptConfirm(`     是否覆盖 ${agent.label} 的 Alloy skills？`, false);
        if (!overwrite) {
          console.log(`     ✓ 跳过 ${agent.label} 的 Alloy skills 部署`);
          continue;
        }
      }
    }

    // Codex: project 模式跳过
    if (agent.globalOnly && opts.scope === "project") {
      console.log(`     ⚠ Codex commands 仅全局安装有效，跳过`);
      continue;
    }

    const targetDir = getSkillTargetDir(agent, opts.scope, opts.projectPath);
    await mkdir(targetDir, { recursive: true });

    // 每个 skill 目录整体拷贝到 <targetDir>/<skill-name>/
    // references/ 随 skill 目录一起拷贝，不再单独处理
    for (const skillDir of skillDirs) {
      const src = join(skillsSourceDir, skillDir.name);
      const dest = join(targetDir, skillDir.name);
      await cp(src, dest, { recursive: true });
      deployed.push(dest);
    }

    // 写 .alloy-version 记录部署版本,供后续 init 检测升级状态
    const versionFile = join(targetDir, ".alloy-version");
    await writeFile(versionFile, currentVersion + "\n", "utf-8");
  }

  return deployed;
}

/**
 * 读 agent 的 skills 目录的 .alloy-version,返回 alloy 版本。未装返回 null。
 * 用于 init 检测已部署 skills 的版本,判断是否需要升级。
 */
export async function detectAlloySkillsVersion(
  projectPath: string,
  agent: AgentInfo,
  scope: "global" | "project" = "project"
): Promise<string | null> {
  const skillsDir = getSkillTargetDir(agent, scope, projectPath);
  const versionFile = join(skillsDir, ".alloy-version");
  try {
    const content = await readFile(versionFile, "utf-8");
    return content.trim() || null;
  } catch {
    return null;
  }
}

export async function deploySchema(opts: DeployOptions): Promise<string> {
  const packageRoot = getPackageRoot();
  const schemaSource = join(packageRoot, "openspec", "schemas", "alloy");
  const schemaTarget = join(opts.projectPath, "openspec", "schemas", "alloy");

  const openspecDir = join(opts.projectPath, "openspec");
  await mkdir(join(openspecDir, "specs"), { recursive: true });
  await mkdir(join(openspecDir, "changes"), { recursive: true });

  await mkdir(schemaTarget, { recursive: true });
  if (resolve(schemaSource) !== resolve(schemaTarget)) {
    await cp(schemaSource, schemaTarget, { recursive: true });
  }

  const configPath = join(openspecDir, "config.yaml");
  try {
    let existing = await readFile(configPath, "utf-8");
    // 检查是否已有 schema: key(任意值,如 OpenSpec 原生的 schema: spec-driven)
    if (/^schema:\s*\S+/m.test(existing)) {
      // 已有 schema: key,替换其值为 alloy(避免重复 key)
      existing = existing.replace(/^schema:\s*\S+/m, "schema: alloy");
      await writeFile(configPath, existing, "utf-8");
    } else if (!existing.includes("schema: alloy")) {
      // 没有 schema: key,追加
      existing = existing.trimEnd() + "\nschema: alloy\n";
      await writeFile(configPath, existing, "utf-8");
    }
  } catch {
    const configContent = "schema: alloy\n";
    await writeFile(configPath, configContent, "utf-8");
  }

  return schemaTarget;
}
