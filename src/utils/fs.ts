import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function getPackageRoot(): string {
  // 从 dist/utils/ 回到包根目录（2 级: utils → dist → root）
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/**
 * 返回 alloy CLI 入口 JS 的绝对路径(正斜杠形式,用于生成 hook 命令)。
 *
 * Why: Windows 路径含反斜杠,在 bash/sh 无引号上下文里被当转义符吃掉,
 * 路径损坏 -> node 找不到模块。Git for Windows 的 pre-commit hook 和
 * Claude Code 的 hook command 都在 /bin/sh 执行,均有此问题。
 * 正斜杠 + 双引号包路径,在 Windows cmd.exe / bash / sh 都兼容。
 */
export function getAlloyCliPath(): string {
  return join(getPackageRoot(), "dist", "cli", "index.js").replace(/\\/g, "/");
}
