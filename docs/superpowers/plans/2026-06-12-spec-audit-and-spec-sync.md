# Spec Audit + Spec Sync 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `alloy _spec-audit` 内部命令（自动检测 spec/skill behaviors frontmatter 差异）和 `spec-sync.md` reference 文件（人工对账工作流指南）

**Architecture:** `spec-audit.ts` 遵循现有 internal 命令模式（手动参数解析、console 输出、process.exit），使用 `gray-matter` 解析 frontmatter，扫描 `commands/alloy/*.md` 提取 `spec` + `behaviors` 字段，与对应 spec 文件的 `behaviors` 逐字段比较。`spec-sync.md` 是纯 markdown reference 文件。

**Tech Stack:** TypeScript, gray-matter, vitest

---

## File Structure

| 文件 | 职责 |
|------|------|
| `src/cli/commands/internal/spec-audit.ts` | `_spec-audit` 命令：扫描、比较、修复 behaviors 差异 |
| `test/cli/internal/spec-audit.test.ts` | 单元测试：覆盖一致/差异/缺失/修复场景 |
| `commands/alloy/references/spec-sync.md` | 人工对账工作流指南 |
| `src/cli/index.ts` | 注册 `_spec-audit` 命令 |

---

### Task 1: 安装 gray-matter 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 gray-matter**

Run: `npm install gray-matter`

- [ ] **Step 2: 验证安装成功**

Run: `node -e "const m = require('gray-matter'); console.log(typeof m)" 2>/dev/null || npx tsx -e "import matter from 'gray-matter'; console.log(typeof matter)"`

Expected: 输出 `function` 或 `object`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: 添加 gray-matter 依赖"
```

---

### Task 2: 实现 spec-audit 核心逻辑——扫描与比较

**Files:**
- Create: `src/cli/commands/internal/spec-audit.ts`

- [ ] **Step 1: 创建 spec-audit.ts 骨架 + 扫描逻辑**

```typescript
// src/cli/commands/internal/spec-audit.ts
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";

interface Behaviors {
  stops: number;
  hard_stops: number;
  artifacts: string[];
  transitions_to: string;
  external_calls: string[];
}

interface SkillEntry {
  fileName: string;
  skillName: string;
  specPath: string | null;
  behaviors: Behaviors | null;
}

interface SpecEntry {
  fileName: string;
  behaviors: Behaviors | null;
  exists: boolean;
}

interface FieldDiff {
  field: string;
  specValue: unknown;
  skillValue: unknown;
  detail?: string;
}

interface AuditResult {
  skillName: string;
  status: "consistent" | "inconsistent" | "no-spec-anchor" | "spec-not-found";
  diffs: FieldDiff[];
}

const SPEC_BASE_DIR = "docs/specification";
const SKILL_DIR = "commands/alloy";

async function scanSkills(projectRoot: string): Promise<SkillEntry[]> {
  const skillDir = join(projectRoot, SKILL_DIR);
  const files = await readdir(skillDir);
  const mdFiles = files.filter((f) => f.endsWith(".md")).sort();

  const entries: SkillEntry[] = [];
  for (const file of mdFiles) {
    const content = await readFile(join(skillDir, file), "utf-8");
    const parsed = matter(content);
    const data = parsed.data as Record<string, unknown>;

    // 提取 skill name（从文件名去掉 .md）
    const skillName = file.replace(".md", "");

    // 提取 spec 锚点
    const specPath = (data.spec as string) || null;

    // 提取 behaviors
    const behaviors = data.behaviors as Behaviors | null;

    entries.push({
      fileName: file,
      skillName,
      specPath,
      behaviors,
    });
  }
  return entries;
}

async function readSpec(
  projectRoot: string,
  specPath: string
): Promise<SpecEntry> {
  const fullPath = join(projectRoot, SPEC_BASE_DIR, specPath);
  try {
    const content = await readFile(fullPath, "utf-8");
    const parsed = matter(content);
    const behaviors = parsed.behaviors as Behaviors | null;
    return { fileName: specPath, behaviors, exists: true };
  } catch {
    return { fileName: specPath, behaviors: null, exists: false };
  }
}

