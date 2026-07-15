import { mkdir, cp, readFile, writeFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { getPackageRoot } from "../utils/fs.js";
import type { AgentInfo, DeployOptions } from "./types.js";
import { getSkillTargetDir, getCommandsTargetDir } from "./agents.js";

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
    const targetDir = getSkillTargetDir(agent, opts.scope, opts.projectPath);

    // 只检查目标 scope 目录(非全局),避免用户有全局安装时误报"覆盖更新"
    if (existsSync(join(targetDir, "alloy-start", "SKILL.md"))) {
      console.log(`     ℹ ${agent.label} Alloy skills 覆盖更新`);
    }
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

/** OpenCode command wrapper 覆盖的 alloy 流程 id(start/plan/apply/...) */
const OPENCODE_COMMAND_IDS = [
  "start", "plan", "apply", "archive",
  "finish", "fix", "status", "discard",
] as const;

/** 生成 OpenCode command wrapper 内容:薄包装,指示 agent 调 skill 工具加载对应 skill */
function buildOpenCodeCommandWrapper(skillName: string, description: string): string {
  return `---
description: ${description}
---

加载并执行 \`${skillName}\` skill。

调用 \`skill({ name: "${skillName}" })\` 工具加载完整 SKILL.md 内容,然后严格按其流程指引执行。
`;
}

/**
 * 为 OpenCode 部署 command wrapper,让 /alloy-start 等 slash command 能触发 skill。
 *
 * 背景:OpenCode 的 / 只列 commands 目录的文件,skills 通过 agent 调 skill 工具按需加载,
 * 不在 / 列表里。alloy init 已把 alloy-* 装到 .opencode/skills/,但 /alloy 没提示。
 * 补装 wrapper 到 .opencode/commands/alloy-*.md,wrapper 内容指示 agent 调
 * skill({ name }) 加载对应 skill,从而 /alloy-start 能间接触发 skill。
 *
 * 范围:只对 OpenCode(agent.id === "opencode")。其他 agent 的 skills 触发机制不同,不需要。
 * 路径:project -> <projectPath>/.opencode/commands/;global -> ~/.config/opencode/commands/
 */
export async function deployOpenCodeCommands(opts: DeployOptions): Promise<string[]> {
  const deployed: string[] = [];
  const opencodeAgents = opts.targetAgents.filter((a) => a.id === "opencode");
  if (opencodeAgents.length === 0) return deployed;

  const packageRoot = getPackageRoot();
  const skillsSourceDir = join(packageRoot, "skills");
  const opencode = opencodeAgents[0];
  const commandsDir = getCommandsTargetDir(opencode, opts.scope, opts.projectPath);
  await mkdir(commandsDir, { recursive: true });

  for (const id of OPENCODE_COMMAND_IDS) {
    const skillName = `alloy-${id}`;
    // 读 skill 的 description 作为 command 的 description(单一真相源)
    let description = `Alloy ${id} 流程`;
    try {
      const skillMd = await readFile(join(skillsSourceDir, skillName, "SKILL.md"), "utf-8");
      const m = skillMd.match(/^description:\s*(.+)$/m);
      if (m) description = m[1].trim();
    } catch {
      // skill 源文件缺失,用默认 description
    }

    const wrapperPath = join(commandsDir, `${skillName}.md`);
    await writeFile(wrapperPath, buildOpenCodeCommandWrapper(skillName, description), "utf-8");
    deployed.push(wrapperPath);
  }

  return deployed;
}
