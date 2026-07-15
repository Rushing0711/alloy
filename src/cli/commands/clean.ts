// src/cli/commands/clean.ts
// clean 命令编排层:解析 scope -> scan -> display+confirm -> execute -> summary。
// scan 不删,execute 才删;展示清单 + 确认;--scope 传参跳过交互,--force 跳过确认。
import { promptSelect, promptConfirm } from "../../utils/prompt.js";
import { section, info, warn, error, success } from "../../utils/output.js";
import { KNOWN_AGENTS } from "../../core/agents.js";
import { scanForClean, executeClean } from "../../core/clean.js";
import type { CleanPlan, CleanResult } from "../../core/clean.js";

/** clean 命令选项 */
export interface CleanOptions {
  projectPath: string;
  /** 清理范围:不传则交互问 */
  scope?: "global" | "project";
  /** 跳过确认 */
  force?: boolean;
}

/** 选择清理范围(传入合法值则透传,否则交互式选择) */
export async function selectScope(
  passedScope?: string
): Promise<"global" | "project"> {
  if (passedScope === "global" || passedScope === "project") {
    return passedScope;
  }
  info("scope 互相独立:选 Project 清当前项目目录,选 Global 清 $HOME;");
  info("清理是破坏性操作,会移除 alloy init 装的所有产物。");
  return promptSelect(
    "Clean scope:",
    [
      { name: "Project (current directory)", value: "project" },
      { name: "Global (home directory)", value: "global" },
    ],
    { default: "project" }
  ) as Promise<"global" | "project">;
}

/** 判断清理计划是否为空(无任何产物需要清理) */
export function isPlanEmpty(plan: CleanPlan): boolean {
  return (
    plan.alloySkillsPaths.length === 0 &&
    plan.alloyVersionFiles.length === 0 &&
    plan.opsxPaths.length === 0 &&
    plan.opencodeCommandWrappers.length === 0 &&
    plan.superpowersSkillNames.length === 0 &&
    plan.skillsLockFiles.length === 0 &&
    plan.hookConfigs.length === 0 &&
    plan.permissionConfigs.length === 0 &&
    plan.preCommitFile === null &&
    plan.openspecSchemaDir === null &&
    plan.openspecConfigFile === null &&
    plan.emptyConfigFiles.length === 0
  );
}

/** 分组展示将删除/修改的路径,返回展示行(纯函数,便于测试) */
export function displayCleanPlan(plan: CleanPlan): string[] {
  const lines: string[] = [];
  lines.push(
    `清理范围:${plan.scope === "global" ? "Global($HOME)" : "Project(当前目录)"}`
  );
  lines.push("");

  // 1. Alloy skills(将删除)
  if (plan.alloySkillsPaths.length > 0) {
    lines.push(
      `Alloy skills(${plan.alloySkillsPaths.length} 个目录,将删除):`
    );
    for (const p of plan.alloySkillsPaths) {
      lines.push(`  - ${p}`);
    }
    lines.push("");
  }

  // 2. .alloy-version 文件(将删除)
  if (plan.alloyVersionFiles.length > 0) {
    lines.push(
      `.alloy-version(${plan.alloyVersionFiles.length} 个文件,将删除):`
    );
    for (const p of plan.alloyVersionFiles) {
      lines.push(`  - ${p}`);
    }
    lines.push("");
  }

  // 3. OpenSpec Commands(将删除)
  if (plan.opsxPaths.length > 0) {
    lines.push(
      `OpenSpec Commands(${plan.opsxPaths.length} 个文件/目录,将删除):`
    );
    for (const p of plan.opsxPaths) {
      lines.push(`  - ${p}`);
    }
    lines.push("");
  }

  // 3.1 OpenCode command wrapper(将删除,/alloy-* 触发器)
  if (plan.opencodeCommandWrappers.length > 0) {
    lines.push(
      `OpenCode command wrapper(${plan.opencodeCommandWrappers.length} 个文件,将删除):`
    );
    for (const p of plan.opencodeCommandWrappers) {
      lines.push(`  - ${p}`);
    }
    lines.push("");
  }

  // 4. Superpowers(调 npx skills remove 清理;失败需手动)
  if (plan.superpowersSkillNames.length > 0) {
    lines.push(
      `Superpowers(${plan.superpowersSkillNames.length} 个 skill,调 npx skills remove 清理;失败需手动):`
    );
    for (const name of plan.superpowersSkillNames) {
      lines.push(`  - ${name}`);
    }
    lines.push("");
  }

  // 5. Hook/permissions(仅 project,将移除 alloy 注入的 key)
  // 同一个文件可能同时被 hookConfigs 和 permissionConfigs 引用,去重展示
  const configFiles = new Set<string>();
  for (const h of plan.hookConfigs) configFiles.add(h.file);
  for (const p of plan.permissionConfigs) configFiles.add(p.file);
  if (configFiles.size > 0) {
    lines.push(
      `Hook/permissions(${configFiles.size} 个配置文件,将移除 alloy 注入的 key):`
    );
    for (const f of configFiles) {
      lines.push(`  - ${f}`);
    }
    lines.push("");
  }

  // 6. .pre-commit(仅 project)
  if (plan.preCommitFile) {
    lines.push("项目配置文件(1 个,将修改/删除):");
    lines.push(`  - ${plan.preCommitFile}(移除 alloy hook 行/删文件)`);
    lines.push("");
  }

  // 7. skills-lock.json(npx skills add 创建的锁文件)
  if (plan.skillsLockFiles.length > 0) {
    lines.push(
      `skills-lock.json(${plan.skillsLockFiles.length} 个文件,将删除):`
    );
    for (const f of plan.skillsLockFiles) {
      lines.push(`  - ${f}`);
    }
    lines.push("");
  }

  // 8. openspec(仅 project)
  const openspecItems: string[] = [];
  if (plan.openspecSchemaDir) {
    openspecItems.push(`${plan.openspecSchemaDir}(删目录)`);
  }
  if (plan.openspecConfigFile) {
    openspecItems.push(`${plan.openspecConfigFile}(移除 alloy 配置)`);
  }
  if (openspecItems.length > 0) {
    lines.push(`openspec(${openspecItems.length} 项,将删除/修改):`);
    for (const item of openspecItems) {
      lines.push(`  - ${item}`);
    }
    lines.push("");
  }

  // 9. 空残留配置文件(空 {} /空文件,旧清理可能留下)
  if (plan.emptyConfigFiles.length > 0) {
    lines.push(
      `空残留配置文件(${plan.emptyConfigFiles.length} 个,将删除):`
    );
    for (const f of plan.emptyConfigFiles) {
      lines.push(`  - ${f}`);
    }
    lines.push("");
  }

  return lines;
}

