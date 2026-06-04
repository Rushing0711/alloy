# CLI 输出层重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一 CLI 输出风格，抽取公共输出层，清理 skill 文件误导内容，降级 inquirer 以支持 Node 18 交互。

**Architecture:** 新建 `src/utils/output.ts` 作为组合层，封装 `format.ts` 底层原语，提供 `section`/`check`/`success`/`error`/`warn`/`banner`/`detailTable`/`info` 八个函数。四个 CLI 命令改为调用 output 层。八个 skill 文件删除格式化函数章节。`@inquirer/prompts` 从 v8 降到 v7，`prompt.ts` 删除版本判断逻辑。

**Tech Stack:** TypeScript, vitest, picocolors, boxen, cli-table3, @inquirer/prompts v7

---

## File Map

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/utils/output.ts` | 新建 | 组合层：section/check/success/error/warn/banner/detailTable/info |
| `test/utils/output.test.ts` | 新建 | output.ts 的单元测试 |
| `src/cli/commands/init.ts` | 修改 | 30+ 处 console.log → output 函数 |
| `src/cli/commands/doctor.ts` | 修改 | formatDoctorResult → output 函数 |
| `src/cli/commands/status.ts` | 修改 | detail 模式 → output 函数 |
| `src/cli/commands/update.ts` | 修改 | 5 处 console.log → output 函数 |
| `test/cli/init.test.ts` | 修改 | 适配新的输出方式 |
| `test/cli/doctor.test.ts` | 修改 | 适配新的输出方式 |
| `commands/alloy/*.md` (8 个) | 修改 | 删除格式化工具函数章节 |
| `package.json` | 修改 | @inquirer/prompts ^8.5.0 → ^7.10.1 |
| `src/utils/prompt.ts` | 修改 | 删除 supportsInquirer 和数字编号 fallback |

---

### Task 1: 新建 output.ts 并通过测试

**Files:**
- Create: `src/utils/output.ts`
- Create: `test/utils/output.test.ts`

- [ ] **Step 1: 编写 output.ts 测试**

```typescript
// test/utils/output.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  section,
  check,
  success,
  error,
  warn,
  banner,
  detailTable,
  info,
} from "../../src/utils/output.js";
import { stripAnsi } from "../../src/utils/format.js";

describe("section", () => {
  it("输出粗体标题，前面有空行", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    section("测试标题");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("测试标题");
    expect(stripAnsi(output)).toMatch(/^\n\s+测试标题$/);
    spy.mockRestore();
  });
});

describe("check", () => {
  it("pass 状态输出绿色 ✓", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    check("Node.js", "v18.0.0", "pass");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("✓");
    expect(output).toContain("Node.js");
    expect(output).toContain("v18.0.0");
    spy.mockRestore();
  });

  it("fail 状态输出红色 ✗", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    check("Git", "未安装", "fail");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("✗");
    expect(output).toContain("Git");
    spy.mockRestore();
  });

  it("warn 状态输出黄色 ⚠", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    check("OpenSpec", "v1.2.0", "warn");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("⚠");
    spy.mockRestore();
  });
});

describe("success", () => {
  it("输出绿色 ✓ 消息", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    success("操作成功");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("✓");
    expect(output).toContain("操作成功");
    spy.mockRestore();
  });
});

describe("error", () => {
  it("输出红色 ✗ 消息", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    error("操作失败");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("✗");
    expect(output).toContain("操作失败");
    spy.mockRestore();
  });
});

describe("warn", () => {
  it("输出黄色 ⚠ 消息", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    warn("警告信息");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("⚠");
    expect(output).toContain("警告信息");
    spy.mockRestore();
  });
});

describe("banner", () => {
  it("输出绿色横幅", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    banner("✅ 完成");
    const output = spy.mock.calls.join("\n");
    expect(output).toContain("✅ 完成");
    spy.mockRestore();
  });
});

describe("detailTable", () => {
  it("输出带边框表格", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    detailTable(["名称", "状态"], [["alloy", "已安装"]]);
    const output = spy.mock.calls.join("\n");
    expect(output).toContain("名称");
    expect(output).toContain("alloy");
    expect(output).toContain("│");
    spy.mockRestore();
  });
});

describe("info", () => {
  it("输出缩进普通文本", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    info("普通信息");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("普通信息");
    expect(output).toMatch(/^\s{3}/); // 至少 3 个空格缩进
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- test/utils/output.test.ts`
Expected: FAIL — 模块 `../../src/utils/output.js` 不存在

- [ ] **Step 3: 编写 output.ts 实现**

```typescript
// src/utils/output.ts
import { color, boxPanel, borderedTable } from "./format.js";

/** 分区标题——粗体，前面空行 */
export function section(title: string): void {
  console.log(`\n  ${color.bold(title)}`);
}

