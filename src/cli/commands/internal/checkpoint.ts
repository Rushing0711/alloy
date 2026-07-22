// src/cli/commands/internal/checkpoint.ts
import { realpathSync, rmSync, existsSync } from "node:fs";
import { basename, relative, join, isAbsolute } from "node:path";
import { execSync } from "node:child_process";
import { readState } from "../../utils/state.js";
import { computeArtifactHash } from "../../../core/artifacts.js";

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

  if (phase === "starting" || phase === "started" || phase === "planning" || phase === "planned") {
    return true;
  }

  if (phase === "applying" || phase === "applied") {
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
    console.error(`  如需变更，请用 /alloy-discard 重开 change。`);
    process.exit(1);
    return false;
  }

  // archive/finished
  console.error(`⛔ [PRECONDITION_FAIL] 检查点操作仅 start/plan/apply 早期允许，当前 phase=${phase}`);
  console.error(`  ${phase} 阶段禁止检查点操作。如需变更，请用 /alloy-discard 重开 change。`);
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

  // 校验 working tree clean--dirty 时拒绝创建检查点
  // 例外 1:--kind progress 允许 dirty
  // 原因:progress 检查点是"回退前想保护的已 commit 进度",dirty 部分(user-gate reset 修改的
  // .alloy.yaml 临时状态 + 未锁定制品 untracked)本就是放弃的,不需要保护。
  // 例外 2:--kind brainstorming 允许仅 .alloy.yaml dirty(自动 commit)
  // 原因:brainstorming 检查点锚点指向 draft commit,语义严格,但 _skill log 会写 .alloy.yaml
  // 不 commit(合法的状态写入),若 draft hash 未变 _artifact commit draft 跳过 commit,.alloy.yaml
  // 残留 dirty。此场景自动 commit .alloy.yaml 后继续创建检查点。其他文件 dirty 仍拒绝。
  // 用户主动创建(无 --kind)也要求 clean(保护语义严格)。
  const allowDirty = kind === "progress";
  if (!allowDirty) {
    try {
      const dirty = execSync("git status --porcelain", {
        cwd: gitRoot.root,
        encoding: "utf-8",
        stdio: "pipe",
      }).trim();
      if (dirty) {
        // brainstorming:检查是否仅 .alloy.yaml dirty
        if (kind === "brainstorming") {
          // porcelain 格式:XY <path>(XY 2 字符状态 + 1 空格,path 从第 4 字符开始)
          // 但 dirty.trim() 会去掉首行前导空格,导致 slice(3) 位置错,用正则提取 path
          const dirtyFiles = dirty.split("\n").filter(Boolean);
          const changeRelPath = gitRoot.relPath === "." ? "" : `${gitRoot.relPath}/`;
          const alloyYamlPath = `${changeRelPath}.alloy.yaml`;
          const onlyAlloyYaml = dirtyFiles.every(line => {
            const match = line.match(/^\s*\S+\s+(.+)$/);
            const path = match ? match[1].trim() : "";
            return path === alloyYamlPath;
          });
          if (onlyAlloyYaml) {
            // 自动 commit .alloy.yaml(_skill log 的合法状态写入)
            try {
              execSync(`git add "${alloyYamlPath}"`, { cwd: gitRoot.root, stdio: "pipe" });
              execSync(`git commit -m "chore(${basename(changeDir)}): 更新 skill_usage(brainstorming 检查点前自动 commit)"`, {
                cwd: gitRoot.root, stdio: "pipe",
              });
              console.log(`ℹ️ 检测到仅 .alloy.yaml dirty(_skill log 写入),已自动 commit 后创建 brainstorming 检查点`);
            } catch (e) {
              console.error(`⛔ [FAIL] 自动 commit .alloy.yaml 失败: ${(e as Error).message}`);
              process.exit(1);
              return;
            }
          } else {
            console.error(`⛔ [PRECONDITION_FAIL] working tree 有未提交变更，拒绝创建检查点`);
            console.error(`  检查点是 git tag 指向 HEAD commit，未提交变更不会被 tag 保护。`);
            console.error(`  当前 dirty 文件:`);
            for (const line of dirtyFiles) {
              console.error(`    ${line}`);
            }
            console.error(`  brainstorming 检查点仅允许 .alloy.yaml dirty(_skill log 写入),其他文件 dirty 请先 commit。`);
            console.error(`  禁止 agent 自动 git stash 兜底（§3.5.1 自救禁令）。`);
            process.exit(1);
            return;
          }
        } else {
          console.error(`⛔ [PRECONDITION_FAIL] working tree 有未提交变更，拒绝创建检查点`);
          console.error(`  检查点是 git tag 指向 HEAD commit，未提交变更不会被 tag 保护。`);
          console.error(`  请先 commit 当前变更后再创建检查点。`);
          console.error(`  禁止 agent 自动 git stash 兜底（§3.5.1 自救禁令）。`);
          process.exit(1);
          return;
        }
      }
    } catch (e) {
      // git status 失败（极少见）继续--后续 git tag 会暴露真实问题
    }
  } else {
    // progress 检查点:检测 dirty 并告知用户哪些会被放弃
    try {
      const dirty = execSync("git status --porcelain", {
        cwd: gitRoot.root,
        encoding: "utf-8",
        stdio: "pipe",
      }).trim();
      if (dirty) {
        console.log(`ℹ️ working tree 有未提交变更(progress 检查点允许 dirty,这些变更将被放弃):`);
        for (const line of dirty.split("\n")) {
          console.log(`  ${line}`);
        }
        console.log(`  tag 指向当前 HEAD commit(已 commit 进度),dirty 部分不在 tag 保护范围。`);
      }
    } catch {
      // git status 失败继续
    }
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

    // hash 链一致性校验:brainstorming 锚点指向 draft commit,records 里的 draft hash
    // 必须与当前 draft.md 文件 hash 一致。不一致 = agent 跳过 _artifact commit 直接 Write/git commit,
    // 会导致下游 _record check 失败(实测 Pi 会话:agent Write 覆盖 draft.md 后直接 git commit,
    // records hash 旧,plan 阶段 _record check draft FAIL)。
    const draftRecord = records.find(r => r.artifact === "draft");
    if (draftRecord) {
      const currentHash = await computeArtifactHash(changeDir, "draft");
      if (currentHash && draftRecord.hash && currentHash !== draftRecord.hash) {
        console.error(`⛔ [PRECONDITION_FAIL] draft hash 不一致,拒绝创建 brainstorming 检查点`);
        console.error(`  records 记录的 draft hash: ${draftRecord.hash}`);
        console.error(`  当前 draft.md 文件 hash: ${currentHash}`);
        console.error(`  原因:agent 跳过了 _artifact commit,直接 Write/git commit 修改 draft.md。`);
        console.error(`  修复:调 alloy _artifact commit ${changeDir} draft 同步 hash + 写 records + commit。`);
        console.error(`  禁止:agent 继续创建检查点或推进 phase(hash 链断裂会让下游 _record check 失败)。`);
        process.exit(1);
        return;
      }
    }
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

  // 切换前清理 tracked 文件的未提交变更(staged + working tree)
  // CLI 内部跑,不经过 hook-guard(§3.5.1 禁令针对 agent 自动清场,CLI 内部清场是合法的:
  // 用户已在 USER_GATE 确认越界回退,未 commit = 未采纳 = 废弃)
  try {
    const dirty = execSync("git status --porcelain", {
      cwd: gitRoot.root,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    if (dirty) {
      console.log(`⚠️ 检测到未提交变更,切换前清理(用户已 USER_GATE 确认越界回退):`);
      for (const line of dirty.split("\n")) {
        console.log(`  ${line}`);
      }
      // 先 unstage 再 restore working tree,清掉 staged + unstaged 的 tracked 修改
      execSync("git restore --staged .", {
        cwd: gitRoot.root,
        stdio: "pipe",
      });
      execSync("git restore .", {
        cwd: gitRoot.root,
        stdio: "pipe",
      });
      console.log(`✓ 已清理 tracked 修改`);

      // 清理 untracked 制品文件(switch 回退后,旧制品残留会让 records 显示 pending,agent 误判)
      // 精确匹配制品文件名,不用 git clean -fd(§3.5.1 禁令 + 会误删用户自定义文件)
      // 只删当前 change 目录下的 untracked 制品,不动源码(scripts/ 等)
      cleanupUntrackedArtifacts(gitRoot.root, changeDir);
    }
  } catch (e) {
    // 清理失败不阻断--后续 git checkout -B 会暴露真实问题
  }

  // 原子切换:git checkout -B 强制创建或重置分支到 tag 指向的 commit
  // 失败时(如工作目录脏文件冲突),原状不变
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
  const verify = args.includes("--verify");
  if (!changeDir) {
    console.error("用法: alloy _checkpoint clean <change-dir> [--verify]");
    console.error("  --verify: 清理后再 list 残留 tag,有残留 exit 1(用于 finish 阶段强制校验)");
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

  // --verify: 清理后再 list,有残留 exit 1(用于 finish 阶段强制校验)
  if (verify) {
    const remaining = listCheckpointTags(gitRoot.root, changeName);
    if (remaining.length > 0) {
      console.error(`⛔ [PRECONDITION_FAIL] checkpoint tag 清理未完成,仍有残留:`);
      for (const tag of remaining) {
        console.error(`  ${tag}`);
      }
      console.error(`  禁止继续推进 phase。请手动排查:git tag -d <tag> 逐个删除,或检查 CHANGE_DIR 路径是否正确。`);
      process.exit(1);
      return;
    }
    console.log(`✓ checkpoint tag 已全部清理(--verify 校验通过)`);
  }
}

/**
 * 清理 change 目录下的 untracked 制品文件(switch 回退后,旧制品残留会让 records 显示 pending)。
 *
 * 精确匹配制品文件名,不用 git clean -fd(§3.5.1 禁令 + 会误删用户自定义文件)。
 * 只删当前 change 目录下的 untracked 制品,不动源码(scripts/ 等)。
 *
 * 制品清单:
 * - proposal.md / design.md / tasks.md / plans.md / verify.md / retrospective.md(plan/apply 阶段制品)
 * - specs/ 目录(plan 阶段制品,含 specs/<capability>/spec.md)
 * 不删 draft.md(start 阶段锚点,switch 后 tag 版本会覆盖,且是 tracked)
 */
function cleanupUntrackedArtifacts(gitRoot: string, changeDir: string): void {
  // 制品文件名清单(plan/apply 阶段产物,draft 是 start 锚点不在此列)
  const ARTIFACT_FILES = ["proposal.md", "design.md", "tasks.md", "plans.md", "verify.md", "retrospective.md"];
  const ARTIFACT_DIRS = ["specs"];

  // changeDir 相对 gitRoot 的路径(用于 git status --porcelain 输出匹配)
  const realChangeDir = realpathSync(changeDir);
  const relChangeDir = relative(gitRoot, realChangeDir);

  // 获取 untracked 文件列表(git status --porcelain,?? 开头)
  let untrackedOutput = "";
  try {
    untrackedOutput = execSync(`git status --porcelain --untracked-files=all -- "${relChangeDir}/"`, {
      cwd: gitRoot,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
  } catch {
    // git status 失败,跳过 untracked 清理(不阻断 switch)
    return;
  }

  if (!untrackedOutput) return;

  const deleted: string[] = [];
  for (const line of untrackedOutput.split("\n")) {
    // git status --porcelain 格式:"XY path"(X/Y 是状态码,?? = untracked)
    if (!line.startsWith("?? ")) continue;
    const rawPath = line.slice(3).trim().replace(/^"|"$/g, "");
    if (!rawPath) continue;

    // 解析为绝对路径(gitRoot + rawPath)
    const absPath = isAbsolute(rawPath) ? rawPath : join(gitRoot, rawPath);
    if (!existsSync(absPath)) continue;

    // 必须在 changeDir 内(防止误删其他 change 的文件)
    if (!absPath.startsWith(realChangeDir + "/") && absPath !== realChangeDir) continue;

    // 提取相对 changeDir 的路径
    const relToChange = relative(realChangeDir, absPath);

    // 匹配制品文件:relToChange == "proposal.md" 等
    if (ARTIFACT_FILES.includes(relToChange)) {
      try {
        rmSync(absPath, { force: true });
        deleted.push(relToChange);
      } catch {
        // 删除失败不阻断,继续
      }
      continue;
    }

    // 匹配制品目录:relToChange == "specs" 或 relToChange.startsWith("specs/")
    // git status --untracked-files=all 展开目录内文件(如 specs/spec.md),
    // 遇到 specs/ 下任何 untracked 文件,删整个 specs/ 目录(去重避免重复删)
    if (relToChange === "specs" || relToChange.startsWith("specs/")) {
      const specsDir = join(realChangeDir, "specs");
      if (existsSync(specsDir) && !deleted.includes("specs/")) {
        try {
          rmSync(specsDir, { recursive: true, force: true });
          deleted.push("specs/");
        } catch {
          // 删除失败不阻断
        }
      }
      continue;
    }
  }

  if (deleted.length > 0) {
    console.log(`✓ 已清理 untracked 制品文件(switch 回退后旧制品残留会让 records 显示 pending):`);
    for (const f of deleted) {
      console.log(`  ${f}`);
    }
  }
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
