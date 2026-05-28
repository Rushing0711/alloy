import { mkdir, cp } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { getPackageRoot } from "../utils/fs.js";

export async function installSuperpowers(
  scope: "global" | "project"
): Promise<"installed" | "skipped" | "failed"> {
  try {
    const output = execSync("npx skills list", { stdio: "pipe" }).toString();
    if (output.includes("brainstorming") && output.includes("using-git-worktrees")) {
      console.log("     ✓ Superpowers 已安装，跳过");
      return "skipped";
    }
  } catch {
    // 未安装
  }

  const scopeFlag = scope === "global" ? "-g" : "";
  const flags = ["-y", scopeFlag, "--agent claude-code"].filter(Boolean).join(" ");

  try {
    execSync(`npx skills add obra/superpowers ${flags}`, {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    return "installed";
  } catch {
    console.log("     ⚠ 网络不可达，使用内置 Superpowers skill");
    return await installSuperpowersFromVendor(scope, process.cwd());
  }
}

async function installSuperpowersFromVendor(
  scope: "global" | "project",
  projectPath: string,
): Promise<"installed" | "failed"> {
  const packageRoot = getPackageRoot();
  const vendorSource = join(packageRoot, "vendor", "superpowers");

  let skillsTargetDir: string;
  if (scope === "global") {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    skillsTargetDir = join(home, ".claude", "skills");
  } else {
    skillsTargetDir = join(projectPath, ".claude", "skills");
  }

  try {
    await mkdir(skillsTargetDir, { recursive: true });
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(vendorSource, { withFileTypes: true });
    let copied = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const srcPath = join(vendorSource, entry.name);
      const destPath = join(skillsTargetDir, entry.name);
      await cp(srcPath, destPath, { recursive: true });
      copied++;
    }
    console.log(`     ✓ 已从 vendor 复制 ${copied} 个 Superpowers skill`);
    return "installed";
  } catch (error) {
    console.error(`     ✗ vendor 兜底失败: ${(error as Error).message}`);
    return "failed";
  }
}
