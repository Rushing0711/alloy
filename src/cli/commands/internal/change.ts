// src/cli/commands/internal/change.ts
// alloy _change create <name> 命令:OpenSpec change 目录创建 + 验证。
//
// 替代 alloy-start SKILL.md 里 Step 2+3 的多步 bash:
//   - 目录冲突预检(if [ -d openspec/changes/<name> ])
//   - openspec new change <name>
//   - .openspec.yaml 验证(if [ ! -f .../.openspec.yaml ])
// 3 次 LLM -> 1 次。
//
// 用法:alloy _change create <name>
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

/**
 * alloy _change create <name>
 *
 * 原子完成:目录冲突预检 + openspec new change + .openspec.yaml 验证。
 *
 * 失败语义:
 * - 目录已存在 -> PRECONDITION_FAIL exit 1(SKILL.md 指示走 USER_GATE 让用户决策)
 * - openspec CLI 失败 -> [FAIL] exit 1
 * - .openspec.yaml 缺失 -> PRECONDITION_FAIL exit 1(禁 alloy 补写)
 */
async function changeCreate(args: string[]): Promise<void> {
  const name = args[0];

  if (!name) {
    console.error("用法: alloy _change create <name>");
    process.exit(1);
    return;
  }

  const projectRoot = process.cwd();
  const changeDir = join(projectRoot, "openspec", "changes", name);

  // 1. 目录冲突预检
  if (existsSync(changeDir)) {
    console.error(`⛔ [PRECONDITION_FAIL] openspec/changes/${name} 已存在`);
    console.error("  可能原因:name 已被占用 / 旧 change 残留 / 多 session 并发");
    console.error("  禁止:agent 自动覆盖(rm -rf)或自动复用--可能丢失用户既有工作");
    console.error("  SKILL.md 指示:走 USER_GATE 让用户决策(改名 / 接续 / 中止)");
    process.exit(1);
    return;
  }

  // 2. openspec new change <name>
  try {
    const output = execSync(`openspec new change "${name}"`, {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: "pipe",
    });
    // openspec 输出含创建信息,透传给 agent
    if (output.trim()) {
      console.log(output.trim());
    }
  } catch (e) {
    const err = e as { stderr?: Buffer; message: string };
    const stderr = err.stderr?.toString() ?? "";
    console.error(`⛔ [FAIL] openspec new change 失败: ${err.message}`);
    if (stderr) console.error(`  ${stderr.trim()}`);
    console.error("  可能原因:openspec CLI 未安装 / 版本不兼容 / name 不符合规范。");
    console.error("  修复:检查 openspec --version,或换 name 重试。");
    process.exit(1);
    return;
  }

  // 3. 验证 .openspec.yaml 生成
  const openspecYaml = join(changeDir, ".openspec.yaml");
  if (!existsSync(openspecYaml)) {
    console.error(`⛔ [PRECONDITION_FAIL] opsx:new 创建失败--.openspec.yaml 缺失`);
    console.error(`  .openspec.yaml 由 openspec new change 生成,是 opsx:new 真正执行的标志。`);
    console.error(`  可能原因:`);
    console.error(`    1. openspec CLI 版本不兼容(未生成 .openspec.yaml)`);
    console.error(`    2. openspec/changes/${name}/ 目录被意外删除`);
    console.error(`  禁止:alloy 补写 .openspec.yaml(这是 OpenSpec 的事,alloy 不接管)。`);
    console.error(`  必须:退出 skill 让用户排查 openspec CLI。`);
    process.exit(1);
    return;
  }

  console.log(`✓ change 已创建: ${name}`);
}

export async function changeCommand(args: string[]): Promise<void> {
  const action = args[0];

  if (!action) {
    console.error("用法: alloy _change create <name>");
    process.exit(1);
    return;
  }

  switch (action) {
    case "create":
      return changeCreate(args.slice(1));
    default:
      console.error(`未知操作: ${action} (支持: create)`);
      process.exit(1);
  }
}
