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

/** 校验 phase === "started"——检查点切换仅 plan 完成之前允许。返回 true 表示通过。 */
async function assertStartedPhase(changeDir: string): Promise<boolean> {
  const state = await readState(changeDir);
  if (state.phase !== "started") {
    console.error(`⛔ [PRECONDITION_FAIL] 检查点切换仅 plan 完成之前允许，当前 phase=${state.phase}`);
    console.error(`  plan 完成后（phase=planned/applied/archived/finished）禁止检查点切换。`);
    console.error(`  如需变更，请用 /alloy:discard 重开 change。`);
    process.exit(1);
    return false;
  }
  return true;
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
 * alloy _checkpoint create <change-dir>
 * 在当前 HEAD 打 tag，注释含锁定制品列表 + phase + 时间。
 *
 * 前置校验：
 * 1. phase === "started"（仅 plan 完成前允许创建检查点）
 * 2. working tree clean（避免未提交变更在切换检查点时丢失）——agent 必须先 commit
 */
async function checkpointCreate(args: string[]): Promise<void> {
  const changeDir = args[0];
  if (!changeDir) {
    console.error("用法: alloy _checkpoint create <change-dir>");
    process.exit(1);
    return;
  }

  if (!(await assertStartedPhase(changeDir))) return;

  const gitRoot = findGitRoot(changeDir);
  if (!gitRoot) {
    console.error(`[FAIL] 不在 git 仓库中: ${changeDir}`);
    process.exit(1);
    return;
  }

  // 校验 working tree clean——dirty 时拒绝创建检查点
  // 原因：检查点是 git tag 指向当前 HEAD commit，未提交变更不在 tag 范围内。
  // 切换到其他检查点会让未提交变更"漂浮"（不属于任何检查点），用户后续无法定位。
  // 禁止 agent 自行 git stash 兜底——必须让用户先 commit。
  try {
    const dirty = execSync("git status --porcelain", {
      cwd: gitRoot.root,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    if (dirty) {
      console.error(`⛔ [PRECONDITION_FAIL] working tree 有未提交变更，拒绝创建检查点`);
      console.error(`  检查点是 git tag 指向 HEAD commit，未提交变更不会被 tag 保护。`);
      console.error(`  请先 commit 当前变更后再创建检查点：`);
      console.error(`    git status                          # 查看变更`);
      console.error(`    git add <精确路径>                   # 暂存（禁 -A，§5.2.1）`);
      console.error(`    git commit -m "<描述>"               # 提交`);
      console.error(`    alloy _checkpoint create ${changeDir}  # 重新创建检查点`);
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
  const ts = tagTimestamp();
  const tagName = `${tagPrefix(changeName)}${ts}`;

  // 构造注释——只描述"包含什么"，不含"原因"
  const annotation = [
    `锁定制品: ${artifactList}`,
    `phase: ${phase}`,
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

  if (!(await assertStartedPhase(changeDir))) return;

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
