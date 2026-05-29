import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const CLAUDE_MD_MARKER_START = "<!-- ALLOY-WORKFLOW:START -->";
const CLAUDE_MD_MARKER_END = "<!-- ALLOY-WORKFLOW:END -->";

export async function updateCommand(
  projectPath: string
): Promise<string[]> {
  const results: string[] = [];

  // 1. 更新 skill 文件
  try {
    execSync("npx skills update alloy", { stdio: "pipe", cwd: projectPath });
    results.push("✓ skills/alloy/ → 已更新到最新版");
  } catch {
    results.push("⚠️ skills/alloy/ 更新失败，请检查网络连接");
  }

  // 2. 更新 CLAUDE.md 中的 Alloy 标记区域（仅当文件存在时）
  const claudeMdPath = join(projectPath, "CLAUDE.md");
  if (existsSync(claudeMdPath)) {
    try {
      let content = await readFile(claudeMdPath, "utf-8");
      if (content.includes(CLAUDE_MD_MARKER_START)) {
        const latestFragment = getLatestClaudeMdFragment();
        const startIdx = content.indexOf(CLAUDE_MD_MARKER_START);
        const endIdx = content.indexOf(CLAUDE_MD_MARKER_END);
        if (endIdx > startIdx) {
          content =
            content.slice(0, startIdx) +
            latestFragment +
            content.slice(endIdx + CLAUDE_MD_MARKER_END.length);
          await writeFile(claudeMdPath, content, "utf-8");
          results.push("✓ CLAUDE.md → Alloy 标记区域已更新");
        }
      }
    } catch {
      results.push("⚠️ CLAUDE.md 更新失败");
    }
  }

  return results;
}

function getLatestClaudeMdFragment(): string {
  // v1 使用内置 fragment，后续版本从 registry 拉取最新
  return [
    "",
    CLAUDE_MD_MARKER_START,
    "## Alloy 工作流",
    "",
    "本项目使用 [Alloy](https://github.com/user/alloy) 管理开发工作流。",
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
}
