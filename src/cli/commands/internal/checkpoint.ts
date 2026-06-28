// src/cli/commands/internal/checkpoint.ts
import { realpathSync } from "node:fs";
import { basename, relative } from "node:path";
import { execSync } from "node:child_process";
import { readState } from "../../utils/state.js";

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 时间戳用于 tag 名（去掉空格和冒号） */
function tagTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** 找到 changeDir 所在的 git 仓库根目录 */
function findGitRoot(changeDir: string): { root: string; relPath: string } | null {
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      cwd: changeDir,
      encoding: "utf-8",
    }).trim();
    const realChangeDir = realpathSync(changeDir);
    let rel = relative(root, realChangeDir);
    if (rel === "") rel = ".";
    return { root, relPath: rel };
  } catch {
    return null;
  }
}

/** 校验 phase 允许检查点操作。
 *  start/plan 阶段：允许。
 *  apply 阶段：仅当 worktree 未创建 + SDD/EP 未启动（apply 早期）时允许；否则禁止。
 *  archive/finish 阶段：禁止。
 */
async function assertCheckpointPhase(changeDir: string): Promise<boolean> {
  const state = await readState(changeDir);
  const phase = state.phase;

  if (phase === "started" || phase === "planned") {
    return true;
  }

  if (phase === "applied") {
    // apply 早期判断：worktree 未创建 + SDD/EP 未启动
    const worktreeCreated = state.worktree && state.worktree !== "skipped" && state.worktree !== "null";
    const sddEpStarted = (state.skill_usage ?? []).some(
      s => s.skill === "superpowers:subagent-driven-development" || s.skill === "superpowers:executing-plans"
    );
    if (!worktreeCreated && !sddEpStarted) {
      return true; // apply 早期，允许检查点操作
    }
    console.error(`⛔ [PRECONDITION_FAIL] apply 中后期禁止检查点操作——worktree 已创建或 SDD/EP 已启动，回退会破坏一致性。`);
    console.error(`  worktree: ${state.worktree ?? "null"} | SDD/EP 已启动: ${sddEpStarted}`);
    console.error(`  如需变更，请用 /alloy:discard 重开 change。`);
    process.exit(1);
    return false;
  }

  // archive/finished
  console.error(`⛔ [PRECONDITION_FAIL] 检查点操作仅 start/plan/apply 早期允许，当前 phase=${phase}`);
  console.error(`  ${phase} 阶段禁止检查点操作。如需变更，请用 /alloy:discard 重开 change。`);
  process.exit(1);
  return false;
}

/** 从 change name 推导 tag 前缀 */
function tagPrefix(changeName: string): string {
  return `alloy-checkpoint-${changeName}-`;
}

/** 列出该 change 所有 checkpoint tag 名 */
function listCheckpointTags(gitRoot: string, changeName: string): string[] {
  try {
    const out = execSync(`git tag -l "${tagPrefix(changeName)}*"`, {
      cwd: gitRoot,
      encoding: "utf-8",
    }).trim();
    return out ? out.split("\n") : [];
  } catch {
    return [];
  }
}

/** 读取 tag 注释 */
function readTagAnnotation(gitRoot: string, tag: string): string {
  try {
    return execSync(`git tag -l "${tag}" --format='%(contents)'`, {
      cwd: gitRoot,
      encoding: "utf-8",
    }).trim();
  } catch {
    return "";
  }
}

/**
 * alloy _checkpoint create <change-dir> [--reason <原因>] [--kind <brainstorming|progress>]
 * 在当前 HEAD 打 tag，注释含原因/制品/phase/commit数/时间。
 *
 * --kind brainstorming: 打 brainstorming-N 检查点（draft commit 后锚点，N=现有 brainstorming tag 数+1）
 * --kind progress: 打 progress-<ts> 检查点（回退前进度快照）
 * 不传 --kind: 打 <ts> 检查点（用户主动创建）
 *
 * 前置校验：
 * 1. phase 允许检查点操作（start/plan 阶段）
 * 2. working tree clean（避免未提交变更在切换检查点时丢失）——agent 必须先 commit
 */
