// src/cli/commands/init/init.ts
// init 命令编排层:4 阶段流水线 collect -> 选择 -> plan+display+确认 -> execute。
// 选择阶段(selectScope/selectTargetAgents/selectMainBranch)在此层,plan/execute 不再交互。
import { promptSelect, promptMultiSelect, promptInput } from "../../../utils/prompt.js";
import { section, check, error, info } from "../../../utils/output.js";
import { detectMainBranch } from "../../../core/git.js";
import { KNOWN_AGENTS } from "../../../core/agents.js";
import { collect } from "./collect.js";
import { plan } from "./plan.js";
import { displayAndConfirm } from "./display.js";
import { execute } from "./execute.js";
import type { AgentInfo } from "../../../core/types.js";

/** 选择安装范围(传入则透传,否则交互式选择) */
export async function selectScope(passedScope?: string): Promise<"global" | "project"> {
  if (passedScope) return passedScope as "global" | "project";
  info("scope 互相独立:选 Project 装当前项目目录,选 Global 装 $HOME;");
  info("即使另一处已装,仍按本次 scope 安装(版本可能与另一处不同)。");
  return promptSelect("Install scope:", [
    { name: "Project (current directory)", value: "project" },
    { name: "Global (home directory)", value: "global" },
  ], { default: "project" }) as Promise<"global" | "project">;
}

/** 选择目标 Agent(单级多选) */
export async function selectTargetAgents(): Promise<AgentInfo[]> {
  const ids = await promptMultiSelect(
    "选择目标 Agent(空格勾选可多选,回车确认):",
    KNOWN_AGENTS.map((a) => ({
      name: a.label,
      value: a.id,
    })),
    {
      pageSize: 10,
      validate: (ids: string[]) => (ids.length > 0 ? true : "请至少选择一个 AI 工具"),
    }
  );
  return KNOWN_AGENTS.filter((a) => ids.includes(a.id));
}

/** 选择主分支(已配置则透传,否则检测+交互式确认) */
async function selectMainBranch(
  projectPath: string,
  gitExists: boolean,
  existingMainBranch?: string
): Promise<string> {
  if (existingMainBranch) {
    check("主分支", `已配置: ${existingMainBranch}(跳过确认)`, "pass");
    return existingMainBranch;
  }
  const detected = gitExists ? detectMainBranch(projectPath) : null;
  const defaultBranch = detected || "main";
  const branchChoice = await promptSelect(
    `确认主分支名(当前 git 默认: ${defaultBranch}):`,
    [
      { name: `${defaultBranch}(检测值)`, value: defaultBranch },
      { name: "自定义分支名", value: "__custom__" },
    ],
    { default: defaultBranch }
  );
  if (branchChoice === "__custom__") {
    return await promptInput("请输入主分支名:", {
      validate: (v: string) => (v.trim().length > 0 ? true : "分支名不能为空"),
    });
  }
  return branchChoice;
}

/** init 命令选项(scope 可选,交互式选择后确定) */
export interface InitOptions {
  projectPath: string;
  scope?: "global" | "project";
  targetAgents: AgentInfo[];
  force?: boolean;
}

/**
 * init 命令编排:4 阶段流水线。
 *
 * 阶段 1: collect(无交互,采集环境/目录/git/OpenSpec CLI)
 * 阶段 2: 选择(scope/targetAgents/mainBranch,3 个交互)
 * 阶段 3: plan + displayAndConfirm(生成执行计划,展示,用户确认)
 * 阶段 4: execute(幂等执行,不再交互)
 *
 * 硬校验在阶段 1 后:nodeOk/gitOk/dirRejected 失败时 exit(1)。
 * 用户拒绝确认时 exit(0),不执行。
 */
export async function initCommand(opts: InitOptions): Promise<void> {
  // 阶段 1: 采集(无交互)
  section("采集项目状态...");
  const collectResult = await collect(opts.projectPath);

  // 硬校验:Node 版本
  if (!collectResult.env.nodeOk) {
    error(`❌ Node ${collectResult.env.nodeVersion} 不满足 >=18.0.0,请升级`);
    process.exit(1);
  }
  // 硬校验:Git 版本/安装
  if (!collectResult.env.gitOk) {
    if (!collectResult.env.gitVersion) {
      error("❌ Git 未安装,请先安装 git");
    } else {
      error(`❌ Git ${collectResult.env.gitVersion} 不满足 >=2.20.0,请升级`);
    }
    process.exit(1);
  }
  // 硬校验:目录拒绝($HOME 或 $HOME 下隐藏目录)
  if (collectResult.dirRejected) {
    error("⛔ 拒绝在 $HOME 或 $HOME 下隐藏目录初始化 Alloy");
    info("请先 cd 到具体项目目录后再运行 alloy init");
    process.exit(1);
  }
  // 所有硬校验通过后输出 check 标记
  check("Node.js", collectResult.env.nodeVersion, "pass");
  check("Git", collectResult.env.gitVersion, "pass");

  // 阶段 2: 选择(3 交互)
  const scope = opts.scope ?? (await selectScope());
  const targetAgents =
    opts.targetAgents.length > 0 ? opts.targetAgents : await selectTargetAgents();
  const mainBranch = await selectMainBranch(
    opts.projectPath,
    collectResult.git.exists,
    collectResult.git.existingMainBranch
  );

  // 阶段 3: plan + display + 确认
  const actionPlan = await plan(
    collectResult,
    { scope, targetAgents, mainBranch, force: opts.force },
    opts.projectPath
  );
  const confirmed = await displayAndConfirm(actionPlan, opts.force ?? false);
  if (!confirmed) {
    info("✗ 已取消初始化,项目未发生任何变化");
    process.exit(0);
  }

  // 阶段 4: 执行(scope 来源统一:用本地解析后的 scope,与 actionPlan.scope 一致)
  await execute(actionPlan, { ...opts, scope, targetAgents });
}
