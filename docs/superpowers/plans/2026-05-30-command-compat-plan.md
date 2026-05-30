# 命令兼容层实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Commands-only 部署架构——skill 内容迁入 command 文件，8 agent 多选安装，按 agent 能力适配冒号/横线格式，prompt 按 Node 版本自适应。

**Architecture:** 新建 `agents.ts`（agent 注册表 + 反向检测），重构 `prompt.ts`（supportsInquirer + 统一 API），重写 `skills.ts`（deploySkills→deployCommands），更新 init/update/health 消费端。

**Tech Stack:** TypeScript, Node.js ≥ 18, vitest, @inquirer/prompts (Node ≥ 20)

---

### Task 1: Types + Agent 注册表

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/core/agents.ts`

- [ ] **Step 1: 新增 AgentInfo 类型 + 扩展 DeployOptions**

`src/core/types.ts`:

```typescript
export interface AgentInfo {
  id: string;
  label: string;
  supportsColonCommands: boolean;
  commandsDir: string;
  globalOnly?: boolean;
}

export interface DeployOptions {
  scope: "global" | "project";
  injectClaudeMd: boolean;
  projectPath: string;
  targetAgents: AgentInfo[];
}
```

- [ ] **Step 2: 创建 agents.ts — KNOWN_AGENTS 注册表**

`src/core/agents.ts`:

```typescript
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { AgentInfo } from "./types.js";

export const KNOWN_AGENTS: AgentInfo[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    supportsColonCommands: true,
    commandsDir: ".claude/commands/",
  },
  {
    id: "codebuddy",
    label: "CodeBuddy",
    supportsColonCommands: true,
    commandsDir: ".codebuddy/commands/",
  },
  {
    id: "qoder",
    label: "Qoder",
    supportsColonCommands: true,
    commandsDir: ".qoder/commands/",
  },
  {
    id: "cursor",
    label: "Cursor",
    supportsColonCommands: false,
    commandsDir: ".cursor/commands/",
  },
  {
    id: "opencode",
    label: "OpenCode",
    supportsColonCommands: false,
    commandsDir: ".opencode/commands/",
  },
  {
    id: "codex",
    label: "Codex",
    supportsColonCommands: false,
    commandsDir: ".codex/prompts/",
    globalOnly: true,
  },
  {
    id: "trae",
    label: "Trae",
    supportsColonCommands: false,
    commandsDir: ".trae/commands/",
  },
  {
    id: "pi",
    label: "Pi",
    supportsColonCommands: false,
    commandsDir: ".pi/prompts/",
  },
];

const COMMAND_IDS = [
  "start", "plan", "apply", "archive",
  "finish", "fix", "discard", "status",
];

/** scope 对应的基础路径 */
function basePath(scope: "global" | "project", projectPath: string): string {
  if (scope === "global") {
    return process.env.HOME || process.env.USERPROFILE || "~";
  }
  return projectPath;
}

/** 反向推导：检查哪些 agent 已有 alloy command 部署 */
export function detectDeployedAgents(
  scope: "global" | "project",
  projectPath: string
): AgentInfo[] {
  const base = basePath(scope, projectPath);

  return KNOWN_AGENTS.filter((agent) => {
    const dir = join(base, agent.commandsDir);

    if (agent.supportsColonCommands) {
      const alloyDir = join(dir, "alloy");
      return existsSync(alloyDir) && existsSync(join(alloyDir, "start.md"));
    }

    return existsSync(join(dir, "alloy-start.md"));
  });
}

/** 获取 agent command 部署的目标路径 */
export function getCommandTargetDir(
  agent: AgentInfo,
  scope: "global" | "project",
  projectPath: string
): string {
  const base = basePath(scope, projectPath);
  if (agent.supportsColonCommands) {
    return join(base, agent.commandsDir, "alloy");
  }
  return join(base, agent.commandsDir);
}

