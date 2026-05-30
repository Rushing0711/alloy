import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { checkOpenSpec } from "./health.js";
import { loadCompat } from "./compat.js";
import { getPackageRoot } from "../utils/fs.js";

function createCustomProfile(): { env: NodeJS.ProcessEnv; cleanup: () => void } {
  const configHome = mkdtempSync(join(tmpdir(), "alloy-openspec-profile-"));
  const openspecConfigDir = join(configHome, "openspec");
  mkdirSync(openspecConfigDir, { recursive: true });

  const config = {
    featureFlags: {},
    profile: "custom",
    delivery: "commands",
    workflows: [
      "propose", "explore", "new", "continue", "apply", "ff",
      "sync", "archive", "bulk-archive", "verify", "onboard",
    ],
  };
  writeFileSync(
    join(openspecConfigDir, "config.json"),
    JSON.stringify(config, null, 2) + "\n",
    "utf-8",
  );

  return {
    env: { ...process.env, XDG_CONFIG_HOME: configHome },
    cleanup: () => rmSync(configHome, { recursive: true, force: true }),
  };
}

export async function installOpenSpecCli(): Promise<"installed" | "skipped" | "failed"> {
  const packageDir = getPackageRoot();
  const config = await loadCompat(packageDir);
  const dep = checkOpenSpec(config.compatible.openspec);

  if (dep.installed && dep.compatible) {
    console.log(`     ✓ OpenSpec CLI ${dep.version} 已安装，跳过`);
    return "skipped";
  }

  if (dep.installed && !dep.compatible) {
    console.log(
      `     ⚠ OpenSpec ${dep.version} 不满足要求 ${config.compatible.openspec}，重新安装...`
    );
  }

  try {
    execSync("npm install -g @fission-ai/openspec@1", {
      stdio: "pipe",
      cwd: process.cwd(),
    });
    return "installed";
  } catch {
    return "failed";
  }
}

export async function initOpenSpecProject(
  projectPath: string,
  scope: "global" | "project"
): Promise<"initialized" | "skipped" | "failed"> {
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  const targetPath = scope === "global" ? home : projectPath;
  const label = scope === "global" ? "全局" : "项目";

  if (scope === "project") {
    const configPath = join(projectPath, "openspec", "config.yaml");
    try {
      await readFile(configPath, "utf-8");
      console.log(`     ✓ ${label}已初始化 OpenSpec，跳过`);
      return "skipped";
    } catch {
      // 文件不存在，需要初始化
    }
  }

  const profile = createCustomProfile();
  try {
    execSync(
      `openspec init ${JSON.stringify(targetPath)} --tools claude --profile custom`,
      { stdio: "pipe", timeout: 120_000, env: profile.env },
    );
    console.log(`     ✓ openspec init 完成（${label}）`);
    return "initialized";
  } catch (error) {
    console.error(`     ✗ openspec init 失败: ${(error as Error).message}`);
    return "failed";
  } finally {
    profile.cleanup();
  }
}
