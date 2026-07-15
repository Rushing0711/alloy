// src/cli/commands/internal/infra-commit.ts
// alloy _infra-commit 命令:基础设施 commit,多 agent 适配。
// 替代 alloy-start SKILL.md 里写死 `git add .claude/` 的 bash(只支持 Claude Code)。
//
// 读 openspec/config.yaml 的 target_agents,动态推导 agent 目录 + 项目资源,
// 逐个 git add(文件不存在跳过)+ git commit(幂等,无暂存跳过)。
//
// 用法:alloy _infra-commit [--message <msg>]
//   --message: commit message(默认 "chore: 提交 alloy 基础设施文件")
import { parseArgs } from "node:util";
import { readProjectConfig } from "../../utils/state.js";
import { KNOWN_AGENTS } from "../../../core/agents.js";
import { executeInfraCommit } from "../../../core/infra-commit.js";

/**
 * alloy _infra-commit
 *
 * 基础设施 commit:动态推导 agent 目录 + 项目资源,git add + commit。
 * 被 alloy-start SKILL.md 在 change 创建后调用,提交 alloy 基础设施文件
 * (agent 配置/skills/commands + .gitignore/.gitattributes/openspec/指令文件)。
 *
 * 幂等:无暂存变更则跳过 commit(exit 0)。
 */
export async function infraCommitCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      message: { type: "string", default: "chore: 提交 alloy 基础设施文件" },
    },
    allowPositionals: false,
  });

  const projectPath = process.cwd();
  const config = await readProjectConfig(projectPath);
  const targetAgentIds = config.alloy?.target_agents ?? [];
  const targetAgents = KNOWN_AGENTS.filter(a => targetAgentIds.includes(a.id));

  if (targetAgents.length === 0) {
    console.error("⛔ [PRECONDITION_FAIL] openspec/config.yaml 未配置 target_agents");
    console.error("  请运行 alloy init 完成初始化");
    process.exit(1);
  }

  try {
    const result = executeInfraCommit(projectPath, targetAgents, values.message!);
    if (result.committed) {
      console.log(`✓ 基础设施 commit 已创建(${result.addedTargets.length} 个文件)`);
    } else {
      console.log("✓ 基础设施已提交,无变更跳过");
    }
    process.exit(0);
  } catch (e) {
    console.error(`⛔ ${(e as Error).message}`);
    process.exit(1);
  }
}