async function checkpointCreate(args: string[]): Promise<void> {
  const changeDir = args[0];
  if (!changeDir) {
    console.error("用法: alloy _checkpoint create <change-dir> [--reason <原因>] [--kind <brainstorming|progress>]");
    process.exit(1);
    return;
  }

  // 解析可选参数
  let reason: string | undefined;
  let kind: string | undefined;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--reason" && i + 1 < args.length) {
      reason = args[++i];
    } else if (args[i] === "--kind" && i + 1 < args.length) {
      kind = args[++i];
    }
  }

  if (!(await assertCheckpointPhase(changeDir))) return;

  const gitRoot = findGitRoot(changeDir);
  if (!gitRoot) {
    console.error(`[FAIL] 不在 git 仓库中: ${changeDir}`);
    process.exit(1);
    return;
  }

  // 校验 working tree clean——dirty 时拒绝创建检查点
  try {
    const dirty = execSync("git status --porcelain", {
      cwd: gitRoot.root,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    if (dirty) {
      console.error(`⛔ [PRECONDITION_FAIL] working tree 有未提交变更，拒绝创建检查点`);
      console.error(`  检查点是 git tag 指向 HEAD commit，未提交变更不会被 tag 保护。`);
      console.error(`  请先 commit 当前变更后再创建检查点。`);
      console.error(`  禁止 agent 自动 git stash 兜底（§3.5.1 自救禁令）。`);
      process.exit(1);
      return;
    }
  } catch (e) {
    // git status 失败（极少见）继续——后续 git tag 会暴露真实问题
  }

  // 读取当前状态（最新值，避免 agent 旧值错误）
  const state = await readState(changeDir);
  const records = state.records ?? [];
  const artifactList = records.map(r => r.artifact).join(", ") || "（无）";
  const phase = state.phase;
  const now = formatTimestamp();

  const changeName = basename(changeDir);

  // 计算 base..HEAD commit 数（用于 tag message）
  let commitCount = "—";
  try {
    const mainBranch = state.feature_branch ? "main" : "main";
    const base = execSync(`git merge-base ${mainBranch} HEAD`, {
      cwd: gitRoot.root, encoding: "utf-8", stdio: "pipe",
    }).trim();
    if (base) {
      const count = execSync(`git rev-list --count ${base}..HEAD`, {
        cwd: gitRoot.root, encoding: "utf-8", stdio: "pipe",
      }).trim();
      commitCount = count;
    }
  } catch {
    // base 计算失败用 —
  }

  // 确定 tag 名
  const ts = tagTimestamp();
  let tagName: string;
  if (kind === "brainstorming") {
    // brainstorming-N：N = 现有 brainstorming tag 数 + 1
    const existing = listCheckpointTags(gitRoot.root, changeName)
      .filter(t => t.match(/-brainstorming-\d+$/));
    const N = existing.length + 1;
    tagName = `${tagPrefix(changeName)}brainstorming-${N}`;
  } else if (kind === "progress") {
    tagName = `${tagPrefix(changeName)}progress-${ts}`;
  } else {
    tagName = `${tagPrefix(changeName)}${ts}`;
  }

  // 构造增强注释
  const reasonLine = reason || (kind === "brainstorming" ? "brainstorming 锚点（draft 已锁定，发起变更回退点）" : kind === "progress" ? "回退前进度快照（放弃变更回退点）" : "用户主动创建");
  const annotation = [
    `原因: ${reasonLine}`,
    `制品: ${artifactList}`,
    `phase: ${phase}`,
    `commit 数: ${commitCount}`,
    `时间: ${now}`,
  ].join("\n");

  try {
    execSync(`git tag -a "${tagName}" -m "${annotation.replace(/"/g, '\\"')}"`, {
      cwd: gitRoot.root,
      stdio: "pipe",
    });
    console.log(`✓ 已创建检查点: ${tagName}`);
    console.log(`  ${annotation.split("\n").join("\n  ")}`);
  } catch (e) {
    const err = e as { stderr?: Buffer; message: string };
    const stderr = err.stderr?.toString() ?? "";
    console.error(`[FAIL] git tag 失败: ${err.message}${stderr ? `\n${stderr}` : ""}`);
    process.exit(1);
  }
}

/**
 * alloy _checkpoint list <change-dir> [--json]
 * 列出该 change 所有 checkpoint tag + 注释。
 */
async function checkpointList(args: string[]): Promise<void> {
  const changeDir = args[0];
  const jsonMode = args.includes("--json");

  if (!changeDir) {
    console.error("用法: alloy _checkpoint list <change-dir> [--json]");
    process.exit(1);
    return;
  }

  const gitRoot = findGitRoot(changeDir);
  if (!gitRoot) {
    console.error(`[FAIL] 不在 git 仓库中: ${changeDir}`);
    process.exit(1);
    return;
  }

  // 从 changeDir 推导 change name，剥离 archive 路径的 YYYY-MM-DD- 前缀
  const changeName = basename(changeDir).replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const tags = listCheckpointTags(gitRoot.root, changeName);

  if (jsonMode) {
    const result = tags.map(tag => ({
      tag,
      annotation: readTagAnnotation(gitRoot.root, tag),
    }));
    console.log(JSON.stringify(result));
    return;
  }

  if (tags.length === 0) {
    console.log(`（无 checkpoint tag）`);
    return;
  }

  console.log(`Checkpoint tags for change '${changeName}':`);
  console.log("");
  for (const tag of tags) {
    const annotation = readTagAnnotation(gitRoot.root, tag);
    console.log(`  ${tag}`);
    for (const line of annotation.split("\n")) {
      if (line.trim()) console.log(`    ${line}`);
    }
    console.log("");
  }
}

/**
 * alloy _checkpoint switch <change-dir> <tag>
 * 强制重置 feature 分支到 tag 指向的 commit。
 *
 * 核心命令: git checkout -B <feature-branch> <tag>
 *
 * 语义：原子地"创建或重置分支到指定位置"。git 自动同步工作目录到 tag 状态
 * （含 .alloy.yaml 的 phase/records/phase_timings + 制品文件），无需 alloy
 * 手动清理任何文件。
 *
 * 与 git reset --hard 区别：-B 是 git 内置的分支创建/重置语义，不在 §3.5.1
 * 自救禁令清单内。
 */
async function checkpointSwitch(args: string[]): Promise<void> {
  const changeDir = args[0];
  const targetTag = args[1];

  if (!changeDir || !targetTag) {
    console.error("用法: alloy _checkpoint switch <change-dir> <tag>");
    process.exit(1);
    return;
  }

  if (!(await assertCheckpointPhase(changeDir))) return;

  const gitRoot = findGitRoot(changeDir);
  if (!gitRoot) {
    console.error(`[FAIL] 不在 git 仓库中: ${changeDir}`);
    process.exit(1);
    return;
  }

  // 校验 tag 前缀属于当前 change
  const changeName = basename(changeDir);
  if (!targetTag.startsWith(tagPrefix(changeName))) {
    console.error(`⛔ [PRECONDITION_FAIL] tag '${targetTag}' 不属于 change '${changeName}'`);
    console.error(`  仅允许切换到当前 change 的 checkpoint tag（前缀: ${tagPrefix(changeName)}）`);
    process.exit(1);
    return;
  }

  // 校验 tag 存在
  try {
    execSync(`git rev-parse --verify "refs/tags/${targetTag}"`, {
      cwd: gitRoot.root,
      stdio: "pipe",
    });
  } catch {
    console.error(`⛔ [PRECONDITION_FAIL] tag '${targetTag}' 不存在`);
    console.error(`  用 alloy _checkpoint list ${changeDir} 查看可用 tag`);
    process.exit(1);
    return;
  }

  // 读取 feature_branch
  const state = await readState(changeDir);
  const featureBranch = state.feature_branch;
  if (!featureBranch) {
    console.error(`⛔ [PRECONDITION_FAIL] .alloy.yaml 未记录 feature_branch`);
    process.exit(1);
    return;
  }

  // 校验当前不在 worktree 中（worktree 引用会阻止 -B 强制移动分支）
  try {
    const gitDir = execSync(`git rev-parse --git-dir`, {
      cwd: gitRoot.root,
      encoding: "utf-8",
    }).trim();
    const gitCommon = execSync(`git rev-parse --git-common-dir`, {
      cwd: gitRoot.root,
      encoding: "utf-8",
    }).trim();
    const realGitDir = realpathSync(gitDir);
    const realGitCommon = realpathSync(gitCommon);
    if (realGitDir !== realGitCommon) {
      console.error(`⛔ [PRECONDITION_FAIL] 当前在 worktree 内，不允许检查点切换`);
      console.error(`  worktree 引用会阻止分支重置。请在主仓执行检查点切换。`);
      process.exit(1);
      return;
    }
  } catch {
    // git rev-parse 失败不会到这里（前面 findGitRoot 已校验）
  }

  // 原子切换：git checkout -B 强制创建或重置分支到 tag 指向的 commit
  // 失败时（如工作目录脏文件冲突），原状不变
  try {
    execSync(`git checkout -B "${featureBranch}" "${targetTag}"`, {
      cwd: gitRoot.root,
      stdio: "pipe",
    });

    console.log(`✓ 已切换到 tag ${targetTag}`);
    console.log(`  分支 ${featureBranch} 已重置到该 tag`);

    // 切换后读取 tag 指向的 .alloy.yaml 状态，输出 records 状态
    // 原因：切回旧检查点后 .alloy.yaml 的 records 也回到旧状态，
    // agent 必须从缺失制品开始 plan，不能跳过。
    try {
      const newState = await readState(changeDir);
      const records = newState.records ?? [];
      const lockedArtifacts = records.map(r => r.artifact).filter(Boolean);
      const allArtifacts = ["draft", "proposal", "design", "specs", "tasks", "plans"];
      const missing = allArtifacts.filter(a => !lockedArtifacts.includes(a));

      console.log(``);
      console.log(`  当前 records 状态（来自 tag 指向的 .alloy.yaml）：`);
      if (lockedArtifacts.length > 0) {
        console.log(`    已锁定制品: ${lockedArtifacts.join(", ")}`);
      } else {
        console.log(`    已锁定制品: （无）`);
      }
      if (missing.length > 0) {
        console.log(`    缺失制品: ${missing.join(", ")}`);
        console.log(`    ⚠️ 后续 plan 必须从第一个缺失制品开始，不允许跳过。`);
      }
      console.log(`    phase: ${newState.phase}`);
    } catch {
      // 读取状态失败不阻断切换——后续 plan 阶段会暴露真实问题
    }
  } catch (e) {
    const err = e as { stderr?: Buffer; message: string };
    const stderr = err.stderr?.toString() ?? "";
    console.error(`[FAIL] 切换失败: ${err.message}${stderr ? `\n${stderr}` : ""}`);
    console.error(`  git checkout -B 失败时原分支状态保持不变（git 内置原子性）。`);
    console.error(`  常见原因：工作目录有未提交变更冲突。请检查 git status。`);
    process.exit(1);
  }
}

/**
 * alloy _checkpoint clean <change-dir>
 * 删除该 change 所有 checkpoint tag。archive/discard/finish 时调用。
 *
 * changeDir 可能是：
 * - 原始路径：openspec/changes/<name> → basename = <name>
 * - archive 路径：openspec/changes/archive/YYYY-MM-DD-<name> → basename = YYYY-MM-DD-<name>
 *   需剥离日期前缀才能匹配 alloy-checkpoint-<name>-* tag
 */
async function checkpointClean(args: string[]): Promise<void> {
  const changeDir = args[0];
  if (!changeDir) {
    console.error("用法: alloy _checkpoint clean <change-dir>");
    process.exit(1);
    return;
  }

  const gitRoot = findGitRoot(changeDir);
  if (!gitRoot) {
    console.error(`[FAIL] 不在 git 仓库中: ${changeDir}`);
    process.exit(1);
    return;
  }

  // 从 changeDir 推导 change name，剥离 archive 路径的 YYYY-MM-DD- 前缀
  const rawName = basename(changeDir);
  const changeName = rawName.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const tags = listCheckpointTags(gitRoot.root, changeName);

  if (tags.length === 0) {
    console.log(`（无 checkpoint tag 需清理）`);
    return;
  }

  for (const tag of tags) {
    try {
      execSync(`git tag -d "${tag}"`, {
        cwd: gitRoot.root,
        stdio: "pipe",
      });
    } catch {
      // 单个 tag 删除失败不阻断后续
      console.error(`[WARN] 删除 tag 失败: ${tag}`);
    }
  }

  console.log(`✓ 已清理 ${tags.length} 个 checkpoint tag`);
}

export async function checkpointCommand(args: string[]): Promise<void> {
  const action = args[0];

  if (!action) {
    console.error("用法: alloy _checkpoint <create|list|switch|clean> <change-dir> [...]");
    process.exit(1);
    return;
  }

  switch (action) {
    case "create":
      return checkpointCreate(args.slice(1));
    case "list":
      return checkpointList(args.slice(1));
    case "switch":
      return checkpointSwitch(args.slice(1));
    case "clean":
      return checkpointClean(args.slice(1));
    default:
      console.error(`未知操作: ${action} (支持: create, list, switch, clean)`);
      process.exit(1);
  }
}
