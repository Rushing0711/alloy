// src/cli/commands/internal/start.ts
// alloy _start 命令:start 阶段多步 bash 序列下沉为原子命令。
//
// 替代 alloy-start SKILL.md 里 Step 4-7(bootstrap)和 Step 10(finalize)的多步 bash:
//   _start precheck  - 合并状态检测 5 步(env check + status + date + precheck + git 校验)
//   _start bootstrap - 合并 6 步(state init + infra-commit + skill log x2 + worktree write + phase start)
//   _start finalize  - 合并 4 步(artifact commit + checkpoint create + verify + phase complete)
//
// 用法:
//   alloy _start precheck --cmd "opsx/explore opsx/new" --skill "brainstorming"
//   alloy _start bootstrap <change-dir> --start-at <ts> --opsx-new-at <ts> --feature-branch <branch>
//   alloy _start finalize <change-dir>
import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readProjectConfig, findActiveChanges, formatTimestamp, readState } from "../../utils/state.js";
import { executeInfraCommit } from "../../../core/infra-commit.js";
import { KNOWN_AGENTS } from "../../../core/agents.js";
import { evaluatePrecheck, formatPrecheckResult } from "../../../core/precheck.js";
import { checkEnvIntegrity } from "./env.js";
import { stateCommand } from "./state.js";
import { skillUsageCommand } from "./skill-usage.js";
import { phaseCommand } from "./phase.js";
import { artifactCommand } from "./artifact.js";
import { checkpointCommand } from "./checkpoint.js";
import { verifyCommand } from "./verify.js";

/**
 * alloy _start precheck --cmd "opsx/explore opsx/new" --skill "brainstorming"
 *
 * 合并状态检测 5 步为 1 个原子命令(5 次 LLM 往返 -> 1 次):
 *   1. env check(git + config.yaml + schema.yaml + skills,已覆盖 git 仓库校验)
 *   2. status 检测活跃 change
 *   3. 捕获 START_TIME(仅统一流程)
 *   4. precheck(cmd + skill 就绪检测,仅统一流程)
 *
 * 输出格式(人类可读 + `->` 标注关键信息便于 LLM 提取):
 * - env 失败: PRECONDITION_FAIL + 缺失项 + exit 1
 * - 有活跃 change: env_ok + active_changes 列表 + route=resume + exit 0
 * - 无活跃 change + precheck 通过: env_ok + start_time + precheck_ok + route=unified + exit 0
 * - 无活跃 change + precheck 失败: env_ok + start_time + precheck 缺失项 + exit 1
 */