/** 检查项——带状态图标 */
export function check(label: string, value: string, status: "pass" | "fail" | "warn"): void {
  const icon =
    status === "pass" ? color.green("✓") :
    status === "fail" ? color.red("✗") :
    color.yellow("⚠");
  const coloredValue =
    status === "fail" ? color.cyan(value) : color.cyan(value);
  console.log(`     ${icon} ${label} ${coloredValue}`);
}

/** 成功消息 */
export function success(msg: string): void {
  console.log(`     ${color.green("✓")} ${msg}`);
}

/** 错误消息（输出到 stderr） */
export function error(msg: string): void {
  console.error(`     ${color.red("✗")} ${msg}`);
}

/** 警告消息 */
export function warn(msg: string): void {
  console.log(`     ${color.yellow("⚠")} ${msg}`);
}

/** 结束横幅 */
export function banner(msg: string): void {
  console.log(`\n  ${color.green(msg)}`);
}

/** 详情表——boxPanel 包裹的 borderedTable */
export function detailTable(headers: string[], rows: string[][]): void {
  const table = borderedTable(headers, rows);
  console.log(boxPanel(table, { title: "" }));
}

/** 信息行——缩进普通文本 */
export function info(msg: string): void {
  console.log(`   ${msg}`);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- test/utils/output.test.ts`
Expected: PASS

- [ ] **Step 5: 运行全量测试确认无回归**

Run: `npm test`
Expected: 全部通过

- [ ] **Step 6: 提交**

```bash
git add src/utils/output.ts test/utils/output.test.ts
git commit -m "feat: 新建 output.ts 输出层"
```

---

### Task 2: 重构 init.ts 使用 output 函数

**Files:**
- Modify: `src/cli/commands/init.ts`
- Modify: `test/cli/init.test.ts`

- [ ] **Step 1: 修改 init.ts 导入**

将：
```typescript
import { color, spinner } from "../../utils/format.js";
```

改为：
```typescript
import { color, spinner } from "../../utils/format.js";
import { section, check, success, error, warn, banner, info } from "../../utils/output.js";
```

- [ ] **Step 2: 替换环境检测输出**

将：
```typescript
console.log("\n  " + color.bold("检测环境..."));
console.log(`     Node.js ${color.cyan(env.nodeVersion)} ${color.green("✓")}`);
console.log(`     git ${env.gitInstalled ? color.green("✓") : color.red("✗ 未安装")}`);
console.log(`     Claude Code ${env.claudeCodeInstalled ? color.green("✓") : color.yellow("⚠ 未检测到 CLI，请确保已安装")}`);
```

改为：
```typescript
section("检测环境...");
check("Node.js", env.nodeVersion, "pass");
check("git", env.gitInstalled ? "已安装" : "未安装", env.gitInstalled ? "pass" : "fail");
check("Claude Code", env.claudeCodeInstalled ? "已安装" : "未检测到 CLI", env.claudeCodeInstalled ? "pass" : "warn");
```

- [ ] **Step 3: 替换 git 未安装错误**

将：
```typescript
console.error("\n  " + color.red("❌ 缺少必要依赖，请先安装 git"));
```

改为：
```typescript
error("❌ 缺少必要依赖，请先安装 git");
```

- [ ] **Step 4: 替换 OpenSpec CLI 安装输出**

将：
```typescript
console.log("\n  " + color.bold("安装 OpenSpec CLI..."));
// ...
console.log(`     ${color.green("✓")} @fission-ai/openspec@1 已安装`);
// ...
console.error(`     ${color.red("✗")} OpenSpec CLI 安装失败`);
```

改为：
```typescript
section("安装 OpenSpec CLI...");
// ...
success("@fission-ai/openspec@1 已安装");
// ...
error("OpenSpec CLI 安装失败");
```

- [ ] **Step 5: 替换 OpenSpec 项目初始化输出**

将：
```typescript
console.log("\n  " + color.bold("初始化 OpenSpec 项目结构..."));
// ...
console.error(`     ${color.red("✗")} OpenSpec 项目初始化失败`);
```

改为：
```typescript
section("初始化 OpenSpec 项目结构...");
// ...
error("OpenSpec 项目初始化失败");
```

- [ ] **Step 6: 替换 Superpowers 安装输出**

将：
```typescript
console.log("\n  " + color.bold("安装 Superpowers..."));
// ...
console.log(`     ${color.green("✓")} Superpowers 已安装`);
// ...
console.log(`     ${color.red("✗")} Superpowers 安装失败，请稍后手动运行 alloy init 重试`);
// ...
console.log(`     ${color.green("✓")} Superpowers${versionInfo} 已安装${locationInfo}，跳过`);
```

改为：
```typescript
section("安装 Superpowers...");
// ...
success("Superpowers 已安装");
// ...
warn("Superpowers 安装失败，请稍后手动运行 alloy init 重试");
// ...
success(`Superpowers${versionInfo} 已安装${locationInfo}，跳过`);
```

- [ ] **Step 7: 替换 commands 部署输出**

将：
```typescript
console.log("\n  " + color.bold("部署 Alloy commands..."));
// ...
console.log(`     ${color.yellow("⚠")} 未选择任何 AI 工具，跳过 command 部署`);
// ...
console.log(`     ${color.green("✓")} ${p}`);
// ...
console.error(`     ${color.red("✗")} command 部署失败: ${(e as Error).message}`);
// ...
console.log(`     ${color.green("✓")} 项目 schema → ${schemaPath}`);
```

改为：
```typescript
section("部署 Alloy commands...");
// ...
warn("未选择任何 AI 工具，跳过 command 部署");
// ...
success(p);
// ...
error(`command 部署失败: ${(e as Error).message}`);
// ...
success(`项目 schema → ${schemaPath}`);
```

- [ ] **Step 8: 替换 .gitignore 输出**

将：
```typescript
console.log(`     ${color.green("✓")} .gitignore → 已追加 ${missing.length} 条规则`);
```

改为：
```typescript
success(`.gitignore → 已追加 ${missing.length} 条规则`);
```

- [ ] **Step 9: 替换 CLAUDE.md 输出**

将：
```typescript
console.log(`     ${color.green("✓")} CLAUDE.md → 已追加 Alloy 工作流提示`);
```

改为：
```typescript
success("CLAUDE.md → 已追加 Alloy 工作流提示");
```

- [ ] **Step 10: 替换兼容性检查输出**

将：
```typescript
console.log("\n  " + color.bold("兼容性检查..."));
// ...
console.log(
  `     ${mark} ${r.name} ${color.cyan(r.current)}（要求 ${color.dim(r.required)}）`
);
```

改为：
```typescript
section("兼容性检查...");
// ...
check(r.name, `${r.current}（要求 ${r.required}）`, r.status);
```

- [ ] **Step 11: 替换 shell 补全输出**

将：
```typescript
console.log("\n  " + color.bold("注册 shell 补全..."));
// ...
console.log(`     ${color.green("✓")} shell 补全已注册 → ${rcFile}`);
// ...
console.log(`     ${color.green("✓")} shell 补全已存在，跳过`);
// ...
console.log(`     ${color.yellow("⚠")} 未检测到 bash/zsh，跳过补全注册`);
```

改为：
```typescript
section("注册 shell 补全...");
// ...
success(`shell 补全已注册 → ${rcFile}`);
// ...
success("shell 补全已存在，跳过");
// ...
warn("未检测到 bash/zsh，跳过补全注册");
```

- [ ] **Step 12: 替换完成横幅**

将：
```typescript
console.log("\n  " + color.green("✅ Alloy 就绪！"));
console.log("     在 Claude Code 中输入 /alloy:start <topic> 开始工作\n");
```

改为：
```typescript
banner("✅ Alloy 就绪！");
info("在 Claude Code 中输入 /alloy:start <topic> 开始工作\n");
```

- [ ] **Step 13: 更新 init.test.ts**

测试中的 `consoleLogSpy`/`consoleErrorSpy` 断言保持不变——output 函数内部仍然调用 `console.log`/`console.error`，现有的 `expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(...))` 断言仍然有效。

运行测试确认：`npm test -- test/cli/init.test.ts`

- [ ] **Step 14: 提交**

```bash
git add src/cli/commands/init.ts test/cli/init.test.ts
git commit -m "refactor: init.ts 使用 output 层统一输出"
```

---

### Task 3: 重构 doctor.ts 使用 output 函数

**Files:**
- Modify: `src/cli/commands/doctor.ts`
- Modify: `test/cli/doctor.test.ts`

**注意：** `formatDoctorResult` 返回字符串供调用方使用，不能改为直接 console 输出。策略：新增 `printDoctorResult` 函数使用 output.ts 直接输出，保留 `formatDoctorResult` 给 JSON 模式和测试。

- [ ] **Step 1: 修改 doctor.ts 导入**

将：
```typescript
import { color } from "../../utils/format.js";
```

改为：
```typescript
import { color } from "../../utils/format.js";
import { section, check, warn } from "../../utils/output.js";
```

- [ ] **Step 2: 新增 printDoctorResult 函数**

在 `formatDoctorResult` 之后添加：

```typescript
export function printDoctorResult(result: DoctorResult): void {
  section("健康检查");
  for (const r of result.healthResults) {
    check(r.name, `${r.current}（要求 ${r.required}）`, r.status);
  }

  if (result.consistencyWarnings.length > 0) {
    section("文件一致性");
    for (const w of result.consistencyWarnings) {
      warn(w);
    }
  } else {
    section("文件一致性");
    check("一致性", "无问题", "pass");
  }
}
```

- [ ] **Step 3: 检查 doctor 的 CLI 入口调用方**

Run: `grep -r "formatDoctorResult\|printDoctorResult\|doctorCommand" src/cli/ --include="*.ts" -l`

找到 CLI 入口文件，将文本模式的调用从 `formatDoctorResult` 改为 `printDoctorResult`。JSON 模式保留 `formatDoctorResult`。

- [ ] **Step 4: 运行测试**

Run: `npm test -- test/cli/doctor.test.ts`
Expected: PASS（现有测试测 formatDoctorResult，不受影响）

- [ ] **Step 5: 提交**

```bash
git add src/cli/commands/doctor.ts
git commit -m "refactor: doctor.ts 新增 printDoctorResult 使用 output 层"
```

---

### Task 4: 重构 status.ts 使用 output 函数

**Files:**
- Modify: `src/cli/commands/status.ts`
- Modify: `src/cli/index.ts`（调用方适配）

**注意：** `statusCommand` 返回字符串，调用方在 `index.ts:261-266` 打印。策略：新增 `printStatusDetail` 函数使用 output.ts 直接输出，`index.ts` 调用新函数。

- [ ] **Step 1: 修改 status.ts 导入**

将：
```typescript
import { color, table } from "../../utils/format.js";
```

改为：
```typescript
import { color, table } from "../../utils/format.js";
import { section, check } from "../../utils/output.js";
```

- [ ] **Step 2: 新增 printStatusDetail 函数**

在 `statusCommand` 之后添加：

```typescript
export function printStatusDetail(
  state: AlloyState,
  name: string,
  changePath: string,
  artifacts: Record<string, boolean>,
  nextStep: string | null
): void {
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

  if (nextStep) {
    check("下一步", nextStep, "pass");
  }
}
```

- [ ] **Step 3: 修改 index.ts 中 status 命令的调用**

将：
```typescript
const result = await statusCommand(projectPath, changeName);
if (useJson) {
  console.log(JSON.stringify({ output: result }, null, 2));
} else {
  console.log(result);
}
```

改为：
```typescript
if (useJson) {
  const result = await statusCommand(projectPath, changeName);
  console.log(JSON.stringify({ output: result }, null, 2));
} else {
  await statusCommand(projectPath, changeName);
  // statusCommand 内部已通过 output 函数直接输出
}
```

同时需要修改 `statusCommand` 函数，让它在非 JSON 模式下直接输出（通过 output 函数），JSON 模式下返回字符串。

- [ ] **Step 4: 运行测试**

Run: `npm test`
Expected: 全部通过

- [ ] **Step 5: 提交**

```bash
git add src/cli/commands/status.ts src/cli/index.ts
git commit -m "refactor: status.ts 使用 output 层统一输出"
```

---

### Task 5: 重构 update.ts 使用 output 函数

**Files:**
- Modify: `src/cli/commands/update.ts`

**注意：** `updateCommand` 返回 `string[]`，调用方在 `index.ts:291` 循环打印。策略：直接 `console.log` 调用改为 output 函数，`results` 数组中的返回值保持原样（它们由调用方打印）。

- [ ] **Step 1: 修改 update.ts 导入**

将：
```typescript
import { color } from "../../utils/format.js";
```

改为：
```typescript
import { color } from "../../utils/format.js";
import { section, check, success, info } from "../../utils/output.js";
```

- [ ] **Step 2: 替换直接 console.log 调用**

将：
```typescript
console.log("  🔧 开发模式，从本地构建重新部署…");
```

改为：
```typescript
info("🔧 开发模式，从本地构建重新部署…");
```

将：
```typescript
console.log(`\n  发现新版本: ${color.cyan(`v${latest}`)}（当前 v${currentVersion}）`);
```

改为：
```typescript
section("版本检查");
info(`发现新版本: v${latest}（当前 v${currentVersion}）`);
```

将：
```typescript
console.log("  🩺 兼容性检查…");
```

改为：
```typescript
section("兼容性检查");
```

将：
```typescript
console.log(`     ${color.yellow("⚠")} ${w.name}: ${color.cyan(w.current)}`);
```

改为：
```typescript
check(w.name, w.current, "warn");
```

将：
```typescript
console.log(`     ${color.green("✓")} 兼容性检查通过`);
```

改为：
```typescript
success("兼容性检查通过");
```

- [ ] **Step 3: results 数组保持不变**

`results.push(...)` 中的字符串是返回值，由 `index.ts:291` 的 `for (const r of results) console.log(...)` 打印。这些保持使用 `color` 拼接，不改为 output 函数。

- [ ] **Step 4: 运行测试**

Run: `npm test`
Expected: 全部通过

- [ ] **Step 5: 提交**

```bash
git add src/cli/commands/update.ts
git commit -m "refactor: update.ts 使用 output 层统一输出"
```

---

### Task 6: 清理 8 个 skill 文件的格式化工具函数章节

**Files:**
- Modify: `commands/alloy/start.md`
- Modify: `commands/alloy/plan.md`
- Modify: `commands/alloy/apply.md`
- Modify: `commands/alloy/archive.md`
- Modify: `commands/alloy/finish.md`
- Modify: `commands/alloy/discard.md`
- Modify: `commands/alloy/status.md`
- Modify: `commands/alloy/fix.md`

- [ ] **Step 1: 删除 start.md 中的格式化工具函数章节**

删除从 `## 格式化工具函数` 到 `---` 之间的所有内容（第 18-53 行），保留 `---` 分隔线。

