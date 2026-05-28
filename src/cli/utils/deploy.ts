import { mkdir, cp, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";

const CLAUDE_MD_MARKER_START = "<!-- ALLOY-WORKFLOW:START -->";
const CLAUDE_MD_MARKER_END = "<!-- ALLOY-WORKFLOW:END -->";

export interface DeployOptions {
  scope: "global" | "project";
  skipClaudeMd: boolean;
  projectPath: string;
}

function getPackageRoot(): string {
  // 从 dist/cli/utils/ 回到包根目录（3 级）
  return join(import.meta.dirname, "..", "..", "..");
}

export async function deploySkills(opts: DeployOptions): Promise<string[]> {
  const deployed: string[] = [];
  const packageRoot = getPackageRoot();
  const skillsSourceDir = join(packageRoot, ".claude", "skills");

  let skillsTargetDir: string;
  if (opts.scope === "global") {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    skillsTargetDir = join(home, ".claude", "skills");
  } else {
    skillsTargetDir = join(opts.projectPath, ".claude", "skills");
  }

  await mkdir(skillsTargetDir, { recursive: true });

  // 部署所有 alloy* 目录（alloy/ + alloy-start/ + alloy-plan/ + ...）
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

  await mkdir(schemaTarget, { recursive: true });
  await cp(schemaSource, schemaTarget, { recursive: true });

  // 写入 openspec/config.yaml
  const configPath = join(opts.projectPath, "openspec", "config.yaml");
  const configContent = "schema: alloy\n";
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, configContent, "utf-8");

  return schemaTarget;
}

export async function injectClaudeMd(opts: DeployOptions): Promise<boolean> {
  if (opts.skipClaudeMd) return false;

  const claudeMdPath = join(opts.projectPath, "CLAUDE.md");
  const fragment = [
    "",
    CLAUDE_MD_MARKER_START,
    "## Alloy 工作流",
    "",
    "本项目使用 [Alloy](https://github.com/user/alloy) 管理开发工作流。",
    "",
    "常用命令：",
    "- `/alloy:start [topic]` - 智能入口",
    "- `/alloy:plan [name]` - 逐制品规划",
    "- `/alloy:apply [name]` - 执行实现",
    "- `/alloy:finish [name]` - 收尾",
    "- `/alloy:fix` - Bug 修复",
    "- `/alloy:status [name]` - 查看状态",
    "",
    "详细文档：",
    "- [alloy-design.md](alloy-design.md)",
    "- [设计规格](docs/superpowers/specs/2026-05-28-alloy-design-spec.md)",
    CLAUDE_MD_MARKER_END,
    "",
  ].join("\n");

  let existing = "";
  try {
    existing = await readFile(claudeMdPath, "utf-8");
  } catch {
    // CLAUDE.md 不存在
  }

  // 如果已有 Alloy 标记区域，替换之
  if (existing.includes(CLAUDE_MD_MARKER_START)) {
    const startIdx = existing.indexOf(CLAUDE_MD_MARKER_START);
    const endIdx = existing.indexOf(CLAUDE_MD_MARKER_END);
    if (endIdx > startIdx) {
      existing =
        existing.slice(0, startIdx) +
        existing.slice(endIdx + CLAUDE_MD_MARKER_END.length);
    }
  }

  await writeFile(claudeMdPath, existing + fragment, "utf-8");
  return true;
}

export async function installOpenSpec(): Promise<"installed" | "skipped" | "failed"> {
  // 先检查是否已安装（版本兼容性由 doctor 步骤校验）
  try {
    execSync("openspec --version", { stdio: "pipe" });
    console.log("     ✓ OpenSpec 已安装，跳过");
    return "skipped";
  } catch {
    // 未安装，继续
  }

  try {
    execSync("npm install -g @fission-ai/openspec@1", {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    return "installed";
  } catch {
    return "failed";
  }
}

export async function installSuperpowers(): Promise<"installed" | "skipped" | "failed"> {
  // 先检查 Superpowers 核心 skill 是否已存在（brainstorming 是 Superpowers 的标志性 skill）
  try {
    const output = execSync("npx skills list", { stdio: "pipe" }).toString();
    if (output.includes("brainstorming") && output.includes("using-git-worktrees")) {
      console.log("     ✓ Superpowers 已安装，跳过");
      return "skipped";
    }
  } catch {
    // 未安装或命令不可用
  }

  try {
    execSync("npx skills add obra/superpowers", {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    return "installed";
  } catch {
    console.log("  网络不可达，将使用内置 Superpowers skill 兜底");
    return "failed";
  }
}
