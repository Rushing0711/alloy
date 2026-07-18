// src/cli/commands/internal/archive-dir.ts
import { existsSync, readdirSync } from "node:fs";

/**
 * alloy _archive-dir <change-name>
 *
 * 输出归档后目录路径(openspec/changes/archive/<YYYY-MM-DD>-<name>)。
 * agent 用 `ARCHIVE_DIR=$(alloy _archive-dir <name>)` 替代手抄内联计算--
 * Pi/OpenCode bash 无 shell state 持久化,跨 bash 调用 $ARCHIVE_DIR 会丢;
 * 手抄 `ls -d openspec/changes/archive/*-<name> | sort -r | head -1` 易漏(OpenCode 实测 1/11 次遗漏导致空参错误)。
 *
 * 多 agent 适配:Claude Code / OpenCode / Pi 都用此命令,无平台差异。
 *
 * 找不到时 exit 1 + 引导。
 */
export async function archiveDirCommand(args: string[]): Promise<void> {
  const changeName = args[0];
  if (!changeName) {
    console.error("用法: alloy _archive-dir <change-name>");
    console.error("  输出归档后目录路径(openspec/changes/archive/<YYYY-MM-DD>-<name>)。");
    console.error("  agent 用 ARCHIVE_DIR=$(alloy _archive-dir <name>) 替代手抄内联计算。");
    process.exit(1);
    return;
  }

  const archiveBase = "openspec/changes/archive";
  if (!existsSync(archiveBase)) {
    console.error(`⛔ [PRECONDITION_FAIL] 归档目录不存在: ${archiveBase}`);
    console.error("  可能原因:alloy _archive 未执行 / 在非 alloy 项目根执行");
    process.exit(1);
    return;
  }

  // 找以 -<changeName> 结尾的目录,按名称降序取最新(日期格式 YYYY-MM-DD,字符串排序 = 日期排序)
  const entries = readdirSync(archiveBase, { withFileTypes: true });
  const matches = entries
    .filter(e => e.isDirectory() && e.name.endsWith(`-${changeName}`))
    .map(e => e.name)
    .sort()
    .reverse();

  if (matches.length === 0) {
    console.error(`⛔ [PRECONDITION_FAIL] 归档目录不存在: ${archiveBase}/*-${changeName}`);
    console.error(`  期望路径: ${archiveBase}/<YYYY-MM-DD>-${changeName}/`);
    console.error("  可能原因:alloy _archive 未完成目录移动 / change name 不匹配");
    process.exit(1);
    return;
  }

  // 输出最新(日期最大)的归档目录路径(相对路径,与 _archive 的 ARCHIVE_DIR 引导行格式一致)
  console.log(`${archiveBase}/${matches[0]}`);
}
