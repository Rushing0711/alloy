import { join } from "node:path";
import { existsSync } from "node:fs";
import { findActiveChanges, readState, AlloyState } from "../utils/state.js";
import { color, table } from "../../utils/format.js";
import { section, check } from "../../utils/output.js";

const ARTIFACTS = [
  "draft",
  "proposal",
  "design",
  "specs",
  "tasks",
  "plans",
  "verify",
  "retrospective",
] as const;

function checkArtifacts(changePath: string): Record<string, boolean> {
  const status: Record<string, boolean> = {};
  for (const a of ARTIFACTS) {
    if (a === "specs") {
      status[a] = existsSync(join(changePath, "specs"));
    } else {
      status[a] = existsSync(join(changePath, `${a}.md`));
    }
  }
  return status;
}

export async function printStatusDetail(
  projectPath: string,
  name: string
): Promise<void> {
  const changesDir = join(projectPath, "openspec", "changes");
  const changePath = join(changesDir, name);

  if (!existsSync(changePath)) {
    console.log(`未找到 change '${name}'`);
    return;
  }

  let state: AlloyState;
  try {
    state = await readState(changePath);
  } catch {
    console.log(`change '${name}' 缺少 .alloy.yaml`);
    return;
  }

  const artifacts = checkArtifacts(changePath);

  section("Change 详情");
  check("阶段", state.phase, "pass");
  check("Change", name, "pass");
  check("路径", changePath, "pass");
  check("创建时间", state.created_at, "pass");
  check("更新时间", state.updated_at, "pass");

  section("制品状态");
  for (const a of ARTIFACTS) {
    check(a, artifacts[a] ? "✓" : "✗", artifacts[a] ? "pass" : "fail");
  }

  const nextStep = getNextStepDetail(state, artifacts);
  if (nextStep) {
    check("下一步", nextStep, "pass");
  }
}

export async function statusCommand(
  projectPath: string,
  changeName?: string
): Promise<string> {
  const changesDir = join(projectPath, "openspec", "changes");

  if (changeName) {
    return detailMode(changesDir, changeName);
  } else {
    return overviewMode(changesDir);
  }
}

async function overviewMode(changesDir: string): Promise<string> {
  const changes = await findActiveChanges(changesDir);
  if (changes.size === 0) {
    return "无活跃 change。使用 /alloy-start <topic> 开始新工作流。";
  }

  const rows: string[][] = [];
  const nextSteps: string[] = [];

  for (const [name, state] of changes) {
    const artifacts = checkArtifacts(join(changesDir, name));
    const artifactStatus = ARTIFACTS.map(
      (a) => `${a} ${artifacts[a] ? color.green("✓") : color.red("✗")}`
    ).join(" ");
    rows.push([name, color.cyan(state.phase), artifactStatus]);
    const step = getNextStepSimple(state, artifacts, name);
    if (step) nextSteps.push(step);
  }

  const lines: string[] = [
    color.bold("活跃 Change："),
    table(["名称", "阶段", "制品"], rows),
  ];

  if (nextSteps.length > 0) {
    lines.push(`下一步：${nextSteps.join("；")}`);
  }

  return lines.join("\n");
}

async function detailMode(
  changesDir: string,
  name: string
): Promise<string> {
  const changePath = join(changesDir, name);
  if (!existsSync(changePath)) {
    return `未找到 change '${name}'`;
  }

  let state: AlloyState;
  try {
    state = await readState(changePath);
  } catch {
    return `change '${name}' 缺少 .alloy.yaml`;
  }

  const artifacts = checkArtifacts(changePath);
  const lines: string[] = [
    `${color.bold("阶段:")}    ${color.cyan(state.phase)}`,
    `${color.bold("Change:")}  ${name}`,
    `${color.bold("路径:")}    ${changePath}`,
    `${color.bold("创建时间:")} ${state.created_at}`,
    `${color.bold("更新时间:")} ${state.updated_at}`,
    color.bold("制品状态:"),
    ...ARTIFACTS.map(
      (a) => `  ${a.padEnd(12)} ${artifacts[a] ? color.green("✓") : color.red("✗")}`
    ),
  ];

  const nextStep = getNextStepDetail(state, artifacts);
  if (nextStep) lines.push(`下一步:   ${nextStep}`);

  return lines.join("\n");
}

function getNextStepSimple(
  state: AlloyState,
  artifacts: Record<string, boolean>,
  name: string
): string {
  switch (state.phase) {
    case "started":
      return `${name} 等待 /alloy-plan`;
    case "planned":
      return `${name} 等待 /alloy-apply`;
    case "applied":
      return `${name} 等待 /alloy-archive`;
    case "archived":
      return `${name} 等待 /alloy-finish`;
    case "finished":
      return `${name} 已完成`;
    default:
      return "";
  }
}

function getNextStepDetail(
  state: AlloyState,
  artifacts: Record<string, boolean>
): string {
  switch (state.phase) {
    case "started":
      return artifacts.plans ? "等待 /alloy-apply" : "继续 /alloy-plan，等待下一个制品生成";
    case "planned":
      return "等待 /alloy-apply";
    case "applied":
      return "等待 /alloy-archive";
    case "archived":
      return "等待 /alloy-finish";
    case "finished":
      return "已完成";
    default:
      return "";
  }
}