async function startPrecheck(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      cmd: { type: "string" },
      skill: { type: "string" },
    },
    allowPositionals: false,
  });

  const projectPath = process.cwd();

  // Step 1: env check(已覆盖 git 仓库校验,无需单独 git rev-parse)
  const envResult = checkEnvIntegrity(projectPath);
  if (!envResult.ok) {
    console.log("⛔ PRECONDITION_FAIL: Alloy 环境不完整");
    console.log("");
    console.log("缺失检查项：");
    for (const m of envResult.missing) {
      console.log(`  ✗ ${m}`);
    }
    console.log("");
    console.log("请先运行：alloy init");
    process.exit(1);
    return;
  }

  console.log("✓ Alloy 环境完整（git ✓ config.yaml ✓ schema.yaml ✓ skills ✓）");

  // Step 2: 检测活跃 change
  const changesDir = join(projectPath, "openspec", "changes");
  const activeChanges = await findActiveChanges(changesDir);

  if (activeChanges.size > 0) {
    // 接续路径:输出活跃 change 列表 + route=resume
    console.log(`-> active_changes: ${activeChanges.size}`);
    for (const [name, state] of activeChanges) {
      let changePath = join(changesDir, name);
      if (!existsSync(join(changePath, ".alloy.yaml"))) {
        changePath = join(changesDir, "archive", name);
      }
      const existing = checkArtifactsBrief(changePath);
      const artifactStr = existing.length > 0 ? existing.join(" ") : "无";
      console.log(`  - ${name} (phase: ${state.phase}, 制品: ${artifactStr})`);
    }
    console.log("-> route: resume（接续路径,需 USER_GATE 路由）");
    process.exit(0);
    return;
  }

  // 统一流程:捕获 START_TIME + precheck
  const startTime = formatTimestamp();
  console.log("-> active_changes: 0");
  console.log(`-> start_time: ${startTime}`);

  // Step 3: precheck
  const config = await readProjectConfig(projectPath);
  const targetAgentIds = config.alloy?.target_agents ?? [];
  const targetAgents = KNOWN_AGENTS.filter(a => targetAgentIds.includes(a.id));

  if (targetAgents.length === 0) {
    console.error("⛔ [PRECONDITION_FAIL] openspec/config.yaml 未配置 target_agents");
    console.error("  请运行 alloy init 完成初始化");
    process.exit(1);
    return;
  }

  const cmds = (values.cmd ?? "").split(/\s+/).filter(Boolean);
  const skills = (values.skill ?? "").split(/\s+/).filter(Boolean);

  const precheckResult = evaluatePrecheck({ cmds, skills, projectPath, targetAgents });
  console.log(formatPrecheckResult(precheckResult));

  if (precheckResult.exitCode !== 0) {
    console.log("-> route: abort（precheck 失败,需先运行 alloy init）");
    process.exit(1);
    return;
  }

  console.log("-> route: unified（统一流程,用 start_time 继续）");
  process.exit(0);
}

/** 检测 change 目录下已存在的关键制品名列表(精简版,供 _start precheck 输出) */
function checkArtifactsBrief(changePath: string): string[] {
  const artifacts = ["draft", "proposal", "design", "specs", "tasks", "plans", "verify", "retrospective"];
  return artifacts.filter(a =>
    a === "specs"
      ? existsSync(join(changePath, "specs"))
      : existsSync(join(changePath, `${a}.md`))
  );
}

/**
 * alloy _start bootstrap <change-dir> --start-at <ts> --opsx-new-at <ts> --feature-branch <branch>
 *
 * 按序执行 6 步,任一步失败 exit 1(子命令内部 process.exit(1) 会退出整个进程):
 *   1. state init(change 目录 + started_at + feature_branch)
 *   2. infra-commit(基础设施 commit,幂等)
 *   3. skill log opsx:explore(补录 --at=start-at)
 *   4. skill log opsx:new(补录 --at=opsx-new-at)
 *   5. state write worktree null(标记非 worktree 模式)
 *   6. phase start(写 phase_timings.start.started_at + 推进到 starting + commit)
 *
 * 约束(内化到 CLI,比 SKILL.md 文字更可靠):
 * - --start-at 与 --opsx-new-at 必须不同值(called_at 语义=实际调用时间)
 * - 顺序硬约束:state init 在 phase start / skill log 之前;skill log 在 phase start 之前
 */
