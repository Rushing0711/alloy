import { mkdir, cp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { getPackageRoot } from "../utils/fs.js";
import type { DeployOptions } from "./types.js";
import { getCommandTargetDir } from "./agents.js";
import { detectCommand } from "./detect-installations.js";
import { promptConfirm } from "../utils/prompt.js";

export async function deployCommands(opts: DeployOptions): Promise<string[]> {
  const deployed: string[] = [];
  const packageRoot = getPackageRoot();

  // 始终从冒号源目录读取（commands/alloy/），横线版从冒号源自动生成
  const colonSourceDir = join(packageRoot, "commands", "alloy");
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(colonSourceDir, { withFileTypes: true });

  for (const agent of opts.targetAgents) {
    // 检测已有 Alloy commands
    const detected = detectCommand("alloy/start", agent, opts.projectPath);
    if (detected.found) {
      const locationLabel = ({
        "project-command": "项目级",
        "user-command": "用户级",
      } as Record<string, string>)[detected.location!] || detected.location;
      console.log(`     ℹ Alloy commands 已部署（${locationLabel}：${detected.path}）`);
      const overwrite = await promptConfirm(`     是否覆盖 ${agent.label} 的 Alloy commands？`, false);
      if (!overwrite) {
        console.log(`     ✓ 跳过 ${agent.label} 的 Alloy commands 部署`);
        continue;
      }
    }

    // Codex: project 模式跳过
    if (agent.globalOnly && opts.scope === "project") {
      console.log(`     ⚠ Codex commands 仅全局安装有效，跳过`);
      continue;
    }

    const targetDir = getCommandTargetDir(agent, opts.scope, opts.projectPath);
    await mkdir(targetDir, { recursive: true });

    // 顶层 .md 文件（slash command）逐个部署，横线版需 frontmatter 转换
    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const src = join(colonSourceDir, entry.name);

      if (agent.supportsColonCommands) {
        // 冒号版：直接拷贝到 alloy/ 子目录
        const dest = join(targetDir, entry.name);
        await cp(src, dest);
        deployed.push(dest);
      } else {
        // 横线版：从冒号源自动生成 — 文件名和 frontmatter 中 : 替换为 -
        const dashFilename = `alloy-${entry.name}`; // start.md → alloy-start.md
        const dest = join(targetDir, dashFilename);

        const content = await readFile(src, "utf-8");
        const convertedContent = content.replace(
          /name: "Alloy: (.+)"/,
          'name: "Alloy-$1"'
        );
        await writeFile(dest, convertedContent, "utf-8");
        deployed.push(dest);
      }
    }

    // references/ 子目录：skill md 运行时按 commands/alloy/references/xxx.md 相对路径读取，
    // 必须随 skill 一起部署。内容是纯文档（无 frontmatter），冒号版/横线版都原样拷贝，
    // 保持 alloy/references/ 子目录结构（横线版 agent 按相对路径读，不依赖命名规则）。
    const referencesSrc = join(colonSourceDir, "references");
    if (existsSync(referencesSrc)) {
      const referencesDest = join(targetDir, "references");
      await mkdir(referencesDest, { recursive: true });
      await cp(referencesSrc, referencesDest, { recursive: true });
      deployed.push(referencesDest);
    }
  }

  return deployed;
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
    if (!existing.includes("schema: alloy")) {
      existing = existing.trimEnd() + "\nschema: alloy\n";
      await writeFile(configPath, existing, "utf-8");
    }
  } catch {
    const configContent = "schema: alloy\n";
    await writeFile(configPath, configContent, "utf-8");
  }

  return schemaTarget;
}