function compareBehaviors(
  skillBehaviors: Behaviors,
  specBehaviors: Behaviors
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  // 数字字段比较
  for (const field of ["stops", "hard_stops"] as const) {
    if (skillBehaviors[field] !== specBehaviors[field]) {
      const diff = skillBehaviors[field] - specBehaviors[field];
      const direction =
        diff > 0
          ? `spec 落后 ${diff} 个${field === "stops" ? " 🔴 STOP" : " HARD STOP"}`
          : `spec 超前 ${Math.abs(diff)} 个${field === "stops" ? " 🔴 STOP" : " HARD STOP"}`;
      diffs.push({
        field,
        specValue: specBehaviors[field],
        skillValue: skillBehaviors[field],
        detail: direction,
      });
    }
  }

  // 字符串字段比较
  if (skillBehaviors.transitions_to !== specBehaviors.transitions_to) {
    diffs.push({
      field: "transitions_to",
      specValue: specBehaviors.transitions_to,
      skillValue: skillBehaviors.transitions_to,
    });
  }

  // 数组字段比较（集合比较）
  for (const field of ["artifacts", "external_calls"] as const) {
    const specSet = new Set(specBehaviors[field] || []);
    const skillSet = new Set(skillBehaviors[field] || []);

    const onlyInSkill = [...skillSet].filter((x) => !specSet.has(x));
    const onlyInSpec = [...specSet].filter((x) => !skillSet.has(x));

    if (onlyInSkill.length > 0 || onlyInSpec.length > 0) {
      const parts: string[] = [];
      if (onlyInSkill.length > 0) parts.push(`skill 多出: ${onlyInSkill.join(", ")}`);
      if (onlyInSpec.length > 0) parts.push(`spec 多出: ${onlyInSpec.join(", ")}`);
      diffs.push({
        field,
        specValue: specBehaviors[field],
        skillValue: skillBehaviors[field],
        detail: parts.join("; "),
      });
    }
  }

  return diffs;
}

async function audit(projectRoot: string): Promise<AuditResult[]> {
  const skills = await scanSkills(projectRoot);
  const results: AuditResult[] = [];

  for (const skill of skills) {
    if (!skill.specPath) {
      results.push({
        skillName: skill.skillName,
        status: "no-spec-anchor",
        diffs: [],
      });
      continue;
    }

    if (!skill.behaviors) {
      results.push({
        skillName: skill.skillName,
        status: "no-spec-anchor",
        diffs: [],
      });
      continue;
    }

    const spec = await readSpec(projectRoot, skill.specPath);

    if (!spec.exists) {
      results.push({
        skillName: skill.skillName,
        status: "spec-not-found",
        diffs: [],
      });
      continue;
    }

    if (!spec.behaviors) {
      results.push({
        skillName: skill.skillName,
        status: "inconsistent",
        diffs: [{ field: "behaviors", specValue: null, skillValue: skill.behaviors, detail: "spec 无 behaviors frontmatter" }],
      });
      continue;
    }

    const diffs = compareBehaviors(skill.behaviors, spec.behaviors);
    results.push({
      skillName: skill.skillName,
      status: diffs.length === 0 ? "consistent" : "inconsistent",
      diffs,
    });
  }

  return results;
}

function formatResult(result: AuditResult): string[] {
  const lines: string[] = [];
  switch (result.status) {
    case "consistent":
      lines.push(`✓ ${result.skillName}: spec 与 skill 一致`);
      break;
    case "inconsistent":
      lines.push(`✗ ${result.skillName}: spec 与 skill 不一致`);
      for (const diff of result.diffs) {
        if (diff.field === "behaviors") {
          lines.push(`  ${diff.detail}`);
        } else if (typeof diff.specValue === "number" && typeof diff.skillValue === "number") {
          lines.push(`  ${diff.field}: spec=${diff.specValue}, skill=${diff.skillValue}（${diff.detail}）`);
        } else if (Array.isArray(diff.specValue) || Array.isArray(diff.skillValue)) {
          const specStr = JSON.stringify(diff.specValue);
          const skillStr = JSON.stringify(diff.skillValue);
          lines.push(`  ${diff.field}: spec=${specStr}, skill=${skillStr}`);
          if (diff.detail) lines.push(`    ${diff.detail}`);
        } else {
          lines.push(`  ${diff.field}: spec=${String(diff.specValue)}, skill=${String(diff.skillValue)}`);
        }
      }
      break;
    case "no-spec-anchor":
      lines.push(`⚠ ${result.skillName}: 未声明 spec 锚点，跳过对账`);
      break;
    case "spec-not-found":
      lines.push(`✗ ${result.skillName}: 对应 spec 文件不存在`);
      break;
  }
  return lines;
}
```

- [ ] **Step 2: 实现 specAuditCommand 主函数 + --fix 模式**

在同一文件 `src/cli/commands/internal/spec-audit.ts` 末尾添加：

```typescript
import * as readline from "node:readline";