async function startBootstrap(args: string[]): Promise<void> {
  const changeDir = args[0];
  if (!changeDir) {
    console.error("用法: alloy _start bootstrap <change-dir> --start-at <ts> --opsx-new-at <ts> --feature-branch <branch>");
    process.exit(1);
    return;
  }

  let startAt: string | undefined;
  let opsxNewAt: string | undefined;
  let featureBranch: string | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--start-at" && i + 1 < args.length) {
      startAt = args[++i];
    } else if (args[i] === "--opsx-new-at" && i + 1 < args.length) {
      opsxNewAt = args[++i];
    } else if (args[i] === "--feature-branch" && i + 1 < args.length) {
      featureBranch = args[++i];
    }
  }

  if (!startAt || !opsxNewAt || !featureBranch) {
    console.error("⛔ [PRECONDITION_FAIL] 缺少必需参数");
    console.error("  用法: alloy _start bootstrap <change-dir> --start-at <ts> --opsx-new-at <ts> --feature-branch <branch>");
    console.error("  --start-at: start 阶段开始时间(= START_TIME,explore 执行时间)");
    console.error("  --opsx-new-at: opsx:new 执行时间(= OPSX_NEW_START)");
    console.error("  --feature-branch: feature 分支名(= $FEATURE_BRANCH)");
    process.exit(1);
    return;
  }

  // 约束校验:两 --at 必须不同值
  if (startAt === opsxNewAt) {
    console.error("⛔ [HARD_STOP] --start-at 与 --opsx-new-at 必须不同值");
    console.error("  called_at 语义是'技能实际调用时间',两个技能在不同步骤调用,时间戳必须不同。");
    console.error("  违反字面 = 违反精神:哪怕'时间差不多'、'先记一个后面改'--也禁止复用同一时间戳。");
    console.error(`  收到: --start-at=${startAt} --opsx-new-at=${opsxNewAt}`);
    process.exit(1);
    return;
  }

  // Step 1: state init(幂等,已存在跳过)
  console.log("-> [1/6] state init");
  await stateCommand(["init", changeDir, "--at", startAt, "--feature-branch", featureBranch]);

  // Step 2: infra-commit(绕过 infraCommitCommand 的 process.exit(0),直接调核心函数)
  console.log("-> [2/6] infra-commit");
  const projectRoot = process.cwd();
  const config = await readProjectConfig(projectRoot);
  const targetAgentIds = config.alloy?.target_agents ?? [];
  const targetAgents = KNOWN_AGENTS.filter(a => targetAgentIds.includes(a.id));
  if (targetAgents.length === 0) {
    console.error("⛔ [PRECONDITION_FAIL] openspec/config.yaml 未配置 target_agents");
    console.error("  请运行 alloy init 完成初始化");
    process.exit(1);
    return;
  }
  try {
    const result = executeInfraCommit(projectRoot, targetAgents, "chore: 提交 alloy 基础设施文件");
    if (result.committed) {
      console.log(`✓ 基础设施 commit 已创建(${result.addedTargets.length} 个文件)`);
    } else {
      console.log("✓ 基础设施已提交,无变更跳过");
    }
  } catch (e) {
    console.error(`⛔ [FAIL] infra-commit 失败: ${(e as Error).message}`);
    process.exit(1);
    return;
  }

  // Step 3: skill log opsx:explore(补录 --at=start-at)
  console.log("-> [3/6] skill log opsx:explore");
  await skillUsageCommand(["log", changeDir, "start", "opsx:explore", "--at", startAt]);

  // Step 4: skill log opsx:new(补录 --at=opsx-new-at)
  console.log("-> [4/6] skill log opsx:new");
  await skillUsageCommand(["log", changeDir, "start", "opsx:new", "--at", opsxNewAt]);

  // Step 5: state write worktree null(标记非 worktree 模式)
  console.log("-> [5/6] state write worktree null");
  await stateCommand(["write", changeDir, "worktree", "null"]);

  // Step 6: phase start(写 started_at + 推进到 starting + commit)
  console.log("-> [6/6] phase start");
  await phaseCommand(["start", changeDir, "start", "--at", startAt]);

  console.log("✓ start 阶段已 bootstrap(state + infra-commit + skill log x2 + worktree + phase start)");
}

/**
 * alloy _start finalize <change-dir>
 *
 * 按序执行 4 步,任一步失败 exit 1:
 *   1. artifact commit draft(hash-lock + records + commit)
 *   2. checkpoint create --kind brainstorming(draft 锚点 tag)
 *   3. verify phase-exit start(校验 draft + state 字段;失败 exit 1,阻止 phase complete)
 *   4. phase complete(写 completed_at + 推进到 started + commit)
 *
 * 约束(内化到 CLI):
 * - checkpoint 必须在 artifact commit 之后、phase complete 之前(tag 指向 draft commit)
 * - verify && phase complete 短路保护:verify 失败时 phase complete 不执行(verify 内部 process.exit(1))
 */
