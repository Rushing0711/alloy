# Terminal UI 美化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引入终端美化能力（颜色、表格、box 面板、spinner），修复 CLI 和 Agent 输出的 CJK 框线错位，统一输出风格为极简克制。

**Architecture:** 创建 `src/utils/format.ts` 作为唯一格式化入口，封装 picocolors/cli-table3/boxen/ora。命令层通过 `import { color, table, box, spinner } from "../../utils/format.js"` 调用，不直接依赖底层库。所有函数内部做 TTY/Unicode 能力检测，非 TTY 环境静默降级为纯文本。

**Tech Stack:** picocolors, string-width, strip-ansi, cli-table3, boxen, ora

---

### Task 1: 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装运行时依赖**

```bash
cd /Users/wenqiu/AIAgent/alloy
npm install picocolors string-width strip-ansi cli-table3 boxen ora
```

- [ ] **Step 2: 安装 TypeScript 类型**

```bash
npm install -D @types/cli-table3
```

- [ ] **Step 3: 验证依赖安装成功**

```bash
node -e "import('picocolors').then(() => console.log('ok'))"
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: 添加终端 UI 依赖 (picocolors/cli-table3/boxen/ora)"
```

---

### Task 2: 创建 format.ts（TDD）

**Files:**
- Create: `test/utils/format.test.ts`
- Create: `src/utils/format.ts`

- [ ] **Step 1: 写失败的测试**

```typescript
// test/utils/format.test.ts
import { describe, it, expect } from "vitest";
import {
  color,
  box,
  table,
  borderedTable,
  spinner,
  stripAnsi,
  stringWidth,
} from "../../src/utils/format.js";

describe("color", () => {
  it("导出 green/red/yellow/cyan/dim/bold 函数", () => {
    expect(typeof color.green).toBe("function");
    expect(typeof color.red).toBe("function");
    expect(typeof color.yellow).toBe("function");
    expect(typeof color.cyan).toBe("function");
    expect(typeof color.dim).toBe("function");
    expect(typeof color.bold).toBe("function");
  });

  it("在非 TTY 环境下输出不含 ANSI 转义序列", () => {
    // vitest 运行时 process.stdout.isTTY 为 undefined
    const result = color.green("hello");
    expect(result).toBe("hello");
  });
});

describe("box", () => {
  it("生成带边框的文本", () => {
    const result = box("hello");
    expect(result).toContain("hello");
    // 应包含边框字符（Unicode round 或 ASCII single）
    const hasBorder =
      result.includes("─") || result.includes("-") || result.includes("=");
    expect(hasBorder).toBe(true);
  });

  it("支持 title 选项", () => {
    const result = box("content", { title: "标题" });
    expect(result).toContain("content");
  });

  it("正确处理 CJK 字符对齐", () => {
    const result = box("中文测试");
    const lines = result.split("\n");
    // 所有非空行的视觉宽度应一致（边框行）
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    if (nonEmpty.length >= 2) {
      const widths = nonEmpty.map((l) => stringWidth(l));
      const firstWidth = widths[0];
      expect(widths.every((w) => w === firstWidth)).toBe(true);
    }
  });
});

describe("table", () => {
  it("生成无边框表格，包含表头和数据行", () => {
    const result = table(["名称", "状态"], [["alloy", "已安装"]]);
    expect(result).toContain("名称");
    expect(result).toContain("状态");
    expect(result).toContain("alloy");
    expect(result).toContain("已安装");
  });

  it("无边框表格不包含 box-drawing 字符", () => {
    const result = table(["A", "B"], [["x", "y"]]);
    expect(result).not.toContain("│");
    expect(result).not.toContain("─");
    expect(result).not.toContain("┌");
    expect(result).not.toContain("└");
  });
});

describe("borderedTable", () => {
  it("生成带边框表格", () => {
    const result = borderedTable(["名称", "状态"], [["alloy", "已安装"]]);
    expect(result).toContain("名称");
    expect(result).toContain("alloy");
    // 应包含边框字符
    expect(result).toContain("│");
  });
});

describe("spinner", () => {
  it("返回 ora 实例，支持 succeed/fail/info", () => {
    const s = spinner("测试");
    expect(s).toBeDefined();
    expect(typeof s.succeed).toBe("function");
    expect(typeof s.fail).toBe("function");
    expect(typeof s.info).toBe("function");
    s.stop(); // 清理
  });
});

describe("stringWidth", () => {
  it("正确计算 ASCII 字符宽度", () => {
    expect(stringWidth("abc")).toBe(3);
  });

  it("正确计算 CJK 字符宽度", () => {
    expect(stringWidth("中文")).toBe(4);
  });

  it("混合 ASCII 和 CJK 字符", () => {
    expect(stringWidth("hello中文")).toBe(11);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- test/utils/format.test.ts
```
Expected: FAIL — `Cannot find module '../../src/utils/format.js'`

