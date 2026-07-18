import { promptConfirm } from "../../../utils/prompt.js";
import { section, info, warn } from "../../../utils/output.js";
import type { ActionPlan, ProductAction } from "./plan.js";

/** 计算字符串显示宽度(中文/全角占 2) */
function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += /[一-鿿　-〿＀-￯]/.test(ch) ? 2 : 1;
  }
  return w;
}

function padEndDisplay(s: string, width: number): string {
  const pad = width - displayWidth(s);
  return pad > 0 ? s + " ".repeat(pad) : s;
}

/** 格式化版本化产物单元格(alloy skills / Superpowers) */
function formatVersionedCell(action: ProductAction): string {
  switch (action.action) {
    case "skip": {
      // Superpowers / alloy-skills skip 时 reason 携带简短路径,显示版本+路径
      if (action.reason) {
        const v = action.currentVersion ?? "";
        return v ? `✓ ${v}(${action.reason})` : `✓(${action.reason})`;
      }
      return `✓ ${action.currentVersion ?? ""}`.trim();
    }
    case "install":
      return `将装 ${action.targetVersion ?? ""}`.trim();
    case "upgrade":
      return `将升级 ${action.currentVersion}->${action.targetVersion}`;
    case "breaking-upgrade":
      return `⚠️ breaking ${action.currentVersion}->${action.targetVersion}`;
  }
}

export function formatAgentMatrix(actionPlan: ActionPlan): string[] {
  const lines: string[] = [];
  lines.push("agent 级产物即将执行的动作:");

  const headers = ["agent", "Superpowers Skills", "Alloy Skills"];
  // 防御性默认值:agentActions 缺某类产物时按 skip 处理(测试或边界场景)
  const defaultAction: ProductAction = {
    agentId: "", product: "superpowers", action: "skip",
  };
  const rows = actionPlan.targetAgents.map(agent => {
    const actions = actionPlan.agentActions.filter(a => a.agentId === agent.id);
    const sp = actions.find(a => a.product === "superpowers") ?? defaultAction;
    const alloy = actions.find(a => a.product === "alloy-skills") ?? defaultAction;
    return [
      agent.label,
      formatVersionedCell(sp),
      formatVersionedCell(alloy),
    ];
  });

  const colWidths = headers.map((h, i) => {
    const maxRow = Math.max(...rows.map(r => displayWidth(r[i])), 0);
    return Math.max(displayWidth(h), maxRow);
  });

  lines.push("| " + headers.map((h, i) => padEndDisplay(h, colWidths[i])).join(" | ") + " |");
  lines.push("| " + colWidths.map(w => "-".repeat(w)).join(" | ") + " |");
  for (const row of rows) {
    lines.push("| " + row.map((cell, i) => padEndDisplay(cell, colWidths[i])).join(" | ") + " |");
  }
  return lines;
}

export function formatProjectResources(actionPlan: ActionPlan): string[] {
  const lines: string[] = [];
  lines.push("项目级资源(将写入当前目录):");
  lines.push("");
  for (const r of actionPlan.projectResources) {
    if (r.action === "skip") continue;
    lines.push(`  + ${r.resource.padEnd(20)} （${r.description}）`);
  }
  return lines;
}

export function formatBreakingWarnings(actionPlan: ActionPlan): string[] {
  const lines: string[] = [];
  const breakingActions = actionPlan.agentActions.filter(a => a.action === "breaking-upgrade");
  if (breakingActions.length === 0) return lines;

  lines.push("⚠️ 检测到 breaking 升级(不满足 compat.yaml 约束):");
  lines.push("");
  for (const a of breakingActions) {
    const agent = actionPlan.targetAgents.find(ag => ag.id === a.agentId);
    lines.push(`  - ${agent?.label} ${a.product}: ${a.currentVersion} -> ${a.targetVersion}`);
    if (a.reason) lines.push(`    原因:${a.reason}`);
    lines.push(`    影响:覆盖安装,现有 ${a.product} 可能不兼容`);
  }
  return lines;
}

export async function displayAndConfirm(actionPlan: ActionPlan, force: boolean): Promise<boolean> {
  section("即将执行以下操作");

  // 1. agent 矩阵
  for (const line of formatAgentMatrix(actionPlan)) {
    info(line);
  }
  info("");

  // 1.5 Pi worktree + SDD 不支持警告(Pi bash 无 cwd 参数 + 无原生 subagent)
  // 详见 docs/reference/agent-instruction-files.md 第 11 章 Worktree + 第 12 章 Subagent
  if (actionPlan.targetAgents.some(a => a.id === "pi")) {
    warn("⚠️ Pi 不支持 git worktree:apply 阶段将在 feature 分支执行,无 worktree 隔离");
    warn("   原因:Pi bash 工具无 per-call cwd 参数,session cwd 不解绑到 worktree");
    warn("⚠️ Pi 不支持 SDD:apply 阶段只能用 executing-plans(EP),不能用 subagent-driven-development");
    warn("   原因:Pi 无原生 subagent(需装 pi-subagents 可选包,alloy 不依赖)");
    info("");
  }

  // 2. 项目资源列表
  for (const line of formatProjectResources(actionPlan)) {
    info(line);
  }
  info("");

  // 3. breaking 警告
  if (actionPlan.hasBreaking) {
    for (const line of formatBreakingWarnings(actionPlan)) {
      warn(line);
    }
    info("");
  }

  // 4. 确认
  if (force) {
    info("--force 模式:跳过确认,直接执行");
    return true;
  }

  if (actionPlan.hasBreaking) {
    // 双重确认,默认 No
    const confirm1 = await promptConfirm(
      "⚠️ 检测到 breaking 升级,继续?(breaking 会覆盖现有版本,可能不兼容)",
      false
    );
    if (!confirm1) return false;
    return await promptConfirm("再次确认:确定执行 breaking 升级?此操作不可逆", false);
  } else {
    // 单次确认,默认 Yes
    return await promptConfirm("确认执行以上操作?", true);
  }
}