/**
 * clean 命令编排:解析 scope -> scan -> display+confirm -> execute -> summary。
 *
 * 流程:
 * 1. 解析 scope(--scope 传参跳过交互)
 * 2. scan(调 scanForClean,扫描不删)
 * 3. 展示清单 + 确认(空清单提示退出;--force 跳过确认)
 * 4. execute(调 executeClean,执行删除/修改)
 * 5. 输出结果摘要
 *
 * 破坏性操作默认 No,用户拒绝确认时 exit(0),不执行 executeClean。
 */
export async function cleanCommand(opts: CleanOptions): Promise<void> {
  // 1. 解析 scope
  const scope = await selectScope(opts.scope);

  // 2. scan(扫描不删)
  section("扫描 alloy init 产物...");
  const plan = await scanForClean(opts.projectPath, scope, KNOWN_AGENTS);

  // 3. 展示清单 + 确认
  if (isPlanEmpty(plan)) {
    // plan 为空,但仍调 executeClean 清理可能的空残留(空 {} 文件/空目录)
    const result = await executeClean(opts.projectPath, scope, plan);
    if (result.removed.length > 0 || result.modified.length > 0) {
      summaryCleanResult(plan, result);
    } else {
      info(
        `✓ ${scope === "global" ? "全局" : "当前目录"}无 alloy 产物可清理`
      );
    }
    return;
  }

  section("即将清理以下产物");
  for (const line of displayCleanPlan(plan)) {
    info(line);
  }

  // 破坏性操作默认 No(与 init breaking-upgrade 一致),用户需显式确认
  if (!opts.force) {
    const confirmed = await promptConfirm("确认清理以上产物?", false);
    if (!confirmed) {
      info("✗ 已取消清理,未发生任何变化");
      process.exit(0);
    }
  } else {
    info("--force 模式:跳过确认,直接执行");
  }

  // 4. execute
  section("执行清理...");
  const result = await executeClean(opts.projectPath, scope, plan);

  // 5. 输出结果摘要
  summaryCleanResult(plan, result);
}

/** 输出清理结果摘要 */
function summaryCleanResult(plan: CleanPlan, result: CleanResult): void {
  section("清理完成");

  if (result.removed.length > 0) {
    success(`删除 ${result.removed.length} 个路径`);
  }
  if (result.modified.length > 0) {
    success(`修改 ${result.modified.length} 个文件`);
  }

  // Superpowers 状态(仅在有 superpowers 产物时报告)
  if (plan.superpowersSkillNames.length > 0) {
    if (result.superpowersNpxSuccess) {
      success(`Superpowers npx skills remove 成功(${plan.superpowersSkillNames.length} 个 skill)`);
    } else {
      warn("Superpowers npx 失败,请手动运行 npx skills remove");
    }
  }

  if (result.errors.length > 0) {
    error(`发生 ${result.errors.length} 个错误:`);
    for (const e of result.errors) {
      error(`  - ${e}`);
    }
  }

  // 无任何清理动作(且无错误)
  if (
    result.removed.length === 0 &&
    result.modified.length === 0 &&
    result.errors.length === 0
  ) {
    info("无产物被清理(可能已被手动移除)");
  }
}
