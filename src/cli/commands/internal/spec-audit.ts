// src/cli/commands/internal/spec-audit.ts
// alloy _spec-audit [--fix]
// 检测 skill 文件与 spec 文件的 behaviors frontmatter 差异
// 对账方向：skill → spec 单向（skill 是真相源）

import matter from "gray-matter";
import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

// ─── 类型定义 ────────────────────────────────────────────

export interface Behaviors {
  // 旧字段（向下兼容；finish/apply/plan/start 等 spec 仍在用）
  stops?: number;
  // 新四字段（archive skill 已用，对应阶段 2 重写引入的精确术语）
  preconditions?: number;
  hard_stops?: number;
  user_gates?: number;
  warns?: number;
  // 不变字段
  artifacts: string[];
  transitions_to: string;
  external_calls: string[];
}

/** 数字字段列表（旧 stops + 新四字段） */
const NUMBER_FIELDS = [
  "stops",
  "preconditions",
  "hard_stops",
  "user_gates",
  "warns",
] as const;

/** 字段对应的中止/闸门类型文本，用于 formatDiff 输出 */
const UNIT_MAP: Record<string, string> = {
  stops: "STOP",
  preconditions: "PRECONDITION_FAIL",
  hard_stops: "HARD_STOP",
  user_gates: "USER_GATE",
  warns: "WARN",
};

export interface SkillEntry {
  skillName: string;
  spec: string | undefined;
  behaviors: Behaviors | undefined;
}

export interface SpecEntry {
  behaviors: Behaviors | undefined;
  content: string; // 完整文件内容（用于 --fix 时回写）
}

export type FieldDiffType = "number" | "string" | "array" | "missing-block";

export interface FieldDiff {
  field: string;
  type: FieldDiffType;
  skillValue: unknown;
  specValue: unknown;
  // 数组字段专用
  skillExtra?: string[];
  specExtra?: string[];
}

export type AuditStatus = "ok" | "diff" | "no-spec-field" | "spec-not-found";

export interface AuditResult {
  skillName: string;
  status: AuditStatus;
  diffs: FieldDiff[];
  specPath?: string; // 相对路径（用于定位 spec 文件）
}

// ─── 扫描 skill 文件 ─────────────────────────────────────

export async function scanSkills(projectRoot: string): Promise<SkillEntry[]> {
  const skillsDir = join(projectRoot, "commands", "alloy");
  if (!existsSync(skillsDir)) {
    console.error(`目录不存在: ${skillsDir}（请在 Alloy 项目根目录运行）`);
    process.exit(1);
  }
  const entries = await readdir(skillsDir);
  const mdFiles = entries.filter((f) => f.endsWith(".md")).sort();

  const results: SkillEntry[] = [];

  for (const file of mdFiles) {
    const filePath = join(skillsDir, file);
    const content = await readFile(filePath, "utf-8");
    const parsed = matter(content);
    const skillName = file.replace(/\.md$/, "");

    results.push({
      skillName,
      spec: parsed.data.spec as string | undefined,
      behaviors: parsed.data.behaviors as Behaviors | undefined,
    });
  }

  return results;
}

// ─── 读取 spec 文件 ──────────────────────────────────────

export async function readSpec(
  projectRoot: string,
  specPath: string
): Promise<SpecEntry> {
  const fullPath = join(projectRoot, "docs", "specification", specPath);
  const content = await readFile(fullPath, "utf-8");
  const parsed = matter(content);

  return {
    behaviors: parsed.data.behaviors as Behaviors | undefined,
    content,
  };
}

// ─── 比较 behaviors ──────────────────────────────────────

export function compareBehaviors(
  skillBehaviors: Behaviors,
  specBehaviors: Behaviors
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  // 数字字段：stops（旧）+ preconditions/hard_stops/user_gates/warns（新四字段）
  // 双方都 undefined → 跳过；任一方有值则按 number 比较
  for (const field of NUMBER_FIELDS) {
    const skillVal = skillBehaviors[field];
    const specVal = specBehaviors[field];
    if (skillVal === undefined && specVal === undefined) {
      continue;
    }
    if (skillVal !== specVal) {
      diffs.push({
        field,
        type: "number",
        skillValue: skillVal,
        specValue: specVal,
      });
    }
  }

  // 字符串字段：transitions_to
  if (skillBehaviors.transitions_to !== specBehaviors.transitions_to) {
    diffs.push({
      field: "transitions_to",
      type: "string",
      skillValue: skillBehaviors.transitions_to,
      specValue: specBehaviors.transitions_to,
    });
  }

  // 数组字段：artifacts, external_calls
  for (const field of ["artifacts", "external_calls"] as const) {
    const skillArr = skillBehaviors[field] ?? [];
    const specArr = specBehaviors[field] ?? [];
    const skillSet = new Set(skillArr);
    const specSet = new Set(specArr);

    const skillExtra = skillArr.filter((item) => !specSet.has(item));
    const specExtra = specArr.filter((item) => !skillSet.has(item));

    if (skillExtra.length > 0 || specExtra.length > 0) {
      diffs.push({
        field,
        type: "array",
        skillValue: skillArr,
        specValue: specArr,
        skillExtra,
        specExtra,
      });
    }
  }

  return diffs;
}

