// src/cli/commands/internal/retro.ts
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";
import { readState, readProjectConfig, formatTimestamp } from "../../utils/state.js";
import type { AlloyState, ArtifactRecord, SkillUsageEntry, PhaseTimings } from "../../../core/types.js";

function git(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
  } catch {
    return "";
  }
}

/** 剥离 archive 日期前缀，得到 change name（与 _checkpoint 一致） */
function changeName(changeDir: string): string {
  return basename(changeDir).replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

/** 解析两个 "YYYY-MM-DD HH:MM:SS" 的时间差，返回人类可读字符串 */
function durationBetween(start: string, end: string): string {
  if (!start || !end) return "—";
  const s = new Date(start.replace(" ", "T")).getTime();
  const e = new Date(end.replace(" ", "T")).getTime();
  if (isNaN(s) || isNaN(e)) return "—";
  const sec = Math.max(0, Math.round((e - s) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m${ss}s`;
  return `${ss}s`;
}

function buildArtifactChain(records: ArtifactRecord[]): string {
  // 审批链只列 retrospective 之前已锁定的制品。retrospective 自身在 scaffold 运行时
  // 尚未审批/commit，列入是自指——它的审批栏要等 apply.md 审查通过后才有意义，不在此处补占位行。
  const rows = records
    .filter(r => r.artifact !== "retrospective")
    .map(r => `| ${r.artifact} | ${r.approver} | ${r.hash} | ${r.committed_at} |`);
  return ["| 制品 | 审批人 | Hash | 审批时间 |", "|------|--------|------|---------|", ...rows].join("\n");
}

function buildCommitByType(base: string, gitRoot: string): string {
  if (!base) return "（base 不可用，跳过 commit 统计）";
  const log = git(`git log ${base}..HEAD --format=%s`, gitRoot);
  if (!log) return "（无 commit）";
  const lines = log.split("\n").filter(Boolean);
  const types: Record<string, number> = {};
  for (const line of lines) {
    const m = line.match(/^(\w+)(\(.+?\))?:/);
    const type = m ? m[1] : "其他";
    types[type] = (types[type] ?? 0) + 1;
  }
  const rows = Object.entries(types).map(([t, n]) => `| ${t} | ${n} |`);
  return ["| Type | 数量 |", "|------|-----|", ...rows].join("\n");
}

/** 按阶段汇总 commit：用"记录 X 阶段开始时间"边界 commit 分段。
 *  新设计下回退用 git checkout，旧 commit 不在 HEAD 链，同一阶段不会重复出现边界 commit。
 *  "记录 X 阶段开始时间"作为阶段起点，之后到下一个"记录 Y 阶段开始时间"之前的所有 commit 归 X（含"记录 X 阶段完成时间"）。
 *  第一个边界 commit 之前的 commit 归"前置"（如基础设施 commit）。 */
function buildCommitByStage(base: string, gitRoot: string): string {
  if (!base) return "（base 不可用，跳过阶段汇总）";
  const log = git(`git log ${base}..HEAD --reverse --format=%s`, gitRoot);
  if (!log) return "（无 commit）";
  const lines = log.split("\n").filter(Boolean);

  const stageCount: Record<string, number> = {};
  let currentStage = "前置";
  const startRe = /记录 (\S+) 阶段开始时间/;

  for (const line of lines) {
    const startM = line.match(startRe);
    if (startM) {
      currentStage = startM[1];
    }
    stageCount[currentStage] = (stageCount[currentStage] ?? 0) + 1;
  }

  const stageOrder = ["前置", "start", "plan", "apply", "archive", "finish"];
  const rows: string[] = [];
  for (const st of stageOrder) {
    if (!(st in stageCount)) continue;
    rows.push(`| ${st} | ${stageCount[st]} |`);
  }
  return ["| 阶段 | Commit 数 |", "|------|----------|", ...rows].join("\n");
}

function buildPhaseTimings(timings: PhaseTimings | undefined): string {
  const phases: (keyof PhaseTimings)[] = ["start", "plan", "apply", "archive", "finish"];
  const rows: string[] = [];
  let prevCompleted = "";
  for (const p of phases) {
    const t = timings?.[p];
    if (!t) continue;
    const started = t.started_at ?? "—";
    const completed = t.completed_at ?? "—";
    const dur = (t.started_at && t.completed_at) ? durationBetween(t.started_at, t.completed_at) : "—";
    const gap = (prevCompleted && t.started_at) ? durationBetween(prevCompleted, t.started_at) : "—";
    rows.push(`| ${p} | ${started} | ${completed} | ${dur} | ${gap} |`);
    if (t.completed_at) prevCompleted = t.completed_at;
  }
  return ["| 阶段 | 开始 | 结束 | 阶段内耗时 | 距上阶段间隔 |", "|------|------|------|-----------|------------|", ...rows].join("\n");
}

function buildCheckpoints(changeDir: string, gitRoot: string, _base: string): string {
  const name = changeName(changeDir);
  const pattern = `"alloy-checkpoint-${name}-*"`;
  // 数量：只列 tag 名，避免多行 annotation 换行被误当 tag 边界
  const tagNames = git(`git tag -l ${pattern}`, gitRoot);
  if (!tagNames) {
    return `无检查点 tag（需求稳定，未回退）`;
  }
  const count = tagNames.split("\n").filter(Boolean).length;
  // 展示：取 tag 名 + 完整注释，按"含 tab 的行是新 tag 起始"分组解析字段
  const tagsFmt = git(`git tag -l --format='%(refname:short)%09%(contents)' ${pattern}`, gitRoot);
  const prefix = `alloy-checkpoint-${name}-`;
  const rows: string[] = [];
  let currentTag = "";
  let annoLines: string[] = [];
  const flush = () => {
    if (!currentTag) return;
    const shortTag = currentTag.startsWith(prefix) ? currentTag.slice(prefix.length) : currentTag;
    const fields: Record<string, string> = {};
    for (const line of annoLines) {
      const m = line.match(/^\s*(原因|制品|phase|commit 数|时间)\s*:\s*(.*)$/);
      if (m) fields[m[1]] = m[2].trim();
    }
    rows.push(`| ${shortTag} | ${fields["原因"] ?? "—"} | ${fields["制品"] ?? "—"} | ${fields["phase"] ?? "—"} | ${fields["commit 数"] ?? "—"} | ${fields["时间"] ?? "—"} |`);
  };
  for (const line of tagsFmt.split("\n")) {
    if (line.includes("\t")) {
      flush();
      const [tag, ...rest] = line.split("\t");
      currentTag = tag;
      annoLines = [rest.join("\t")];
    } else {
      annoLines.push(line);
    }
  }
  flush();
  return [
    `共 ${count} 个检查点：`,
    "",
    "| 检查点 | 原因 | 制品 | phase | commit 数 | 时间 |",
    "|--------|------|------|-------|-----------|------|",
    ...rows,
    "",
    "> 检查点 tag 存在说明发生过 brainstorming 锚点保存或 plan 阶段回退前快照。回退后旧 commit 不在 HEAD 链，retrospective 只统计最终生效轮。",
  ].join("\n");
}

function buildSkillAudit(skillUsage: SkillUsageEntry[]): string {
  if (!skillUsage || skillUsage.length === 0) {
    return "> ⚠️ 当前 change 无 skill_usage 记录（旧 change），以下数据不可用。";
  }
  const byStage: Record<string, SkillUsageEntry[]> = {};
  for (const s of skillUsage) {
    (byStage[s.stage] ??= []).push(s);
  }
  const stageOrder = ["start", "plan", "apply", "archive", "finish"];
  const parts: string[] = [];
  for (const stage of stageOrder) {
    const entries = byStage[stage];
    if (!entries) continue;
    parts.push(`### ${stage} 阶段\n`);
    parts.push("| 技能/命令 | 使用 | 原因 |");
    parts.push("|----------|:---:|------|");
    for (const e of entries) {
      const used = e.used ? "✓" : "✗";
      const countSuffix = e.used && e.count && e.count > 1 ? ` (×${e.count})` : "";
      const reason = e.used ? (e.via ? `via ${e.via}` : "") : (e.reason ?? "");
      parts.push(`| \`${e.skill}\`${countSuffix} | ${used} | ${reason} |`);
    }
    parts.push("");
  }
  return parts.join("\n");
}

export async function retroCommand(args: string[]): Promise<void> {
  const action = args[0];
  const changeDir = args[1];

  if (action !== "scaffold" || !changeDir) {
    console.error("用法: alloy _retro scaffold <change-dir>");
    process.exit(1);
    return;
  }

  if (!existsSync(changeDir)) {
    console.error(`⛔ change 目录不存在: ${changeDir}`);
    process.exit(1);
    return;
  }

  let state: AlloyState;
  try {
    state = await readState(changeDir);
  } catch {
    console.error(`⛔ .alloy.yaml 不存在: ${changeDir}`);
    process.exit(1);
    return;
  }

  const gitRoot = git("git rev-parse --show-toplevel", changeDir) || changeDir;

  // 读 main_branch + 解析 base = merge-base(main_branch, feature_branch)
  const config = await readProjectConfig(gitRoot);
  const mainBranch = config.alloy?.main_branch ?? "main";
  const featureBranch = state.feature_branch ?? "";
  let base = "";
  let baseNote = "";
  if (featureBranch) {
    base = git(`git merge-base ${mainBranch} ${featureBranch}`, gitRoot);
    if (!base) baseNote = `merge-base(${mainBranch}, ${featureBranch}) 失败——commit 统计不可用`;
  } else {
    baseNote = "feature_branch 缺失，无法确定 base——commit 统计不可用";
  }

  const diffStat = base ? (git(`git diff --stat ${base}..HEAD`, gitRoot).split("\n").pop() ?? "") : "";
  const commitLog = base ? git(`git log ${base}..HEAD --oneline`, gitRoot) : "";

  // tasks.md checkbox
  let taskRatio = "—";
  const tasksPath = join(changeDir, "tasks.md");
  if (existsSync(tasksPath)) {
    const tasksContent = await readFile(tasksPath, "utf-8");
    const total = (tasksContent.match(/- \[[ x]\]/g) ?? []).length;
    const done = (tasksContent.match(/- \[x\]/g) ?? []).length;
    if (total > 0) taskRatio = `${done} / ${total} = ${Math.round((done / total) * 100)}%`;
  }

  // verify.md decision
  let verifyDecision = "—";
  const verifyPath = join(changeDir, "verify.md");
  if (existsSync(verifyPath)) {
    const v = await readFile(verifyPath, "utf-8");
    if (/FAIL/.test(v)) verifyDecision = "FAIL";
    else if (/WARNING/i.test(v)) verifyDecision = "WARNING";
    else if (/PASS/.test(v)) verifyDecision = "PASS";
    else verifyDecision = "（verify.md 无明确决策标记）";
  }

  // plans.md frontmatter strategy / reason
  let planStrategy = "—";
  const plansPath = join(changeDir, "plans.md");
  if (existsSync(plansPath)) {
    const p = await readFile(plansPath, "utf-8");
    const fmMatch = p.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const fm = fmMatch[1];
      const strategyM = fm.match(/strategy:\s*(.+)/);
      const reasonM = fm.match(/reason:\s*(.+)/);
      const strategy = strategyM ? strategyM[1].trim() : "";
      const reason = reasonM ? reasonM[1].trim() : "";
      if (strategy) planStrategy = reason ? `${strategy}（${reason}）` : strategy;
    }
  }

  const timestamp = formatTimestamp();

  const out = [
    `> 生成时间: ${timestamp}`,
    `> 本节（§0 量化全景 + §4 技能审计）由 \`alloy _retro scaffold\` 自动生成，请勿手动改写。`,
    "",
    "# Retrospective",
    "",
    "## §0 量化全景",
    "",
    "### 全周期时间线",
    `- 开始（started_at）：${state.started_at ?? "—"}`,
    `- 截止本次 retrospective 生成：${timestamp}`,
    state.completed_at ? `- 全周期完成（completed_at）：${state.completed_at}` : "- （retrospective 在 apply 阶段生成，此时尚未 finish；completed_at 待 finish 阶段写入）",
    "",
    "### 制品审批链",
    buildArtifactChain(state.records),
    "",
    "### Commit 汇总（按 type）",
    baseNote ? `> ${baseNote}` : buildCommitByType(base, gitRoot),
    "",
    "### Commit 汇总（按阶段）",
    baseNote ? `> ${baseNote}` : buildCommitByStage(base, gitRoot),
    "",
    "### 阶段耗时 + 阶段间隔",
    buildPhaseTimings(state.phase_timings),
    "",
    "### 检查点使用",
    buildCheckpoints(changeDir, gitRoot, base),
    "",
    "### 任务完成比",
    taskRatio,
    "",
    "### 变更规模",
    base ? (diffStat || "（无文件变更）") : "（base 不可用）",
    "",
    "### Worktree 状态",
    state.worktree === "skipped" ? "skipped（未使用隔离环境）" : (state.worktree ?? "—"),
    "",
    "### 验证状态",
    verifyDecision,
    "",
    "### 计划策略",
    planStrategy === "—" ? "—（plans.md 无 frontmatter strategy）" : `计划推荐：${planStrategy}（实际采用方式见 §3 定性分析）`,
    "",
    "### 完整提交链",
    "```",
    commitLog || "（base 不可用或无 commit）",
    "```",
    "",
    "## §4 全周期技能审计",
    "",
    buildSkillAudit(state.skill_usage),
    "",
    "### Deliberately Skipped Skills",
    "<!-- 对每个标 ✗ 的技能，agent 填写三问：What was skipped / Why this cycle / How to prevent recurrence -->",
    "",
    "---",
    "",
    "<!-- 以下章节由 agent 填写定性分析 -->",
    "",
    "## §1 做对了什么",
    "<!-- 每条引用 §0 的证据（commit hash / 文件 / 测试名） -->",
    "",
    "## §2 做错了什么",
    "<!-- 🔴 blocking / 🟡 painful / 📌 nit，每条带 evidence -->",
    "",
    "## §3 计划偏离",
    "| Plan task | What changed | Why |",
    "|-----------|-------------|-----|",
    "| | | |",
    "",
    "## §5 意外发现",
    "<!-- 哪些假设被推翻 -->",
    "",
    "## §6 值得推广",
    "<!-- - [ ] checklist，含 Promote to / Why / How to apply -->",
    "",
    "---",
    "",
    "> **Forward-Pointer 策略**：后续 cycle 发现本 retrospective 结论有误时，不重写，追加 `> **Update YYYY-MM-DD**: section X superseded by <链接>`。",
    "",
  ].join("\n");

  const outPath = join(changeDir, "retrospective.md");
  await writeFile(outPath, out, "utf-8");
  console.log(`✓ retrospective.md 骨架已生成: ${outPath}`);
  console.log(`  §0/§4 机械数据已填充，agent 需补 §1/§2/§3/§5/§6 定性分析`);
  if (baseNote) console.log(`  ⚠️ ${baseNote}`);
}