即删除：
```
## 格式化工具函数

项目提供了终端格式化工具函数...
（整个章节）
```

- [ ] **Step 2: 对其余 7 个文件执行相同操作**

每个文件都有相同的"格式化工具函数"章节，内容一致，全部删除。

- [ ] **Step 3: 验证删除结果**

Run: `grep -l "boxPanel\|tableWithBorder\|statusLine\|progressBar" commands/alloy/*.md`
Expected: 无输出（所有文件都不再包含这些函数名）

- [ ] **Step 4: 运行测试**

Run: `npm test`
Expected: 全部通过

- [ ] **Step 5: 提交**

```bash
git add commands/alloy/
git commit -m "docs: 删除 skill 文件中的格式化工具函数章节"
```

---

### Task 7: 降级 @inquirer/prompts 并简化 prompt.ts

**Files:**
- Modify: `package.json`
- Modify: `src/utils/prompt.ts`

- [ ] **Step 1: 降级 @inquirer/prompts**

```bash
npm install @inquirer/prompts@^7.10.1
```

- [ ] **Step 2: 简化 prompt.ts**

删除 `supportsInquirer` 常量和所有 fallback 分支。

将整个文件改为：

```typescript
import { select, checkbox, confirm } from "@inquirer/prompts";

export interface Choice {
  name: string;
  value: string;
}

export async function promptSelect(message: string, choices: Choice[]): Promise<string> {
  return select({ message, choices });
}

export async function promptMultiSelect(
  message: string,
  choices: Choice[],
  opts?: { validate?: (ids: string[]) => true | string }
): Promise<string[]> {
  const rawValidate = opts?.validate;
  return checkbox({
    message,
    choices: choices.map((c) => ({ name: c.name, value: c.value })),
    validate: rawValidate
      ? (vals: readonly { name: string; value: string }[]) =>
          rawValidate(vals.map((v) => v.value))
      : undefined,
  }) as Promise<string[]>;
}

export async function promptConfirm(message: string, defaultValue?: boolean): Promise<boolean> {
  return confirm({ message, default: defaultValue });
}
```

- [ ] **Step 3: 运行测试**

Run: `npm test`
Expected: 全部通过

- [ ] **Step 4: 构建确认**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 5: 提交**

```bash
git add package.json package-lock.json src/utils/prompt.ts
git commit -m "feat: 降级 @inquirer/prompts v7，Node 18 支持箭头选择"
```

---

### Task 8: 全量验证与收尾

- [ ] **Step 1: 运行全量测试**

Run: `npm test`
Expected: 263+ 测试全部通过

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 3: link 并手动验证**

Run: `npm link`
在 test_alloy 项目中运行 `alloy init` 或 `alloy status` 查看输出效果。

- [ ] **Step 4: 最终提交（如有遗漏）**

```bash
git status
# 确认无遗漏文件
```