// ─── 执行审计 ─────────────────────────────────────────────

export async function audit(projectRoot: string): Promise<AuditResult[]> {
  const skills = await scanSkills(projectRoot);
  const results: AuditResult[] = [];

  for (const skill of skills) {
    // 未声明 spec 锚点
    if (!skill.spec) {
      results.push({
        skillName: skill.skillName,
        status: "no-spec-field",
        diffs: [],
      });
      continue;
    }

    // 缺少 behaviors（理论上不应该，但防御性编程）
    if (!skill.behaviors) {
      results.push({
        skillName: skill.skillName,
        status: "no-spec-field",
        diffs: [],
        specPath: skill.spec,
      });
      continue;
    }

    // 读取 spec 文件
    let specEntry: SpecEntry;
    try {
      specEntry = await readSpec(projectRoot, skill.spec);
    } catch {
      results.push({
        skillName: skill.skillName,
        status: "spec-not-found",
        diffs: [],
        specPath: skill.spec,
      });
      continue;
    }

    if (!specEntry.behaviors) {
      // spec 没有 behaviors，视为全部不一致
      const diffs: FieldDiff[] = [
        {
          field: "behaviors",
          type: "missing-block",
          skillValue: skill.behaviors,
          specValue: null,
        },
      ];
      results.push({
        skillName: skill.skillName,
        status: "diff",
        diffs,
        specPath: skill.spec,
      });
      continue;
    }

    // 比较
    const diffs = compareBehaviors(skill.behaviors, specEntry.behaviors);
    results.push({
      skillName: skill.skillName,
      status: diffs.length > 0 ? "diff" : "ok",
      diffs,
      specPath: skill.spec,
    });
  }

  return results;
}

// ─── 格式化输出 ───────────────────────────────────────────

export function formatDiff(diff: FieldDiff): string[] {
  const lines: string[] = [];
  if (diff.type === "missing-block") {
    lines.push(`  spec 缺少 behaviors frontmatter，skill 有完整数据`);
  } else if (diff.type === "number") {
    const field = diff.field;
    const specVal = diff.specValue as number | undefined;
    const skillVal = diff.skillValue as number | undefined;
    const unit = UNIT_MAP[field] ?? field;
    if (specVal === undefined && skillVal !== undefined) {
      lines.push(
        `  ${field}: spec=（缺失）, skill=${skillVal}（spec 缺少 ${unit} 声明）`
      );
    } else if (skillVal === undefined && specVal !== undefined) {
      lines.push(
        `  ${field}: spec=${specVal}, skill=（缺失）（skill 已弃用 ${unit}）`
      );
    } else if (typeof specVal === "number" && typeof skillVal === "number") {
      const delta = Math.abs(skillVal - specVal);
      const direction = skillVal > specVal ? "落后" : "多出";
      lines.push(
        `  ${field}: spec=${specVal}, skill=${skillVal}（spec ${direction} ${delta} 个 ${unit}）`
      );
    }
  } else if (diff.type === "string") {
    lines.push(
      `  ${diff.field}: spec=${JSON.stringify(diff.specValue)}, skill=${JSON.stringify(diff.skillValue)}`
    );
  } else if (diff.type === "array") {
    lines.push(
      `  ${diff.field}: spec=${JSON.stringify(diff.specValue)}, skill=${JSON.stringify(diff.skillValue)}`
    );
    if (diff.skillExtra && diff.skillExtra.length > 0) {
      lines.push(`    skill 多出: ${diff.skillExtra.join(", ")}`);
    }
    if (diff.specExtra && diff.specExtra.length > 0) {
      lines.push(`    spec 多出: ${diff.specExtra.join(", ")}`);
    }
  }
  return lines;
}

export function formatResult(result: AuditResult): string[] {
  const lines: string[] = [];

  switch (result.status) {
    case "ok":
      lines.push(`✓ ${result.skillName}: spec 与 skill 一致`);
      break;

    case "diff":
      lines.push(`✗ ${result.skillName}: spec 与 skill 不一致`);
      for (const diff of result.diffs) {
        lines.push(...formatDiff(diff));
      }
      break;

    case "no-spec-field":
      lines.push(`⚠ ${result.skillName}: 未声明 spec 锚点，跳过对账`);
      break;

    case "spec-not-found":
      lines.push(`✗ ${result.skillName}: 对应 spec 文件 ${result.specPath} 不存在`);
      break;
  }

  return lines;
}

