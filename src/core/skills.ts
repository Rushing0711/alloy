import { mkdir, cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPackageRoot } from "../utils/fs.js";
import type { DeployOptions } from "./types.js";

export async function deploySkills(opts: DeployOptions): Promise<string[]> {
  const deployed: string[] = [];
  const packageRoot = getPackageRoot();
  const skillsSourceDir = join(packageRoot, "skills");

  let skillsTargetDir: string;
  if (opts.scope === "global") {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    skillsTargetDir = join(home, ".claude", "skills");
  } else {
    skillsTargetDir = join(opts.projectPath, ".claude", "skills");
  }

  await mkdir(skillsTargetDir, { recursive: true });

  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(skillsSourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("alloy")) continue;
    const srcPath = join(skillsSourceDir, entry.name);
    const destPath = join(skillsTargetDir, entry.name);
    await cp(srcPath, destPath, { recursive: true });
    deployed.push(`→ ${destPath}`);
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
  await cp(schemaSource, schemaTarget, { recursive: true });

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
