import { join } from "node:path";
import { detectEnv } from "../utils/env.js";
import { loadCompat, checkCompat } from "../utils/compat.js";
import {
  deploySkills,
  deploySchema,
  injectClaudeMd,
  installOpenSpec,
  installSuperpowers,
  DeployOptions,
} from "../utils/deploy.js";

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

  // 2. 安装 OpenSpec CLI
  console.log("\n  📥 安装 OpenSpec CLI...");
  try {
    await installOpenSpec();
    console.log("     ✓ @fission-ai/openspec@1");
  } catch {
    console.error("     ✗ OpenSpec 安装失败");
    process.exit(1);
  }

  // 3. 安装 Superpowers
  console.log("\n  📥 安装 Superpowers...");
  try {
    await installSuperpowers();
    console.log("     ✓ Claude Code → obra/superpowers@5");
  } catch {
    console.error("     ✗ Superpowers 安装失败");
    process.exit(1);
  }

  // 4. 部署 Alloy skill
  console.log("\n  🚀 部署 Alloy...");
  const skillPaths = await deploySkills(opts);
  for (const p of skillPaths) {
    console.log(`     ✓ ${p}`);
  }

  // 5. 部署 schema
  const schemaPath = await deploySchema(opts);
  console.log(`     ✓ 项目 schema → ${schemaPath}`);

  // 6. 注入 CLAUDE.md
  const injected = await injectClaudeMd(opts);
  if (injected) {
    console.log("     ✓ CLAUDE.md → 已追加 Alloy 工作流提示");
  }

  // 7. 兼容性检查
  console.log("\n  🩺 兼容性检查...");
  const packageDir = join(import.meta.dirname, "..", "..");
  const config = await loadCompat(packageDir);
  const results = checkCompat(config);
  for (const r of results) {
    const mark = r.compatible ? "✓" : "⚠️";
    console.log(
      `     ${mark} ${r.name} ${r.current}（兼容范围 ${r.required}）`
    );
  }

  console.log("\n  ✅ Alloy 就绪！");
  console.log("     在 Claude Code 中输入 /alloy:start <topic> 开始工作\n");
}