async function fixSpec(
  projectRoot: string,
  specPath: string,
  skillBehaviors: Behaviors,
  diffs: FieldDiff[]
): Promise<number> {
  const fullPath = join(projectRoot, SPEC_BASE_DIR, specPath);
  const content = await readFile(fullPath, "utf-8");
  const parsed = matter(content);

  let fixCount = 0;
  const updatedBehaviors = { ...(parsed.data.behaviors as Behaviors || {}) };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askYes = (question: string): Promise<boolean> =>
    new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.toLowerCase() === "y");
      });
    });

  for (const diff of diffs) {
    if (diff.field === "behaviors") {
      // spec 完全没有 behaviors，整体写入
      const yes = await askYes(
        `  ${result.skillName}: spec 无 behaviors，是否从 skill 写入? [y/N] `
      );
      if (yes) {
        updatedBehaviors.stops = skillBehaviors.stops;
        updatedBehaviors.hard_stops = skillBehaviors.hard_stops;
        updatedBehaviors.artifacts = skillBehaviors.artifacts;
        updatedBehaviors.transitions_to = skillBehaviors.transitions_to;
        updatedBehaviors.external_calls = skillBehaviors.external_calls;
        fixCount++;
      }
      continue;
    }

    const yes = await askYes(
      `  ${diff.field}: spec=${JSON.stringify(diff.specValue)}, skill=${JSON.stringify(diff.skillValue)} — 是否用 skill 的值更新? [y/N] `
    );
    if (yes) {
      (updatedBehaviors as Record<string, unknown>)[diff.field] = diff.skillValue;
      fixCount++;
    }
  }

  rl.close();

  if (fixCount > 0) {
    parsed.data.behaviors = updatedBehaviors;
    const updated = matter.stringify(parsed.content, parsed.data);
    await writeFile(fullPath, updated, "utf-8");
  }

  return fixCount;
}

export async function specAuditCommand(args: string[]): Promise<void> {
  const fixMode = args.includes("--fix");
  const projectRoot = process.cwd();

  const results = await audit(projectRoot);
  let hasInconsistency = false;
  let totalFixed = 0;

  for (const result of results) {
    const lines = formatResult(result);
    for (const line of lines) {
      console.log(line);
    }

    if (result.status === "inconsistent") {
      hasInconsistency = true;

      if (fixMode && result.diffs.length > 0) {
        const skill = (await scanSkills(projectRoot)).find(
          (s) => s.skillName === result.skillName
        );
        if (skill?.specPath && skill.behaviors) {
          const fixCount = await fixSpec(projectRoot, skill.specPath, skill.behaviors, result.diffs);
          totalFixed += fixCount;
          if (fixCount > 0) {
            console.log(`  → 已修复 ${fixCount} 个字段`);
          }
        }
      }
    }

    if (result.status === "spec-not-found") {
      hasInconsistency = true;
    }
  }

  if (fixMode && totalFixed > 0) {
    console.log(`\n修复完成: ${totalFixed} 个字段已更新`);
  }

  if (hasInconsistency && !fixMode) {
    process.exit(1);
  }
}
```

**注意：** 上面 `fixSpec` 中的 `result` 变量引用了外层循环的 `result`，这是一个 bug——需要在最终实现时将 skillName 作为参数传入 `fixSpec`。修正后的 `fixSpec` 签名应为 `async function fixSpec(projectRoot: string, specPath: string, skillName: string, skillBehaviors: Behaviors, diffs: FieldDiff[]): Promise<number>`，且内部提示信息使用传入的 `skillName`。

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/internal/spec-audit.ts
git commit -m "feat: 实现 alloy _spec-audit 命令"
```

---

### Task 3: 注册 _spec-audit 命令到 CLI 入口

**Files:**
- Modify: `src/cli/index.ts`

- [ ] **Step 1: 添加 import**

在 `src/cli/index.ts` 顶部（现有 internal 命令 import 之后）添加：

```typescript
import { specAuditCommand } from "./commands/internal/spec-audit.js";
```