export { COMMAND_IDS };
```

- [ ] **Step 3: 编译并运行现有测试确保无回归**

Run: `npm run build && npm test`
Expected: 编译成功，现有测试全部 PASS。

- [ ] **Step 4: 提交**

```bash
git add src/core/types.ts src/core/agents.ts
git commit -m "feat: AgentInfo 类型 + KNOWN_AGENTS 注册表 + detectDeployedAgents"
```

---

### Task 2: prompt.ts 重构 — 统一交互 API

**Files:**
- Modify: `src/utils/prompt.ts`

- [ ] **Step 1: 重写 prompt.ts**

`src/utils/prompt.ts`:

```typescript
import { createInterface } from "node:readline";

// 一次判断，启动时确定
export const supportsInquirer = (() => {
  const [major] = process.versions.node.split(".").map(Number);
  return major >= 20;
})();

// —— 底层 stdin helpers ——

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer);
    });
  });
}

// —— 对外统一 API ——

export interface Choice {
  name: string;
  value: string;
}

export async function promptSelect(message: string, choices: Choice[]): Promise<string> {
  if (supportsInquirer) {
    const { select } = await import("@inquirer/prompts");
    return select({ message, choices });
  }

  // stdin fallback
  console.log(message);
  choices.forEach((c, i) => console.log(`  [${i + 1}] ${c.name}`));
  const answer = await ask(`输入数字 (1-${choices.length}): `);
  const idx = parseInt(answer.trim(), 10) - 1;
  if (idx >= 0 && idx < choices.length) return choices[idx].value;
  return choices[0].value;
}

export async function promptMultiSelect(
  message: string,
  choices: Choice[],
  opts?: { validate?: (ids: string[]) => true | string }
): Promise<string[]> {
  if (supportsInquirer) {
    const { checkbox } = await import("@inquirer/prompts");
    return checkbox({
      message,
      choices: choices.map((c) => ({ name: c.name, value: c.value })),
      validate: opts?.validate,
    }) as Promise<string[]>;
  }

  // stdin fallback: 编号多选
  while (true) {
    console.log(message);
    choices.forEach((c, i) => console.log(`  [${i + 1}] ${c.name}`));
    const answer = await ask("输入编号，逗号分隔: ");
    const trimmed = answer.trim();
    if (!trimmed) {
      if (opts?.validate) {
        const err = opts.validate([]);
        if (err !== true) { console.log(`  ⚠ ${err}`); continue; }
      }
      return [];
    }
    const ids: string[] = [];
    const parts = trimmed.split(/[,，\s]+/);
    for (const p of parts) {
      const idx = parseInt(p, 10) - 1;
      if (idx >= 0 && idx < choices.length) {
        ids.push(choices[idx].value);
      }
    }
    if (opts?.validate) {
      const err = opts.validate(ids);
      if (err !== true) { console.log(`  ⚠ ${err}`); continue; }
    }
    return ids;
  }
}

export async function promptConfirm(message: string, defaultValue?: boolean): Promise<boolean> {
  if (supportsInquirer) {
    const { confirm } = await import("@inquirer/prompts");
    return confirm({ message, default: defaultValue });
  }

  const suffix = defaultValue === true ? " [Y/n] " : defaultValue === false ? " [y/N] " : " [y/N] ";
  const answer = await ask(message + suffix);
  const trimmed = answer.trim().toLowerCase();
  if (trimmed === "") return defaultValue ?? false;
  return trimmed === "y" || trimmed === "yes";
}
```

- [ ] **Step 2: 编译验证**

Run: `npx tsc --noEmit`
Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
git add src/utils/prompt.ts
git commit -m "feat: prompt.ts 重构 — supportsInquirer + promptMultiSelect + promptConfirm"
```

---

### Task 3: 创建 command 源文件

**Files:**
- Create: `commands/alloy/start.md` (等 8 个)
- Create: `commands/alloy-plan.md` (等 8 个横线文件)

- [ ] **Step 1: 创建 commands/ 目录结构 + 冒号版 command 文件（8 个）**

`commands/alloy/start.md`（以 start 为例，其余 7 个对应各自的 SKILL.md 内容）:

