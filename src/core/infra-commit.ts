// src/core/infra-commit.ts
// 基础设施 commit 共享逻辑:动态推导 agent 目录 + 项目资源,git add + commit。
// 被 init execute.ts(初始 commit)和 alloy _infra-commit(change 创建后的基础设施 commit)复用。
//
// 解决问题:原 alloy-start SKILL.md:327 写死 `git add .claude/`,只支持 Claude Code。
// 动态推导 agent 目录(claude-code/opencode/pi 各自路径 + 共享 .agents/)。
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentInfo } from "./types.js";

/** 推导基础设施 commit 的 git add 目标列表(动态 agent 目录 + 项目资源) */
export function getInfraCommitTargets(
  projectPath: string,
  targetAgents: AgentInfo[]
): string[] {
  const agentDirs = new Set<string>();
  for (const agent of targetAgents) {
    const agentBase = agent.commandsDir.split("/")[0];
    agentDirs.add(`${agentBase}/`);
  }
  // .agents/skills/ 是 Superpowers 共享目录,所有场景都会创建
  // (claude-code/pi 通过符号链接读,OpenCode 直接读),
  // 必须无条件 add,否则 clone 后 .claude/skills/ 下符号链接断链
  agentDirs.add(".agents/");

  const targets: string[] = [
    ...agentDirs,
    ".gitignore",
    ".gitattributes",
    "openspec/config.yaml",
    "openspec/schemas/",
  ];

  // opencode 的 permissions 配置在项目根 opencode.json(不在 .opencode/ 目录下),
  // 需单独 add,否则 commit 漏掉(其他 agent 的配置文件都在各自 agent 目录下,agentDirs 已覆盖)
  if (targetAgents.some(a => a.id === "opencode")) {
    targets.push("opencode.json");
  }

  // codex 的 hook 配置在项目根 .codex/hooks.json(不在 .agents/ 下),需单独 add
  if (targetAgents.some(a => a.id === "codex")) {
    targets.push(".codex/hooks.json");
  }

  // 指令文件(CLAUDE.md / AGENTS.md),存在则 add
  for (const file of ["CLAUDE.md", "AGENTS.md"]) {
    if (existsSync(join(projectPath, file))) {
      targets.push(file);
    }
  }

  return targets;
}

/** 执行基础设施 commit:逐个 git add(文件不存在跳过)+ git commit(幂等,无暂存跳过)。
 * 返回 commit 是否发生(true=已 commit,false=跳过)。 */
export function executeInfraCommit(
  projectPath: string,
  targetAgents: AgentInfo[],
  commitMessage: string
): { committed: boolean; addedTargets: string[] } {
  const targets = getInfraCommitTargets(projectPath, targetAgents);
  const addedTargets: string[] = [];

  for (const target of targets) {
    try {
      execSync(`git add ${target}`, { cwd: projectPath, stdio: "pipe" });
      addedTargets.push(target);
    } catch {
      // 文件不存在则跳过
    }
  }

  // 幂等:无暂存变更则跳过 commit
  try {
    execSync("git diff --cached --quiet", { cwd: projectPath, stdio: "pipe" });
    return { committed: false, addedTargets };
  } catch {
    // diff --cached --quiet exit 1 表示有暂存变更,继续 commit
  }

  try {
    execSync(`git commit -m "${commitMessage}"`, { cwd: projectPath, stdio: "pipe" });
    return { committed: true, addedTargets };
  } catch (e) {
    throw new Error(`基础设施 commit 失败: ${(e as Error).message}`);
  }
}
