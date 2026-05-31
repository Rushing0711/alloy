import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DeployOptions } from "./types.js";

export const CLAUDE_MD_MARKER_START = "<!-- ALLOY-WORKFLOW:START -->";
export const CLAUDE_MD_MARKER_END = "<!-- ALLOY-WORKFLOW:END -->";

export async function injectClaudeMd(opts: DeployOptions): Promise<boolean> {
  if (!opts.injectClaudeMd) return false;

  const claudeMdPath = join(opts.projectPath, "CLAUDE.md");
  const fragment = [
    "",
    CLAUDE_MD_MARKER_START,
    "## Alloy 工作流",
    "",
    "本项目使用 [Alloy](https://github.com/Rushing0711/alloy) 管理开发工作流。",
    "",
    "常用命令：",
    "- `/alloy-start [topic]` - 智能入口",
    "- `/alloy-plan [name]` - 制品规划",
    "- `/alloy-apply [name]` - 执行实现",
    "- `/alloy-archive [name]` - 归档与收尾",
    "- `/alloy-finish [name]` - 独立收尾",
    "- `/alloy-fix` - Bug 修复",
    "- `/alloy-status [name]` - 查看状态",
    "",
    CLAUDE_MD_MARKER_END,
    "",
  ].join("\n");

  let existing = "";
  try {
    existing = await readFile(claudeMdPath, "utf-8");
  } catch {
    // CLAUDE.md 不存在
  }

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