- [ ] **Step 3: 实现 format.ts**

```typescript
// src/utils/format.ts
import pc from "picocolors";
import cliTable from "cli-table3";
import boxen from "boxen";
import ora, { type Ora } from "ora";

// ── 颜色 ──
// picocolors 自动检测 TTY：非 TTY 时所有颜色函数返回原字符串
export const color = pc;

// ── 字符宽度 ──
export { default as stringWidth } from "string-width";

// ── Box 面板 ──
function isUnicodeSupported(): boolean {
  if ("CI" in process.env) return false;
  if (process.platform === "win32") return false;
  const term = process.env.TERM;
  if (term && term.includes("256color")) return true;
  const lang = process.env.LANG || "";
  if (lang.includes("UTF-8") || lang.includes("utf8")) return true;
  return true; // macOS/Linux 默认支持
}

export interface BoxOptions extends boxen.Options {}

export function box(text: string, opts?: BoxOptions): string {
  return boxen(text, {
    padding: 1,
    borderStyle: isUnicodeSupported() ? "round" : "single",
    ...opts,
  });
}

// ── 无边框表格 ──
export function table(headers: string[], rows: string[][]): string {
  const t = new cliTable({
    head: headers,
    style: { head: ["cyan"] },
    chars: {
      top: "",
      "top-mid": "",
      "top-left": "",
      "top-right": "",
      bottom: "",
      "bottom-mid": "",
      "bottom-left": "",
      "bottom-right": "",
      left: "  ",
      "left-mid": "",
      mid: "",
      "mid-mid": "",
      right: "",
      "right-mid": "",
      middle: "  ",
    },
  });
  for (const r of rows) {
    t.push(r);
  }
  return t.toString();
}

// ── 带边框表格 ──
export function borderedTable(headers: string[], rows: string[][]): string {
  const t = new cliTable({
    head: headers,
    style: { head: ["cyan"] },
  });
  for (const r of rows) {
    t.push(r);
  }
  return t.toString();
}

// ── Spinner ──
export function spinner(text: string): Ora {
  return ora({ text, isEnabled: process.stdout.isTTY ?? false }).start();
}

// ── 工具函数 ──
export { default as stripAnsi } from "strip-ansi";
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -- test/utils/format.test.ts
```
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/format.ts test/utils/format.test.ts
git commit -m "feat: 创建 format.ts 终端格式化模块"
```

---

### Task 3: 改造 doctor.ts（TDD）

**Files:**
- Modify: `src/cli/commands/doctor.ts`
- Existing: `test/cli/doctor.test.ts`（确保不破坏）

- [ ] **Step 1: 运行现有测试确认基线**

```bash
npm test -- test/cli/doctor.test.ts
```
Expected: 全部 PASS（记录基线）

- [ ] **Step 2: 修改 formatDoctorResult 使用 color**

在 `src/cli/commands/doctor.ts` 中：
1. 添加 import：`import { color } from "../../utils/format.js";`
2. 修改 `formatDoctorResult` 函数中的状态标记使用 color：

```typescript
export function formatDoctorResult(
  result: DoctorResult,
  useJson: boolean
): string {
  if (useJson) {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];

  lines.push(color.bold("健康检查："));
  for (const r of result.healthResults) {
    const mark =
      r.status === "pass"
        ? color.green("✓")
        : r.status === "warn"
          ? color.yellow("⚠️")
          : color.red("✗");
    lines.push(
      `  ${mark} ${r.name}: ${color.cyan(r.current)}（要求 ${color.dim(r.required)}）`
    );
  }

  if (result.consistencyWarnings.length > 0) {
    lines.push("\n" + color.bold("文件一致性："));
    for (const w of result.consistencyWarnings) {
      lines.push(`  ${color.yellow("⚠️")} ${w}`);
    }
  } else {
    lines.push("\n" + color.bold("文件一致性：") + color.green(" ✓ 无问题"));
  }

  return lines.join("\n");
}
```

- [ ] **Step 3: 运行测试确认通过**

```bash
npm test -- test/cli/doctor.test.ts
```
Expected: 全部 PASS（picocolors 在非 TTY 环境输出纯文本，现有测试的 `toContain("✓")` 等断言不受影响）

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/doctor.ts
git commit -m "feat: doctor 命令输出添加颜色语义"
```

