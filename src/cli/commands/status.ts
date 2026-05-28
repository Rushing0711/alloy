import { join } from "node:path";
import { existsSync } from "node:fs";
import { findActiveChanges, readState, AlloyState } from "../utils/state.js";

const ARTIFACTS = [
  "draft",
  "proposal",
  "design",
  "specs",
  "tasks",
  "plan",
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
    return "无活跃 change。使用 /alloy:start <topic> 开始新工作流。";
  }

  const lines: string[] = ["活跃 Change："];
  const nextSteps: string[] = [];

  for (const [name, state] of changes) {
    const artifacts = checkArtifacts(join(changesDir, name));
    const artifactStatus = ARTIFACTS.map(
      (a) => `${a} ${artifacts[a] ? "✓" : "✗"}`
    ).join(" ");
    lines.push(
      `  ${name.padEnd(20)} ${state.phase.padEnd(10)} artifacts: ${artifactStatus}`
    );
    const step = getNextStepSimple(state, artifacts, name);
    if (step) nextSteps.push(step);
  }

  if (nextSteps.length > 0) {
    lines.push(`\n下一步：${nextSteps.join("；")}`);
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
    `阶段:    ${state.phase}`,
    `Change:  ${name}`,
    `路径:    ${changePath}`,
    "制品状态:",
    ...ARTIFACTS.map(
      (a) => `  ${a.padEnd(12)} ${artifacts[a] ? "✓" : "✗"}`
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
      return `${name} 等待 /alloy:plan`;
    case "planned":
      return `${name} 等待 /alloy:apply`;
    case "applied":
      return `${name} 等待 /alloy:finish`;
    case "finished":
      return `${name} 等待 /alloy:archive`;
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
      return artifacts.plan ? "等待 /alloy:apply" : "继续 /alloy:plan，等待下一个制品生成";
    case "planned":
      return "等待 /alloy:apply";
    case "applied":
      return "等待 /alloy:finish";
    case "finished":
      return "等待 /alloy:archive";
    default:
      return "";
  }
}
