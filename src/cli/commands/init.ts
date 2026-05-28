import { select } from "@inquirer/prompts";
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
    console.log("     ✓ Claude Code → obra/superpowers@5 已安装");
  }
  // "skipped" — 函数内部已输出跳过信息
  // "failed" — 不致命，使用内置 vendor 兜底

  // 5. 部署 Alloy skill + schema
  console.log("\n  🚀 部署 Alloy...");
  const skillPaths = await deploySkills(opts);
  for (const p of skillPaths) {
    console.log(`     ✓ ${p}`);
  }
  const schemaPath = await deploySchema(opts);
  console.log(`     ✓ 项目 schema → ${schemaPath}`);

  // 6. 注入 CLAUDE.md
  const injected = await injectClaudeMd(opts);
  if (injected) {
    console.log("     ✓ CLAUDE.md → 已追加 Alloy 工作流提示");
  }

  // 7. 兼容性检查
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

  console.log("\n  ✅ Alloy 就绪！");
  console.log("     在 Claude Code 中输入 /alloy-start <topic> 开始工作\n");
}
