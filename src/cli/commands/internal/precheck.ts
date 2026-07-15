// src/cli/commands/internal/precheck.ts
// alloy _precheck 命令:Skill/Command 预检,多 agent 适配。
// 替代 skill-precheck.md 里写死 .claude/ 路径的 bash 脚本(只支持 Claude Code)。
//
// 读 openspec/config.yaml 的 target_agents,对每个 agent 检测对应路径:
// - cmd: 查 <agentBase>/<commandsSubdir>/<cmd>.md(横线格式)或 <cmd>.md(斜杠格式)
// - skill: 复用 detectSkill(已多 agent 适配)
//
// 用法:alloy _precheck --cmd "opsx/explore opsx/new" --skill "brainstorming"
//   --cmd: 空格分隔的 cmd 列表(声明格式,如 opsx/explore)
//   --skill: 空格分隔的 skill 列表(如 brainstorming)
import { parseArgs } from "node:util";
import { readProjectConfig } from "../../utils/state.js";
import { KNOWN_AGENTS } from "../../../core/agents.js";
import { evaluatePrecheck, formatPrecheckResult } from "../../../core/precheck.js";

/**
 * alloy _precheck
 *
 * Skill/Command 预检:检测指定 cmd 和 skill 是否在所有目标 agent 的路径里就绪。
 * 任一缺失 -> exit 1 + 引导 alloy init;全部就绪 -> exit 0。
 *
 * 被 alloy-start/alloy-plan/alloy-apply 等阶段命令在 PRECONDITION_FAIL 步骤调用,
 * 替代原 skill-precheck.md 写死 .claude/ 路径的 bash 脚本。
 */
export async function precheckCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      cmd: { type: "string" },
      skill: { type: "string" },
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

  const cmds = (values.cmd ?? "").split(/\s+/).filter(Boolean);
  const skills = (values.skill ?? "").split(/\s+/).filter(Boolean);

  const result = evaluatePrecheck({ cmds, skills, projectPath, targetAgents });

  console.log(formatPrecheckResult(result));
  process.exit(result.exitCode);
}
