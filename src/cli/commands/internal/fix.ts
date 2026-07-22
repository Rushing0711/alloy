// src/cli/commands/internal/fix.ts
// alloy _fix 命令:alloy-fix skill 的辅助 CLI。
//
// 用法:alloy _fix detect-keywords <description>
//
// 扫描描述中的关键词(优化/性能/performance/refactor/重构/改造/增强/enhancement/提升/更好/更快)。
// 命中 -> 输出关键词列表(去重,空格分隔)
// 未命中 -> 输出 "none"
//
// 用于 alloy-fix SKILL.md 的关键词二次 USER_GATE 检测(task L6)。
// 替代手写 KEYWORDS="..." + grep -Eo bash(6 行噪音,且关键词列表易被 agent 误改)。
//
// 多 agent 适配:Claude Code / OpenCode / Pi 都用此命令,无平台差异。

const KEYWORDS = [
  "优化", "性能", "performance",
  "refactor", "重构", "改造",
  "增强", "enhancement", "提升",
  "更好", "更快",
];

export async function fixCommand(args: string[]): Promise<void> {
  const subCommand = args[0];
  if (subCommand === "detect-keywords") {
    return detectKeywordsFix(args.slice(1));
  }

  console.error("用法: alloy _fix detect-keywords <description>");
  console.error("  扫描描述中的关键词(优化/性能/refactor/重构等)");
  console.error("  命中 -> 输出关键词列表(去重,空格分隔);未命中 -> 输出 none");
  process.exit(1);
}

async function detectKeywordsFix(args: string[]): Promise<void> {
  const description = args.join(" ");
  if (!description) {
    console.error("用法: alloy _fix detect-keywords <description>");
    console.error("  扫描描述中的关键词(优化/性能/refactor/重构等)");
    console.error("  命中 -> 输出关键词列表(去重,空格分隔);未命中 -> 输出 none");
    process.exit(1);
    return;
  }

  const hits = new Set<string>();
  const lowerDesc = description.toLowerCase();
  for (const kw of KEYWORDS) {
    const lowerKw = kw.toLowerCase();
    if (lowerDesc.includes(lowerKw)) {
      hits.add(kw);
    }
  }

  if (hits.size === 0) {
    // 无命中不输出(bash $() 捕获为空,保持 alloy-fix [ -n "$HIT" ] 兼容)
    return;
  }

  console.log(Array.from(hits).join(" "));
}