---

### Task 4: 改造 status.ts（TDD）

**Files:**
- Modify: `src/cli/commands/status.ts`
- Existing: `test/cli/status.test.ts`（确保不破坏）

- [ ] **Step 1: 运行现有测试确认基线**

```bash
npm test -- test/cli/status.test.ts
```
Expected: 全部 PASS

- [ ] **Step 2: 修改 status.ts 使用 table 和 color**

在 `src/cli/commands/status.ts` 中：
1. 添加 import：`import { color, table } from "../../utils/format.js";`
2. 修改 `overviewMode` 函数，用 `table` 替代 `padEnd`：

```typescript
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
    rows.push([name, state.phase, artifactStatus]);
    const step = getNextStepSimple(state, artifacts, name);
    if (step) nextSteps.push(step);
  }

  const lines: string[] = [
    color.bold("活跃 Change："),
    table(["名称", "阶段", "制品"], rows),
  ];

  if (nextSteps.length > 0) {
    lines.push(`\n下一步：${nextSteps.join("；")}`);
  }

  return lines.join("\n");
}
```

3. 修改 `detailMode` 函数，用 color 替代 padEnd：

```typescript
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
    `${color.bold("路径:")}    ${color.dim(changePath)}`,
    `${color.bold("创建时间:")} ${state.created_at}`,
    `${color.bold("更新时间:")} ${state.updated_at}`,
    color.bold("制品状态:"),
    ...ARTIFACTS.map(
      (a) =>
        `  ${a.padEnd(12)} ${artifacts[a] ? color.green("✓") : color.red("✗")}`
    ),
  ];

  const nextStep = getNextStepDetail(state, artifacts);
  if (nextStep) lines.push(`${color.bold("下一步:")}   ${nextStep}`);

  return lines.join("\n");
}
```

- [ ] **Step 3: 运行测试确认通过**

```bash
npm test -- test/cli/status.test.ts
```
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/status.ts
git commit -m "feat: status 命令输出使用表格和颜色"
```

---

### Task 5: 改造 init.ts（TDD）

**Files:**
- Modify: `src/cli/commands/init.ts`
- Existing: `test/cli/init.test.ts`（确保不破坏）

- [ ] **Step 1: 运行现有测试确认基线**

```bash
npm test -- test/cli/init.test.ts
```
Expected: 全部 PASS

- [ ] **Step 2: 修改 init.ts 使用 color 和 spinner**

在 `src/cli/commands/init.ts` 中：
1. 添加 import：`import { color, spinner, box } from "../../utils/format.js";`
2. 将 emoji section header 替换为 color.bold：

```typescript
// 替换前: console.log("🔍 检测环境...");
// 替换后:
console.log(color.bold("检测环境..."));
```

3. 将状态标记替换为 color：

```typescript
// 替换前: console.log("     ✓ alloy-skills: 已安装");
// 替换后:
console.log(`     ${color.green("✓")} alloy-skills: 已安装`);

// 替换前: console.log("     ✗ openspec-schemas: 未安装");
// 替换后:
console.log(`     ${color.red("✗")} openspec-schemas: 未安装`);

// 替换前: console.log("     ⚠ 版本过低");
// 替换后:
console.log(`     ${color.yellow("⚠")} 版本过低`);
```

4. 在耗时操作前添加 spinner（以 detectEnv 为例）：

```typescript
// 替换前:
// console.log("🔍 检测环境...");
// const env = await detectEnv();

// 替换后:
const s = spinner("检测环境...");
const env = await detectEnv();
s.succeed("检测完成");
```

5. 统一 emoji section header 为 color.bold：

```typescript
// 替换前: console.log("📥 安装 OpenSpec CLI...");
// 替换后: console.log(color.bold("安装 OpenSpec CLI..."));

// 替换前: console.log("📂 初始化 OpenSpec 项目...");
// 替换后: console.log(color.bold("初始化 OpenSpec 项目..."));

// 替换前: console.log("🚀 部署 Skill 文件...");
// 替换后: console.log(color.bold("部署 Skill 文件..."));

// 替换前: console.log("🩺 健康检查...");
// 替换后: console.log(color.bold("健康检查..."));

// 替换前: console.log("🐚 注入 CLAUDE.md...");
// 替换后: console.log(color.bold("注入 CLAUDE.md..."));
```

- [ ] **Step 3: 运行测试确认通过**

```bash
npm test -- test/cli/init.test.ts
```
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/init.ts
git commit -m "feat: init 命令输出添加颜色和 spinner"
```

---

### Task 6: 改造 update.ts（TDD）

