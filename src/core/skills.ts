import { mkdir, cp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getPackageRoot } from "../utils/fs.js";
import type { DeployOptions } from "./types.js";
import { getCommandTargetDir } from "./agents.js";

export async function deployCommands(opts: DeployOptions): Promise<string[]> {
  const deployed: string[] = [];
  const packageRoot = getPackageRoot();

  // 始终从冒号源目录读取（commands/alloy/），横线版从冒号源自动生成
  const colonSourceDir = join(packageRoot, "commands", "alloy");
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(colonSourceDir, { withFileTypes: true });

  for (const agent of opts.targetAgents) {
    // Codex: project 模式跳过
    if (agent.globalOnly && opts.scope === "project") {
      console.log(`     ⚠ Codex commands 仅全局安装有效，跳过`);
      continue;
    }

    const targetDir = getCommandTargetDir(agent, opts.scope, opts.projectPath);
    await mkdir(targetDir, { recursive: true });

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
