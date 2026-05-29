import { select } from "@inquirer/prompts";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { detectEnv } from "../../core/detect.js";
import { loadCompat, checkCompat } from "../../core/compat.js";
import { installOpenSpecCli, initOpenSpecProject } from "../../core/openspec.js";
import { installSuperpowers } from "../../core/superpowers.js";
import { deploySkills, deploySchema } from "../../core/skills.js";
import { injectClaudeMd } from "../../core/claude-md.js";
import type { DeployOptions } from "../../core/types.js";
import { getPackageRoot } from "../../utils/fs.js";

export async function selectScope(passedScope?: string): Promise<"global" | "project"> {
  if (passedScope) return passedScope as "global" | "project";
  return select({
    message: "Install scope:",
    choices: [
      { name: "Project (current directory)", value: "project" },
      { name: "Global (home directory)", value: "global" },
    ],
  });
}

export interface InitOptions extends DeployOptions {}

const GITIGNORE_RULES = ["docs/superpowers/", ".worktrees/", "worktrees/"];

async function ensureGitignore(projectPath: string): Promise<void> {
  const gitignorePath = join(projectPath, ".gitignore");
  let content = "";
  try {
    content = await readFile(gitignorePath, "utf-8");
    if (!content.endsWith("\n")) content += "\n";
  } catch {
    // 文件不存在，稍后创建
  }

  const missing = GITIGNORE_RULES.filter((rule) => !content.includes(rule));
  if (missing.length === 0) return;

  const block = `\n### Alloy + Superpowers 运行时 ###\n${missing.join("\n")}\n`;
  await writeFile(gitignorePath, content + block, "utf-8");
  console.log(`     ✓ .gitignore → 已追加 ${missing.length} 条规则`);
}

export async function initCommand(opts: InitOptions): Promise<void> {
  console.log("\n  🔍 检测环境...");

  // 1. 环境检测
  const env = detectEnv();
  console.log(`     Node.js ${env.nodeVersion} ✓`);
  console.log(`     git ${env.gitInstalled ? "✓" : "✗ 未安装"}`);
  console.log(`     Claude Code ${env.claudeCodeInstalled ? "✓" : "✗ 未安装"}`);

  if (!env.gitInstalled || !env.claudeCodeInstalled) {
    console.error("\n  ❌ 缺少必要依赖，请先安装 git 和 Claude Code");
    process.exit(1);
  }

  // 2. 安装 OpenSpec CLI（npm 全局包）
  console.log("\n  📥 OpenSpec CLI...");
  const openspecResult = await installOpenSpecCli();
  if (openspecResult === "installed") {
    console.log("     ✓ @fission-ai/openspec@1 已安装");
  } else if (openspecResult === "failed") {
    console.error("     ✗ OpenSpec CLI 安装失败");
    process.exit(1);
  }
  // "skipped" — 函数内部已输出跳过信息

  // 3. 初始化 OpenSpec 项目结构（openspec/ 目录 + .claude/commands/opsx/）
  console.log("\n  📂 初始化 OpenSpec 项目结构...");
  const initResult = await initOpenSpecProject(opts.projectPath, opts.scope);
  if (initResult === "failed") {
    console.error("     ✗ OpenSpec 项目初始化失败");
    process.exit(1);
  }

  // 4. 安装 Superpowers
  console.log("\n  📥 Superpowers...");
  const superpowersResult = await installSuperpowers(opts.scope);
  if (superpowersResult === "installed") {
    console.log("     ✓ obra/superpowers@5 已安装");
  } else if (superpowersResult === "skipped") {
    console.log("     ✓ Superpowers 已安装，跳过");
  } else {
    console.log("     ⚠ Superpowers 安装失败，请稍后手动运行 alloy init 重试");
  }

  // 5. 部署 Alloy skill + schema
  console.log("\n  🚀 部署 Alloy...");
  const skillPaths = await deploySkills(opts);
  for (const p of skillPaths) {
    console.log(`     ✓ ${p}`);
  }
  const schemaPath = await deploySchema(opts);
  console.log(`     ✓ 项目 schema → ${schemaPath}`);

  // 6. 确保 .gitignore 包含 Alloy 运行时目录
  await ensureGitignore(opts.projectPath);

  // 7. 注入 CLAUDE.md
  const injected = await injectClaudeMd(opts);
  if (injected) {
    console.log("     ✓ CLAUDE.md → 已追加 Alloy 工作流提示");
  }

  // 8. 兼容性检查
  console.log("\n  🩺 兼容性检查...");
  const packageDir = getPackageRoot();
  const config = await loadCompat(packageDir);
  const results = checkCompat(config);
  for (const r of results) {
    const mark = r.compatible ? "✓" : "⚠️";
    console.log(
      `     ${mark} ${r.name} ${r.current}（兼容范围 ${r.required}）`
    );
  }

  // 9. 自动注册 shell 补全（失败不阻断 init）
  console.log("\n  🐚 注册 shell 补全...");
  try {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    const shell = process.env.SHELL || "";
    const completionLine = "source <(alloy completion)";
    let rcFile: string | null = null;

    if (shell.includes("zsh")) {
      rcFile = join(home, ".zshrc");
    } else if (shell.includes("bash")) {
      rcFile = join(home, ".bashrc");
    }

    if (rcFile) {
      let rcContent = "";
      try {
        rcContent = await readFile(rcFile, "utf-8");
      } catch {
        // 文件不存在，稍后创建
      }
      if (!rcContent.includes("alloy completion")) {
        await writeFile(
          rcFile,
          rcContent.trimEnd() + "\n" + completionLine + "\n",
          "utf-8"
        );
        console.log(`     ✓ shell 补全已注册 → ${rcFile}`);
      } else {
        console.log("     ✓ shell 补全已存在，跳过");
      }
    } else {
      console.log("     ⚠ 未检测到 bash/zsh，跳过补全注册");
    }
  } catch {
    // 注册失败不阻断 init，静默忽略
  }

  console.log("\n  ✅ Alloy 就绪！");
  console.log("     在 Claude Code 中输入 /alloy-start <topic> 开始工作\n");
}