**Files:**
- Modify: `src/cli/commands/update.ts`
- Existing: `test/cli/update.test.ts`（确保不破坏）

- [ ] **Step 1: 运行现有测试确认基线**

```bash
npm test -- test/cli/update.test.ts
```
Expected: 全部 PASS

- [ ] **Step 2: 修改 update.ts 使用 color 和 spinner**

在 `src/cli/commands/update.ts` 中：
1. 添加 import：`import { color, spinner } from "../../utils/format.js";`
2. 将 emoji 替换为 color：

```typescript
// 替换前: console.log("🔧 更新中...");
// 替换后: console.log(color.bold("更新中..."));

// 替换前: console.log("🩺 健康检查...");
// 替换后: console.log(color.bold("健康检查..."));
```

3. 将结果数组中的状态标记替换为 color：

```typescript
// 替换前: results.push("✓ 更新完成");
// 替换后: results.push(`${color.green("✓")} 更新完成`);

// 替换前: results.push("⚠️ 版本未变");
// 替换后: results.push(`${color.yellow("⚠️")} 版本未变`);
```

- [ ] **Step 3: 运行测试确认通过**

```bash
npm test -- test/cli/update.test.ts
```
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/update.ts
git commit -m "feat: update 命令输出添加颜色和 spinner"
```

---

### Task 7: 更新 alloy-visual-spec.md

**Files:**
- Modify: `docs/alloy-visual-spec.md`

- [ ] **Step 1: 添加 CJK 字符宽度处理章节**

在 `docs/alloy-visual-spec.md` 的"十一、时间格式"之后，新增第十二章：

```markdown
## 十二、CJK 字符宽度处理

Agent 输出的框线（Phase 框、制品汇总表）依赖字符对齐。CJK 字符（中日韩）在终端中占 2 列宽度，ASCII 字符占 1 列。混用时必须按视觉宽度计算，否则右边框错位。

### 规则

1. **Phase 框宽度**：`─` 的数量 = 框内最大视觉宽度，而非固定 38。框内如有 CJK 文本，需逐行计算视觉宽度后取最大值。
2. **视觉宽度计算**：ASCII 字符 = 1 宽，CJK 字符 = 2 宽，emoji = 2 宽。
3. **右填充**：每行末尾到右边框的空格数 = 最大宽度 - 当前行视觉宽度。

### 示例

```
┌────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start         │
│ 启动时间: 2026-06-04 10:00:00      │
└────────────────────────────────────┘
```

"启动时间"占 4×2=8 宽，": " 占 2 宽，时间戳占 19 宽，共 29 宽。
"Alloy [1/5] · Phase: Start" 全 ASCII，共 28 宽。
最大宽度 29，`─` 数量 = 29 + 2（两侧 padding）= 31。

### 替代方案

当框内文本以 CJK 为主时，可用 `>` 块引用替代框线，避免对齐问题：

```
> Alloy [1/5] · Phase: Start
> 启动时间: 2026-06-04 10:00:00
```

这不改变信息密度，但完全避免了错位风险。在 CJK 混合内容较多的场景下优先使用此方案。
```

- [ ] **Step 2: 更新 Phase 框规则中的宽度说明**

修改"一、核心格式 → 1. Phase 框 → 规则"中的：

```
- 宽度固定 38 字符（`─` × 38）
```

改为：

```
- 宽度按框内最大视觉宽度计算（ASCII=1宽，CJK/emoji=2宽），`─` 数量 = 最大视觉宽度 + 2（两侧 padding）。当内容为纯 ASCII 时等效于 38 字符。
```

- [ ] **Step 3: Commit**

```bash
git add docs/alloy-visual-spec.md
git commit -m "docs: visual-spec 添加 CJK 字符宽度处理规范"
```

---

### Task 8: 全量验证

**Files:**
- None (验证步骤)

- [ ] **Step 1: 运行全量测试**

```bash
npm test
```
Expected: 全部 PASS

- [ ] **Step 2: 构建并 link**

```bash
npm run build && npm link
```
Expected: 无编译错误

- [ ] **Step 3: 人工测试**

在终端中运行以下命令，验证输出效果：

```bash
alloy status
alloy doctor
alloy init --help
```

验证项：
- [ ] CJK 字符不错位
- [ ] 状态标记有颜色（绿色 ✓、红色 ✗、黄色 ⚠️）
- [ ] 表格列对齐正常
- [ ] spinner 动画正常（init 命令）

- [ ] **Step 4: Commit 最终状态**

```bash
git add -A
git commit -m "feat: 终端 UI 美化完成"
```