// ─── --fix 模式：交互式修复 ──────────────────────────────

async function fixSpec(
  projectRoot: string,
  skillName: string,
  skillBehaviors: Behaviors,
  result: AuditResult
): Promise<number> {
  if (!result.specPath || result.diffs.length === 0) {
    return 0;
  }

  const fullPath = join(projectRoot, "docs", "specification", result.specPath);
  const content = await readFile(fullPath, "utf-8");
  const parsed = matter(content);
  const data = { ...parsed.data };
  let fixCount = 0;

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> =>
    new Promise((resolve) => rl.question(question, resolve));

  try {
    for (const diff of result.diffs) {
      // 展示差异详情
      for (const line of formatDiff(diff)) {
        console.log(line);
      }

      if (diff.type === "missing-block") {
        // spec 完全缺少 behaviors，整体覆盖
        const answer = await ask(
          `  是否用 skill 的值更新 spec 的 behaviors? [y/N] `
        );
        if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
          data.behaviors = skillBehaviors;
          fixCount++;
        }
        continue;
      }

      const answer = await ask(
        `  是否用 skill 的值更新 spec 的 ${diff.field}? [y/N] `
      );
      if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
        if (data.behaviors && typeof data.behaviors === "object") {
          (data.behaviors as Record<string, unknown>)[diff.field] =
            diff.skillValue;
          fixCount++;
        }
      }
    }
  } finally {
    rl.close();
  }

  if (fixCount > 0) {
    const output = matter.stringify(parsed.content, data);
    await writeFile(fullPath, output, "utf-8");
    console.log(`  ✓ ${skillName}: 已更新 ${fixCount} 个字段`);
  }

  return fixCount;
}

// ─── 主命令 ───────────────────────────────────────────────

const HELP = `
alloy _spec-audit [选项]

检测 skill 文件与 spec 文件的 behaviors frontmatter 差异。
对账方向：skill → spec（skill 是真相源）

选项:
  --fix    交互式修复：逐条确认后用 skill 的值更新 spec frontmatter
  -h, --help  显示帮助信息

退出码:
  0  全部一致（或 --fix 修复后全部对齐）
  1  存在不一致

输出示例:
  ✓ start: spec 与 skill 一致
  ✗ archive: spec 与 skill 不一致
    stops: spec=3, skill=4（spec 落后 1 个 STOP）
  ⚠ status: 未声明 spec 锚点，跳过对账
  ✗ fix: 对应 spec 文件 01-product-spec/06-fix-spec.md 不存在

参考: commands/alloy/references/spec-sync.md
`;

export async function specAuditCommand(args: string[]): Promise<void> {
  if (args.includes("-h") || args.includes("--help")) {
    console.log(HELP.trim());
    return;
  }

  const fix = args.includes("--fix");
  const projectRoot = process.cwd();

  const results = await audit(projectRoot);

  let hasDiff = false;
  let totalFixed = 0;

  // 构建 skill behaviors 索引，避免 fixSpec 重新扫描
  const skillsIndex = new Map<string, Behaviors>();
  for (const skill of await scanSkills(projectRoot)) {
    if (skill.behaviors) {
      skillsIndex.set(skill.skillName, skill.behaviors);
    }
  }

  for (const result of results) {
    const lines = formatResult(result);
    for (const line of lines) {
      console.log(line);
    }

    if (result.status === "diff") {
      hasDiff = true;

      if (fix) {
        const skillBehaviors = skillsIndex.get(result.skillName);
        if (skillBehaviors) {
          const fixed = await fixSpec(projectRoot, result.skillName, skillBehaviors, result);
          totalFixed += fixed;
        }
      }
    }

    if (result.status === "spec-not-found") {
      hasDiff = true;
    }
  }

  // --fix 模式汇总
  if (fix && totalFixed > 0) {
    console.log(`\n修复摘要: 共更新 ${totalFixed} 个字段`);
  }

  // 退出码
  if (hasDiff && !fix) {
    process.exit(1);
  }

  if (fix && hasDiff) {
    // fix 模式下如果有差异但已修复，退出码 0
    // 如果有差异但用户没有全部修复，仍然有未对齐项，退出码 1
    // 重新审计确认是否全部修复
    const recheck = await audit(projectRoot);
    const stillDiff = recheck.some(
      (r) => r.status === "diff" || r.status === "spec-not-found"
    );
    if (stillDiff) {
      process.exit(1);
    }
  }
}