async function startFinalize(args: string[]): Promise<void> {
  const changeDir = args[0];
  if (!changeDir) {
    console.error("用法: alloy _start finalize <change-dir>");
    process.exit(1);
    return;
  }

  // 越界回退检测:phase=starting + records 已有 draft = 越界回退到 brainstorming-N 场景
  // 原因:brainstorming-N tag 在 _phase complete 之前打,switch 回去 phase=starting。
  // 此场景 _start finalize 不适用(_artifact commit draft 因 hash 未变跳过 commit,
  // .alloy.yaml 的 _skill log 修改没被 commit,_checkpoint create brainstorming 因 dirty 失败)。
  // 越界回退必须走 alloy-plan SKILL.md 步骤 9-11(reset + 沟通 + commit + checkpoint + phase complete)。
  // 实测踩坑:Pi 会话 agent 跳步调 _start finalize,被 dirty 拦住,流程卡死。
  let state;
  try {
    state = await readState(changeDir);
  } catch {
    state = null;
  }
  if (state) {
    const hasDraft = (state.records ?? []).some(r => r.artifact === "draft");
    if (state.phase === "starting" && hasDraft) {
      console.error(`⛔ [PRECONDITION_FAIL] 越界回退场景禁调 _start finalize`);
      console.error(`  当前状态: phase=starting + records 已有 draft(越界回退到 brainstorming-N)`);
      console.error(`  _start finalize 是"全新开始"路径的 finalize(假设 records 无 draft),此场景不适用:`);
      console.error(`    _artifact commit draft 因 hash 未变跳过 commit,.alloy.yaml 的 _skill log 修改没被 commit,`);
      console.error(`    _checkpoint create brainstorming 因 dirty 失败。`);
      console.error(`  修复:走 alloy-plan SKILL.md 步骤 9-11:`);
      console.error(`    9. _skill log start superpowers:brainstorming`);
      console.error(`    10. _artifact reset <change-dir> draft -> 沟通产出新 draft -> _artifact commit <change-dir> draft`);
      console.error(`    11. _checkpoint create <change-dir> --kind brainstorming -> _phase complete <change-dir> start`);
      process.exit(1);
      return;
    }
  }

  // Step 1: artifact commit draft
  console.log("-> [1/4] artifact commit draft");
  await artifactCommand(["commit", changeDir, "draft"]);

  // Step 2: checkpoint create --kind brainstorming
  console.log("-> [2/4] checkpoint create brainstorming");
  await checkpointCommand(["create", changeDir, "--kind", "brainstorming", "--reason", "draft 已锁定,brainstorming 锚点"]);

  // Step 3: verify phase-exit start(失败时 process.exit(1),阻止 step 4 执行)
  console.log("-> [3/4] verify phase-exit start");
  await verifyCommand(["phase-exit", "start", changeDir]);

  // Step 4: phase complete(verify 通过后才执行)
  console.log("-> [4/4] phase complete");
  await phaseCommand(["complete", changeDir, "start"]);

  console.log("✓ start 阶段已 finalize(draft hash-lock + checkpoint + verify + phase complete)");
}

export async function startCommand(args: string[]): Promise<void> {
  const action = args[0];

  if (!action) {
    console.error("用法: alloy _start <precheck|bootstrap|finalize> [...]");
    process.exit(1);
    return;
  }

  switch (action) {
    case "precheck":
      return startPrecheck(args.slice(1));
    case "bootstrap":
      return startBootstrap(args.slice(1));
    case "finalize":
      return startFinalize(args.slice(1));
    default:
      console.error(`未知操作: ${action} (支持: precheck, bootstrap, finalize)`);
      process.exit(1);
  }
}