- [ ] **Step 2: 添加 switch case**

在 `src/cli/index.ts` 的 `switch (command)` 块中（现有 `_artifact` case 之后）添加：

```typescript
case "_spec-audit": {
  await specAuditCommand(restArgs);
  break;
}
```

- [ ] **Step 3: 构建验证**

Run: `npm run build`

Expected: 编译成功，无错误

- [ ] **Step 4: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: 注册 _spec-audit 命令到 CLI 入口"
```

---

### Task 4: 编写 spec-audit 单元测试

**Files:**
- Create: `test/cli/internal/spec-audit.test.ts`

- [ ] **Step 1: 创建测试文件**

```typescript
// test/cli/internal/spec-audit.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// 直接测试核心函数，不通过 CLI 入口
// 先 import 内部函数——需要在 spec-audit.ts 中 export 它们
import {
  scanSkills,
  readSpec,
  compareBehaviors,
  audit,
  formatResult,
} from "../../../src/cli/commands/internal/spec-audit.js";

describe("alloy _spec-audit", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-spec-audit-test-${Date.now()}`);
    await mkdir(join(tmpDir, "commands/alloy"), { recursive: true });
    await mkdir(join(tmpDir, "docs/specification/01-product-spec"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeSkill(name: string, frontmatter: Record<string, unknown>, body = ""): Promise<void> {
    const yamlHeader = Object.entries(frontmatter)
      .map(([k, v]) => {
        if (typeof v === "object" && v !== null && !Array.isArray(v)) {
          // 嵌套对象（behaviors）——简单序列化
          const inner = Object.entries(v as Record<string, unknown>)
            .map(([bk, bv]) => {
              if (Array.isArray(bv)) {
                return `  ${bk}: [${bv.join(", ")}]`;
              }
              return `  ${bk}: ${bv}`;
            })
            .join("\n");
          return `${k}:\n${inner}`;
        }
        if (Array.isArray(v)) {
          return `${k}: [${v.join(", ")}]`;
        }
        if (typeof v === "string") return `${k}: "${v}"`;
        return `${k}: ${v}`;
      })
      .join("\n");
    await writeFile(
      join(tmpDir, "commands/alloy", `${name}.md`),
      `---\n${yamlHeader}\n---\n\n${body}`,
      "utf-8"
    );
  }

  async function writeSpec(name: string, behaviors: Record<string, unknown>, body = ""): Promise<void> {
    const inner = Object.entries(behaviors)
      .map(([k, v]) => {
        if (Array.isArray(v)) return `  ${k}: [${v.join(", ")}]`;
        return `  ${k}: ${v}`;
      })
      .join("\n");
    await writeFile(
      join(tmpDir, "docs/specification/01-product-spec", name),
      `---\nbehaviors:\n${inner}\n---\n\n${body}`,
      "utf-8"
    );
  }

  describe("scanSkills", () => {
    it("扫描 commands/alloy/*.md 并提取 frontmatter", async () => {
      await writeSkill("start", {
        name: "Alloy: Start",
        spec: "01-product-spec/01-start-spec.md",
        behaviors: { stops: 15, hard_stops: 5, artifacts: ["draft"], transitions_to: "started", external_calls: ["opsx:explore"] },
      });
      await writeSkill("plan", {
        name: "Alloy: Plan",
        spec: "01-product-spec/02-plan-spec.md",
        behaviors: { stops: 6, hard_stops: 3, artifacts: ["proposal"], transitions_to: "planned", external_calls: [] },
      });

      const skills = await scanSkills(tmpDir);
      expect(skills).toHaveLength(2);
      expect(skills[0].skillName).toBe("plan"); // sorted
      expect(skills[0].specPath).toBe("01-product-spec/02-plan-spec.md");
      expect(skills[0].behaviors?.stops).toBe(6);
    });
  });

  describe("compareBehaviors", () => {
    it("一致时返回空数组", () => {
      const b = { stops: 15, hard_stops: 5, artifacts: ["draft"], transitions_to: "started", external_calls: ["opsx:explore"] };
      const diffs = compareBehaviors(b, b);
      expect(diffs).toEqual([]);
    });

    it("检测数字字段差异", () => {
      const skill = { stops: 16, hard_stops: 5, artifacts: [] as string[], transitions_to: "", external_calls: [] as string[] };
      const spec = { stops: 15, hard_stops: 5, artifacts: [] as string[], transitions_to: "", external_calls: [] as string[] };
      const diffs = compareBehaviors(skill, spec);
      expect(diffs).toHaveLength(1);
      expect(diffs[0].field).toBe("stops");
      expect(diffs[0].detail).toContain("spec 落后");
    });

    it("检测数组字段差异", () => {
      const skill = { stops: 0, hard_stops: 0, artifacts: ["draft", "proposal"], transitions_to: "", external_calls: ["opsx:archive", "superpowers:x"] };
      const spec = { stops: 0, hard_stops: 0, artifacts: ["draft"], transitions_to: "", external_calls: ["opsx:archive"] };
      const diffs = compareBehaviors(skill, spec);
      expect(diffs).toHaveLength(2);
      const artifactsDiff = diffs.find((d) => d.field === "artifacts");
      expect(artifactsDiff?.detail).toContain("skill 多出: proposal");
      const callsDiff = diffs.find((d) => d.field === "external_calls");
      expect(callsDiff?.detail).toContain("skill 多出: superpowers:x");
    });

    it("检测 transitions_to 差异", () => {
      const skill = { stops: 0, hard_stops: 0, artifacts: [] as string[], transitions_to: "archived", external_calls: [] as string[] };
      const spec = { stops: 0, hard_stops: 0, artifacts: [] as string[], transitions_to: "applied", external_calls: [] as string[] };
      const diffs = compareBehaviors(skill, spec);
      expect(diffs).toHaveLength(1);
      expect(diffs[0].field).toBe("transitions_to");
    });
  });

  describe("audit", () => {
    it("一致时返回 consistent", async () => {
      await writeSkill("start", {
        spec: "01-product-spec/01-start-spec.md",
        behaviors: { stops: 15, hard_stops: 5, artifacts: ["draft"], transitions_to: "started", external_calls: ["opsx:explore"] },
      });
      await writeSpec("01-start-spec.md", { stops: 15, hard_stops: 5, artifacts: ["draft"], transitions_to: "started", external_calls: ["opsx:explore"] });

      const results = await audit(tmpDir);
      expect(results[0].status).toBe("consistent");
    });

    it("差异时返回 inconsistent", async () => {
      await writeSkill("start", {
        spec: "01-product-spec/01-start-spec.md",
        behaviors: { stops: 16, hard_stops: 5, artifacts: ["draft"], transitions_to: "started", external_calls: ["opsx:explore"] },
      });
      await writeSpec("01-start-spec.md", { stops: 15, hard_stops: 5, artifacts: ["draft"], transitions_to: "started", external_calls: ["opsx:explore"] });

      const results = await audit(tmpDir);
      expect(results[0].status).toBe("inconsistent");
      expect(results[0].diffs).toHaveLength(1);
    });

    it("无 spec 锚点时返回 no-spec-anchor", async () => {
      await writeSkill("status", { name: "Alloy: Status" }); // 无 spec 和 behaviors

      const results = await audit(tmpDir);
      expect(results[0].status).toBe("no-spec-anchor");
    });

    it("spec 文件不存在时返回 spec-not-found", async () => {
      await writeSkill("start", {
        spec: "01-product-spec/99-missing-spec.md",
        behaviors: { stops: 15, hard_stops: 5, artifacts: ["draft"], transitions_to: "started", external_calls: [] },
      });

      const results = await audit(tmpDir);
      expect(results[0].status).toBe("spec-not-found");
    });
  });

  describe("formatResult", () => {
    it("consistent 输出 ✓", () => {
      const lines = formatResult({ skillName: "start", status: "consistent", diffs: [] });
      expect(lines[0]).toContain("✓");
      expect(lines[0]).toContain("start");
    });

    it("no-spec-anchor 输出 ⚠", () => {
      const lines = formatResult({ skillName: "fix", status: "no-spec-anchor", diffs: [] });
      expect(lines[0]).toContain("⚠");
    });

    it("spec-not-found 输出 ✗", () => {
      const lines = formatResult({ skillName: "start", status: "spec-not-found", diffs: [] });
      expect(lines[0]).toContain("✗");
    });

    it("inconsistent 输出差异详情", () => {
      const lines = formatResult({
        skillName: "archive",
        status: "inconsistent",
        diffs: [{ field: "stops", specValue: 3, skillValue: 4, detail: "spec 落后 1 个 🔴 STOP" }],
      });
      expect(lines[0]).toContain("✗");
      expect(lines[1]).toContain("stops");
      expect(lines[1]).toContain("spec=3");
      expect(lines[1]).toContain("skill=4");
    });
  });
});
```

- [ ] **Step 2: 导出核心函数用于测试**

在 `src/cli/commands/internal/spec-audit.ts` 中确保以下函数被 export：
- `scanSkills`
- `readSpec`
- `compareBehaviors`
- `audit`
- `formatResult`

这些函数已在 Task 2 的实现中定义，只需在函数声明前加上 `export` 关键字。

- [ ] **Step 3: 运行测试**

Run: `npx vitest run test/cli/internal/spec-audit.test.ts`

Expected: 所有测试通过

- [ ] **Step 4: Commit**

```bash
git add test/cli/internal/spec-audit.test.ts src/cli/commands/internal/spec-audit.ts
git commit -m "test: 添加 _spec-audit 单元测试"
```

---

### Task 5: 编写 spec-sync.md reference 文件

**Files:**
- Create: `commands/alloy/references/spec-sync.md`

- [ ] **Step 1: 创建 spec-sync.md**

```markdown
# Spec-Sync：Spec/Skill 对账工作流

所有 alloy 阶段命令共享的 spec-skill 对账工作流。修改 `commands/alloy/*.md` 或 `src/` 后触发。

## 1. 自动检测

```bash
alloy _spec-audit
```

输出差异报告：
- `✓ <name>: spec 与 skill 一致` — 无需操作
- `✗ <name>: spec 与 skill 不一致` — 需要同步
- `⚠ <name>: 未声明 spec 锚点，跳过对账` — 缺少 `spec` frontmatter
- `✗ <name>: 对应 spec 文件不存在` — spec 路径有误

## 2. 定位变更源

确认哪个 skill 文件修改了 behaviors：
- 新增/删除了 🔴 STOP → `stops` 或 `hard_stops` 变化
- 变更了外部调用 → `external_calls` 变化
- 产物列表更新 → `artifacts` 变化
- 阶段目标变更 → `transitions_to` 变化

## 3. 更新 spec 正文

确保 spec 正文描述与 skill 一致。例如：
- skill 新增了 🔴 STOP → spec 正文应有对应的确认点描述
- skill 新增了 external_call → spec 正文应有该技能的调用说明
- skill 修改了 transitions_to → spec 正文的目标阶段描述应更新

## 4. 更新 spec frontmatter

方式一：手动修改 spec 文件的 `behaviors` frontmatter

方式二：自动更新（仅修改 frontmatter，不修改正文）
```bash
alloy _spec-audit --fix
```

## 5. 验证

```bash
alloy _spec-audit
```

确认所有字段输出 `✓`。

## 6. 提交

skill 变更和 spec 变更在同一 commit 中：
```bash
git add commands/alloy/<skill>.md docs/specification/01-product-spec/<spec>.md
git commit -m "docs(<name>): 同步 spec 与 skill behaviors"
```

## 注意事项

- **对账方向是 skill → spec**（skill 是真相源）
- 只改 spec 匹配 skill，不反向修改 skill
- 正文同步是人工判断，frontmatter 同步可自动化
- `--fix` 只修改 frontmatter，不修改 spec 正文——正文必须手动同步
```

- [ ] **Step 2: Commit**

```bash
git add commands/alloy/references/spec-sync.md
git commit -m "docs: 添加 spec-sync 对账工作流 reference"
```

---

### Task 6: 构建与集成测试

**Files:**
- (无新文件)

- [ ] **Step 1: 运行全量测试**

Run: `npm test`

Expected: 所有测试通过（包括现有 337+ 测试和新增的 spec-audit 测试）

- [ ] **Step 2: 构建**

Run: `npm run build`

Expected: 编译成功

- [ ] **Step 3: 用 aldev 运行 _spec-audit 命令验证**

Run: `node /Users/wenqiu/AIAgent/alloy/dist/cli/index.js _spec-audit`

Expected: 输出所有 skill 的 spec 对账结果，所有 7 个 skill 应显示 `✓`（因为 behaviors 刚同步过）

- [ ] **Step 4: Final commit（如有构建产物变化）**

```bash
git add -A
git diff --cached --quiet || git commit -m "chore: 构建与集成测试验证"
```