```markdown
---
name: "Alloy: Start"
description: 智能入口 - 自动检测状态，接续或新建 change
category: Workflow
tags: [alloy, workflow]
---

# alloy-start

你是 Alloy 工作流的智能入口。你的职责是：检测当前状态、路由到正确流程、调度外部技能完成探查和需求设计，最后产出 draft.md。

**核心原则：把实际工作委托给专门的技能，不要自己做。Alloy 是编排器，不是执行者。**

---

## 状态检测

**第一步：检查项目是否就绪。** 检查 `openspec/config.yaml` 是否存在——这是项目已初始化 OpenSpec 的唯一标记。

如果 `openspec/config.yaml` 不存在，说明项目尚未初始化。引导用户运行 `alloy init` 完成项目级初始化。OpenSpec 技能可以全局共享，但 `openspec/` 目录是每个项目的"身份证"——必须在项目中创建。

**第二步：扫描活跃 change。** 扫描 `openspec/changes/*/.alloy.yaml`，统计 phase != `finished` 的 change。

---

## 全新开始（无活跃 change + 用户提供了 topic）

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start           │
└──────────────────────────────────────┘
```

### [Step 1/2] 上下文探查

> 正在探查项目上下文和需求空间...

**立即执行：** 使用 Skill 工具加载 `opsx:explore` 技能。禁止跳过此步骤。

如果 `opsx:explore` 不可用（OpenSpec 未安装或命令不存在），引导用户运行 `alloy init` 完成环境初始化。

技能加载后，按其指引自由探索项目上下文和需求空间。

**什么算不够（反例）：**
- 只看了 README 就算"探查完成"
- 没有实际读取任何代码文件
- 没有检查已有的 OpenSpec spec 文件

---

### [Step 2/2] 需求设计

> 正在启动 brainstorming...

**立即执行：** 使用 Skill 工具加载 `superpowers:brainstorming` 技能。禁止跳过此步骤。

将探查结果作为 ARGUMENTS 传入：
```
探查结果：<Step 1 的关键发现摘要>
主题：<topic>
项目类型：<新项目/存量项目>
```

技能加载后，按其指引进行交互式需求设计。

如果 `superpowers:brainstorming` 不可用，引导用户运行 `alloy init` 完成环境初始化。brainstorming 技能内置了审批闸门和 Q&A 深度——普通对话无法复现这些行为。

**brainstorming 完成后，你必须等待用户确认方案，然后生成 `draft.md`：**

```markdown
# [功能名称]

## Why
<!-- 要解决的问题 -->

## What
<!-- 方案概述 -->

## 关键决策
<!-- 关键技术决策及理由 -->
<!-- 将 brainstorming 的详细设计论述写入此章节，不单独产出 superpowers spec 文件 -->

## 范围与边界
<!-- 做什么、明确不做什么 -->
```

**关键：** brainstorming 的所有设计论述（方案对比、技术决策、架构考量）全部写入 draft.md 的"关键决策"章节。不单独在 `docs/superpowers/specs/` 生成文件——draft.md 是 brainstorming 的唯一产出。

**用户明确确认方案之前，不要生成 draft.md。** 如果用户要求调整方案，回到 brainstorming 继续讨论，不要急于产出文件。

**什么算"用户确认了"（反例）：**
- 用户说"还行"、"可以"——追问他是否满意关键决策和范围边界
- 用户只确认了部分内容——确保所有关键决策都被明确认可

---

### 完成

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start — DONE    │
└──────────────────────────────────────┘

draft.md 已生成。

准备好后，运行 `/alloy:plan` 进入规划阶段。
```

- draft.md 在项目根目录，change 目录由 plan 阶段创建
- 完成后不要自动进入 plan

---

## 自由探索（无活跃 change + 无 topic）

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start           │
└──────────────────────────────────────┘
```

### [Step 1/2] 扫描项目上下文

扫描项目上下文（README、已有代码、requirement.md、OpenSpec spec 文件等）。

### [Step 2/2] 呈现发现与建议

**有上下文可读时：** 总结项目信息（技术栈、已有功能、最近变更），基于发现给用户 2-3 个建议方向或追问。目标是帮用户明确他想做什么，而不是抛回一句"请提供主题"。

**空项目无可读上下文时：** 直接告诉用户："项目较新，没有太多上下文可供参考。请提供需求主题：`/alloy:start <topic>`"

---

## 强制新建（--new <topic>）

无论是否有活跃 change，直接走"全新开始"流程。多个 change 可并行 planning，但不能同时 apply（一个 session 只能有一个工作中的 worktree）。

---

## 接续（有 1 个活跃 change）

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start           │
└──────────────────────────────────────┘

→ 检测到活跃 change：<name>
→ 当前阶段：<phase>
→ 已完成制品：<列出已有文件>
→ 下一步：<建议操作>
```

### [Step 1/1] 状态展示与接续建议

先读取 `.alloy.yaml` 获取 phase 和 worktree 字段，再检查文件系统确认实际制品状态。

| phase | 接续方式 |
|-------|---------|
| `started` | 引导用户继续 `/alloy:plan` |
| `planned` | 引导用户继续 `/alloy:apply` |
| `applied` | 引导用户继续 `/alloy:archive` |
| `archived` | 引导用户继续 `/alloy:finish` |
| `finished` | 工作流已完成——如需继续修改，使用自然对话提交新变更 |

一致性检查（双向）：
- worktree 字段有值但磁盘路径不存在 → ⚠️ "worktree 残留：.alloy.yaml 声称有 worktree 但磁盘不存在"
- worktree 字段为 null 但 `.worktrees/<name>/` 目录存在 → ⚠️ "worktree 孤儿：磁盘存在 worktree 但 .alloy.yaml 未记录，建议手动验证并更新状态"
- 发现孤儿 worktree 时，询问用户是否修复 .alloy.yaml：`alloy _state write openspec/changes/<name> worktree ".worktrees/<name>"`

---

## 多选（有多个活跃 change）

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start           │
└──────────────────────────────────────┘

→ 检测到 <N> 个活跃 change，请选择。
```

### [Step 1/1] 展示并选择

列出所有活跃 change（名称 + phase + 制品状态），让用户选择接续哪个，或 `--new <topic>` 开新 change。
```

- [ ] **Step 2: 创建其余 7 个冒号版 command 文件**

按同样的方式，将 `skills/alloy-plan/SKILL.md` → `commands/alloy/plan.md`，`skills/alloy-apply/SKILL.md` → `commands/alloy/apply.md`，依此类推。frontmatter 格式改为 command 格式（`name: "Alloy: Xxx"`, `description`, `category`, `tags`）。内容中 `/alloy-start` 等引用改为 `/alloy:start`。

快速创建命令：
```bash
for id in start plan apply archive finish fix discard status; do
  echo "Creating commands/alloy/${id}.md..."
done
```

- [ ] **Step 3: 创建横线版 command 文件（8 个）**

横线版内容与冒号版完全一致，仅文件名不同（`commands/alloy-start.md` 等）。frontmatter 中的 `name` 字段不带冒号（如 `"Alloy Start"`），内容中 slash command 引用使用 `/alloy-start`。

```bash
for id in start plan apply archive finish fix discard status; do
  cp commands/alloy/${id}.md commands/alloy-${id}.md
done
```

然后用 sed 替换内部命令引用：`/alloy:start` → `/alloy-start`。

- [ ] **Step 4: 删除旧 skills/ 目录**

不再部署 skills，删除源文件：

```bash
rm -rf skills/alloy-start/ skills/alloy-plan/ skills/alloy-apply/ \
       skills/alloy-finish/ skills/alloy-archive/ skills/alloy-fix/ \
       skills/alloy-discard/ skills/alloy-status/ skills/alloy/
```

- [ ] **Step 5: 验证文件结构**

Run: `ls commands/alloy/ && ls commands/alloy-*.md`
Expected: 8 个文件在 `commands/alloy/` 下，8 个横线文件在 `commands/` 下，skills/ 已清理。

- [ ] **Step 6: 提交**

```bash
git add commands/ && git rm -r skills/alloy* 2>/dev/null
git commit -m "feat: commands/ 源文件 — skill 内容迁入冒号+横线双格式"
```

---

### Task 4: deployCommands — 取代 deploySkills

**Files:**
- Modify: `src/core/skills.ts`

- [ ] **Step 1: 重写 skills.ts — deployCommands()**

`src/core/skills.ts`:

```typescript
import { mkdir, cp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getPackageRoot } from "../utils/fs.js";
import type { DeployOptions } from "./types.js";
import { getCommandTargetDir, COMMAND_IDS } from "./agents.js";

export async function deployCommands(opts: DeployOptions): Promise<string[]> {
  const deployed: string[] = [];
  const packageRoot = getPackageRoot();
  const home = process.env.HOME || process.env.USERPROFILE || "~";

  for (const agent of opts.targetAgents) {
    // Codex: project 模式跳过
    if (agent.globalOnly && opts.scope === "project") {
      console.log(`     ⚠ Codex commands 仅全局安装有效，跳过`);
      continue;
    }

    const targetDir = getCommandTargetDir(agent, opts.scope, opts.projectPath);
    await mkdir(targetDir, { recursive: true });

    const sourceDir = agent.supportsColonCommands
      ? join(packageRoot, "commands", "alloy")
      : join(packageRoot, "commands");

    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      // 横线模式：只拷贝 alloy-*.md 文件
      if (!agent.supportsColonCommands && !entry.name.startsWith("alloy-")) continue;

      const src = join(sourceDir, entry.name);
      const dest = join(targetDir, entry.name);
      await cp(src, dest);
      deployed.push(dest);
    }
  }

  return deployed;
}

// deploySchema 保持不变（见当前代码）
export async function deploySchema(opts: DeployOptions): Promise<string> {
  // ... 现有逻辑不变
}
```

- [ ] **Step 2: 编译验证**

Run: `npx tsc --noEmit`
Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
git add src/core/skills.ts
git commit -m "feat: deployCommands() — 按 agent 部署冒号/横线 command 文件"
```

---

### Task 5: init.ts — agent 多选 + deployCommands

**Files:**
- Modify: `src/cli/commands/init.ts`

- [ ] **Step 1: 更新 init.ts**

`src/cli/commands/init.ts`:

```typescript
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { detectEnv } from "../../core/detect.js";
import { runHealthCheck } from "../../core/health.js";
import { installOpenSpecCli, initOpenSpecProject } from "../../core/openspec.js";
import { installSuperpowers } from "../../core/superpowers.js";
import { deployCommands, deploySchema } from "../../core/skills.js";
import { injectClaudeMd } from "../../core/claude-md.js";
import type { DeployOptions, AgentInfo } from "../../core/types.js";
import { KNOWN_AGENTS } from "../../core/agents.js";
import { getPackageRoot } from "../../utils/fs.js";
import { promptSelect, promptMultiSelect, supportsInquirer } from "../../utils/prompt.js";

export async function selectScope(passedScope?: string): Promise<"global" | "project"> {
  if (passedScope) return passedScope as "global" | "project";
  return promptSelect("Install scope:", [
    { name: "Project (current directory)", value: "project" },
    { name: "Global (home directory)", value: "global" },
  ]) as Promise<"global" | "project">;
}

export async function selectTargetAgents(): Promise<AgentInfo[]> {
  const choices = KNOWN_AGENTS.map((a) => ({ name: a.label, value: a.id }));
  const ids = await promptMultiSelect(
    "请选择要安装的 AI 工具（可多选，至少选一项）：",
    choices,
    {
      validate: (ids: string[]) =>
        ids.length > 0 ? true : "请至少选择一个 AI 工具",
    }
  );
  return KNOWN_AGENTS.filter((a) => ids.includes(a.id));
}

const GITIGNORE_RULES = ["docs/superpowers/", ".worktrees/", "worktrees/"];

async function ensureGitignore(projectPath: string): Promise<void> {
  // ... 现有逻辑不变
}

export async function initCommand(opts: InitOptions): Promise<void> {
  console.log("\n  🔍 检测环境...");

  const env = detectEnv();
  console.log(`     Node.js ${env.nodeVersion} ✓`);
  console.log(`     git ${env.gitInstalled ? "✓" : "✗ 未安装"}`);
  console.log(`     Claude Code ${env.claudeCodeInstalled ? "✓" : "✗ 未安装"}`);

  if (!env.gitInstalled) {
    console.error("\n  ❌ 请先安装 git");
    process.exit(1);
  }

  // 安装 OpenSpec CLI
  console.log("\n  📥 OpenSpec CLI...");
  const openspecResult = await installOpenSpecCli();
  if (openspecResult === "failed") {
    console.error("     ✗ OpenSpec CLI 安装失败");
    process.exit(1);
  }

  // 初始化 OpenSpec 项目结构
  console.log("\n  📂 初始化 OpenSpec 项目结构...");
  const initResult = await initOpenSpecProject(opts.projectPath, opts.scope);
  if (initResult === "failed") {
    console.error("     ✗ OpenSpec 项目初始化失败");
    process.exit(1);
  }

  // 安装 Superpowers
  console.log("\n  📥 Superpowers...");
  const superpowersResult = await installSuperpowers(opts.scope);
  if (superpowersResult === "installed") {
    console.log("     ✓ obra/superpowers@5 已安装");
  } else if (superpowersResult === "skipped") {
    console.log("     ✓ Superpowers 已安装，跳过");
  } else {
    console.log("     ⚠ Superpowers 安装失败，请稍后手动运行 alloy init 重试");
  }

  // 部署 Alloy command 文件
  console.log("\n  🚀 部署 Alloy commands...");
  if (opts.targetAgents.length === 0) {
    console.log("     ⚠ 未选择任何 AI 工具，跳过 command 部署");
  } else {
    const paths = await deployCommands(opts);
    for (const p of paths) {
      console.log(`     ✓ ${p}`);
    }
  }

  // deploySchema
  const schemaPath = await deploySchema(opts);
  console.log(`     ✓ 项目 schema → ${schemaPath}`);

  // ensureGitignore
  await ensureGitignore(opts.projectPath);

  // injectClaudeMd
  const injected = await injectClaudeMd(opts);
  if (injected) {
    console.log("     ✓ CLAUDE.md → 已追加 Alloy 工作流提示");
  }

  // healthCheck
  console.log("\n  🩺 兼容性检查...");
  const packageDir = getPackageRoot();
  const results = await runHealthCheck(packageDir, opts.projectPath, opts.scope);
  for (const r of results) {
    const mark = r.status === "pass" ? "✓" : r.status === "warn" ? "⚠️" : "✗";
    console.log(`     ${mark} ${r.name} ${r.current}（要求 ${r.required}）`);
  }

  // 注册 shell 补全
  console.log("\n  🐚 注册 shell 补全...");
  try {
    // ... 现有逻辑不变
  } catch {
    // 静默
  }

  console.log("\n  ✅ Alloy 就绪！");
  console.log("     在 Claude Code 中输入 /alloy:start <topic> 开始工作\n");
}

export interface InitOptions extends DeployOptions {}
```

- [ ] **Step 2: 编译验证**

Run: `npx tsc --noEmit`
Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
git add src/cli/commands/init.ts
git commit -m "feat: init 支持 agent 多选 + deployCommands"
```

---

### Task 6: update.ts + health.ts + detect.ts

**Files:**
- Modify: `src/cli/commands/update.ts`
- Modify: `src/core/health.ts`
- Modify: `src/core/detect.ts`

- [ ] **Step 1: update.ts — 反向推导 + deployCommands**

`src/cli/commands/update.ts`:

删除 `deploySkills` 导入，替换为 `deployCommands`。`updateCommand` 中移除 scope 检测改为反向推导：

```typescript
import { deployCommands, deploySchema } from "../../core/skills.js";
import { detectDeployedAgents } from "../../core/agents.js";

const CLAUDE_MD_MARKER_START = "<!-- ALLOY-WORKFLOW:START -->";
const CLAUDE_MD_MARKER_END = "<!-- ALLOY-WORKFLOW:END -->";

function isDevMode(): boolean {
  // ... 现有逻辑不变
}

function detectScope(projectPath: string): "global" | "project" | null {
  const probes = [
    { path: join(projectPath, ".claude", "commands", "alloy"), scope: "project" as const },
    { path: join(process.env.HOME || "~", ".claude", "commands", "alloy"), scope: "global" as const },
  ];
  for (const { path, scope } of probes) {
    if (existsSync(path)) return scope;
  }
  return null;
}

export async function updateCommand(projectPath: string): Promise<string[]> {
  const results: string[] = [];
  const scope = detectScope(projectPath);
  if (!scope) {
    // 尝试反向推导
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    for (const agent of KNOWN_AGENTS) {
      // ... 从 detectDeployedAgents 推断 scope
    }
    results.push("⚠️ 未检测到已部署的 Alloy commands，请先运行 alloy init");
    return results;
  }

  // 推导已部署的 agent
  const deployedAgents = detectDeployedAgents(scope, projectPath);
  if (deployedAgents.length === 0) {
    results.push("⚠️ 未检测到已部署的 Alloy commands，请先运行 alloy init");
    return results;
  }

  const deployOpts: DeployOptions = {
    scope,
    injectClaudeMd: false,
    projectPath,
    targetAgents: deployedAgents,
  };

  // dev mode? skip version check
  const dev = isDevMode();
  if (dev) {
    console.log("  🔧 开发模式，从本地构建重新部署...");
  } else {
    // ... 现有版本检查逻辑不变
  }

  // 部署 commands
  try {
    const paths = await deployCommands(deployOpts);
    results.push(`✓ commands/ → 部署 ${paths.length} 个文件到 ${deployedAgents.length} 个 agent`);
  } catch {
    results.push("⚠️ command 部署失败");
  }

  // deploySchema 不变
  try {
    await deploySchema(deployOpts);
    results.push("✓ schema/ → 已部署");
  } catch {
    results.push("⚠️ schema 部署失败");
  }

  // CLAUDE.md 更新
  // ... 现有逻辑，引用改为双轨

  return results;
}

function getLatestClaudeMdFragment(): string {
  return [
    "",
    CLAUDE_MD_MARKER_START,
    "## Alloy 工作流",
    "",
    "本项目使用 [Alloy](https://github.com/user/alloy) 管理开发工作流。",
    "",
    "常用命令：",
    "- `/alloy:start [topic]` - 智能入口",
    "- `/alloy:plan [name]` - 制品规划",
    "- `/alloy:apply [name]` - 执行实现",
    "- `/alloy:archive [name]` - 归档与收尾",
    "- `/alloy:finish [name]` - 独立收尾",
    "- `/alloy:fix` - Bug 修复",
    "- `/alloy:status [name]` - 查看状态",
    "",
    CLAUDE_MD_MARKER_END,
    "",
  ].join("\n");
}
```

- [ ] **Step 2: health.ts — 检查 commands 而非 skills**

`src/core/health.ts`:

将 `EXPECTED_SKILLS` 替换为 `EXPECTED_COMMANDS`，`checkSkillsIntegrity()` 改为检查 `.claude/commands/alloy/*.md` 文件：

```typescript
const EXPECTED_COMMAND_IDS = [
  "start", "plan", "apply", "archive",
  "finish", "fix", "discard", "status",
];

function checkCommandsIntegrity(commandsDir: string): HealthCheckResult {
  const alloyDir = join(commandsDir, "alloy");
  const missing: string[] = [];
  for (const id of EXPECTED_COMMAND_IDS) {
    if (!existsSync(join(alloyDir, `${id}.md`))) {
      missing.push(id);
    }
  }
  const found = EXPECTED_COMMAND_IDS.length - missing.length;
  if (missing.length === 0) {
    return {
      name: "Commands",
      current: `${found}/${EXPECTED_COMMAND_IDS.length} 完整`,
      required: `${EXPECTED_COMMAND_IDS.length} 个文件`,
      status: "pass",
    };
  }
  return {
    name: "Commands",
    current: `${found}/${EXPECTED_COMMAND_IDS.length}（缺失: ${missing.join(", ")}）`,
    required: `${EXPECTED_COMMAND_IDS.length} 个文件`,
    status: "fail",
    message: `缺失: ${missing.join(", ")}`,
  };
}
```

`runHealthCheck` 中 "Skills" 替换为 "Commands"，调用 `checkCommandsIntegrity`，检查 `.claude/commands/` 目录。

- [ ] **Step 3: detect.ts — 移除 Claude Code 依赖**

`src/core/detect.ts`:

不再检查 Claude Code（已由 agent 多选替代），保留 git + Node：

```typescript
export function detectEnv(): EnvInfo {
  const nodeVersion = process.version.slice(1);
  let gitInstalled = false;
  try { execSync("git --version", { stdio: "pipe" }); gitInstalled = true; } catch {}
  return { nodeVersion, gitInstalled };
}
```

EnvInfo 类型移除 `claudeCodeInstalled` 字段。

- [ ] **Step 4: 编译 + 测试**

Run: `npx tsc --noEmit && npm test`
Expected: 无类型错误，现有测试需更新以适配新类型。

- [ ] **Step 5: 提交**

```bash
git add src/cli/commands/update.ts src/core/health.ts src/core/detect.ts src/core/types.ts
git commit -m "feat: update 反向推导 agent + health 检查 commands + detect 移除 CC 依赖"
```

---

### Task 7: 更新设计文档

**Files:**
- Modify: `docs/alloy-design.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新 docs/alloy-design.md 中命令名**

将所有 `/alloy-start` 替换为 `/alloy:start`，`/alloy-plan` → `/alloy:plan` 等。去掉 `skills/` 部署相关描述，改为 `commands/` 部署。

- [ ] **Step 2: 更新 CLAUDE.md 中的命令引用**

`/alloy-start` → `/alloy:start` 等。去掉 "skills/" 目录描述。

- [ ] **Step 3: 提交**

```bash
git add docs/alloy-design.md CLAUDE.md
git commit -m "docs: 命令名冒号更新 + commands-only 架构"
```

---

### Task 8: 测试更新

**Files:**
- Modify: `test/core/health.test.ts`
- Create: `test/core/agents.test.ts` (可选)

- [ ] **Step 1: 更新 health.test.ts**

将 "Skills" 相关测试改为 "Commands"——检查 `.claude/commands/alloy/*.md` 文件完整性。Environment 检查移除 `claudeCodeInstalled`。

- [ ] **Step 2: 运行全量测试**

Run: `npm test && bats test/shell/*.bats`
Expected: 全部 PASS。

- [ ] **Step 3: 端到端验证**

Run: `npm run build && npm link`

然后在新目录中运行 `alloy init`，验证 agent 多选交互和 command 部署。

- [ ] **Step 4: 提交**

```bash
git add test/
git commit -m "test: 更新 health 测试适配 commands 检查 + 移除 CC 依赖"
```

---

### Task 9: 更新 compat.yaml + package.json

**Files:**
- Modify: `compat.yaml`
- Modify: `package.json` (files 字段)

- [ ] **Step 1: 更新 package.json files 字段**

在 `package.json` 中添加 `commands/` 到 npm 发布文件列表。

- [ ] **Step 2: 编译 + 全量测试**

Run: `npm run build && npm test && bats test/shell/*.bats`
Expected: 全部 PASS。

- [ ] **Step 3: 最终提交**

```bash
git add compat.yaml package.json
git commit -m "chore: 更新 package.json files + compat.yaml"
```
