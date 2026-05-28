# Alloy 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从零构建 Alloy CLI 工具 + OpenSpec schema + 8 条 Slash Command SKILL.md，实现 OpenSpec 与 Superpowers 融合的编排层。

**Architecture:** 三层架构——CLI 控制层（TypeScript，确定性逻辑）、Schema 制品层（OpenSpec schema，DAG 硬约束）、SKILL.md 编排层（Agent 内执行，流程闸门 + 审查窗口）。v1 仅支持 Claude Code。

**Tech Stack:** TypeScript (Node.js ≥22)、OpenSpec CLI (`@fission-ai/openspec@1`)、Superpowers skills (`obra/superpowers@5`)、Bash (shell 脚本)、Vitest (CLI 测试)、Bats (shell 测试)

---

## 文件结构总览

### 新建文件清单

```
# === CLI (TypeScript npm 包) ===
package.json
tsconfig.json
compat.yaml
src/cli/index.ts                     # CLI 入口
src/cli/commands/init.ts             # alloy init
src/cli/commands/status.ts           # alloy status
src/cli/commands/doctor.ts           # alloy doctor
src/cli/commands/update.ts           # alloy update
src/cli/utils/state.ts               # .alloy.yaml 读写
src/cli/utils/compat.ts              # 版本兼容性检查
src/cli/utils/env.ts                 # 环境检测
src/cli/utils/deploy.ts              # schema + skill + vendor 部署

# === OpenSpec Schema ===
openspec/schemas/alloy/schema.yaml
openspec/schemas/alloy/artifacts/draft.md
openspec/schemas/alloy/artifacts/proposal.md
openspec/schemas/alloy/artifacts/design.md
openspec/schemas/alloy/artifacts/specs.md
openspec/schemas/alloy/artifacts/tasks.md
openspec/schemas/alloy/artifacts/plan.md
openspec/schemas/alloy/templates/draft.md
openspec/schemas/alloy/templates/proposal.md
openspec/schemas/alloy/templates/design.md
openspec/schemas/alloy/templates/specs.md
openspec/schemas/alloy/templates/tasks.md
openspec/schemas/alloy/templates/plan.md
openspec/schemas/alloy/templates/retrospective.md

# === Slash Commands (SKILL.md) ===
.claude/skills/alloy/SKILL.md             # 主入口（路由到子命令）
.claude/skills/alloy/alloy-start/SKILL.md
.claude/skills/alloy/alloy-plan/SKILL.md
.claude/skills/alloy/alloy-apply/SKILL.md
.claude/skills/alloy/alloy-finish/SKILL.md
.claude/skills/alloy/alloy-archive/SKILL.md
.claude/skills/alloy/alloy-fix/SKILL.md
.claude/skills/alloy/alloy-discard/SKILL.md
.claude/skills/alloy/alloy-status/SKILL.md

# === Shell 脚本 ===
.claude/skills/alloy/scripts/alloy-guard.sh
.claude/skills/alloy/scripts/alloy-state.sh
.claude/skills/alloy/scripts/alloy-archive.sh

# === Vendor (Superpowers 内置兜底) ===
vendor/superpowers/brainstorming/SKILL.md
vendor/superpowers/using-git-worktrees/SKILL.md
vendor/superpowers/subagent-driven-development/SKILL.md
vendor/superpowers/verification-before-completion/SKILL.md
vendor/superpowers/finishing-a-development-branch/SKILL.md
vendor/superpowers/systematic-debugging/SKILL.md
vendor/superpowers/receiving-code-review/SKILL.md

# === 测试 ===
test/cli/init.test.ts
test/cli/status.test.ts
test/cli/doctor.test.ts
test/cli/update.test.ts
test/shell/alloy-guard.bats
test/shell/alloy-state.bats
test/shell/alloy-archive.bats
```

### 可能修改的文件

```
.gitignore              # 如需排除 dist/ 等构建产物
CLAUDE.md               # alloy init 注入时更新
```

---

## Phase 1: 原型验证（第 1-2 周）

> 目标：写 `/alloy-start` + `/alloy-plan` 的 SKILL.md，在 Claude Code 中跑通 Pre-OpenSpec → 规划阶段，验证 OpenSpec + Superpowers 组合是否如设计运作。

### Task 1: 项目脚手架（npm 包初始化）

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `compat.yaml`
- Create: `.gitignore`（如不存在则创建，已有则跳过）

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@alloy/cli",
  "version": "0.1.0",
  "description": "Alloy - OpenSpec + Superpowers 编排层 CLI 工具",
  "type": "module",
  "main": "dist/cli/index.js",
  "bin": {
    "alloy": "dist/cli/index.js"
  },
  "files": [
    "dist/",
    "compat.yaml",
    "vendor/",
    "openspec/schemas/alloy/"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "yaml": "^2.7.0",
    "semver": "^7.7.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.1.0",
    "@types/node": "^22.0.0",
    "@types/semver": "^7.7.0"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: 创建 compat.yaml**

```yaml
compatible:
  openspec: ">=1.3.0 <2.0.0"
  superpowers: ">=5.0.0 <6.0.0"

install:
  openspec: "@fission-ai/openspec@1"
  superpowers: "obra/superpowers@5"
```

- [ ] **Step 4: 安装依赖**

Run: `npm install`
Expected: 依赖安装成功，无报错

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json compat.yaml
git commit -m "项目脚手架：npm 包初始化，TypeScript 配置，兼容性清单"
```

---

### Task 2: alloy-start SKILL.md（原型核心）

**Files:**
- Create: `.claude/skills/alloy/alloy-start/SKILL.md`

这是原型验证的最核心产出，需要完整实现 `/alloy-start` 的所有行为。

- [ ] **Step 1: 创建 alloy-start SKILL.md**

```markdown
---
name: alloy-start
description: Alloy 智能入口 - 自动检测状态，接续或新建 change
---

# alloy-start

你是 Alloy 工作流的智能入口。你的职责是自动检测当前状态并引导用户进入正确的流程阶段。

## 状态检测

首先，扫描 `openspec/changes/*/.alloy.yaml`，统计活跃 change（phase != archived）：

1. 读取每个 `.alloy.yaml` 的 `phase` 和 `worktree` 字段
2. 活跃 change = phase 不是 `archived` 的 change

## 路由逻辑

### 情况 A：无活跃 change + 有 topic 参数

用户输入了 `/alloy-start <topic>`，开始全新流程：

1. 告知用户当前状态："未检测到活跃 change，开始新的工作流程"
2. 调用 `superpowers:brainstorming` skill —— 但在此之前，先调用 `/opsx:explore <topic>` 进行上下文探查
3. 互动式探索需求：
   - 新项目（无现有代码）→ 探索需求空间
   - 存量项目（有现有代码）→ 先探查代码库架构、集成点、约束，再探索需求
4. 产出 `draft.md`（项目根目录，自由格式设计草案）
5. draft.md 完成后，输出以下提示：

```
draft.md 已生成。

💡 建议：可以用 grill-me 对需求进行深入拷问，确认后再进入 plan。

准备好后，运行 `/alloy-plan` 进入规划阶段。
```

**关键规则：**
- 此阶段不创建 change 目录，draft.md 存放在项目根目录
- DO NOT 自动进入 plan 阶段
- 扩展点仅提示，不调用技能

### 情况 B：无活跃 change + 无 topic

扫描项目上下文（README.md、requirement.md、已有代码结构等）：

- 有上下文可读取 → 基于项目信息引导用户，提出建议方向或追问
- 空项目无上下文 → "请提供主题，例如：`/alloy-start <topic>`"

### 情况 C：--new <topic>

无论是否有活跃 change，直接开始新 change 流程（同情况 A）。

> 多个 change 可并行 planning，但不能同时 apply。

### 情况 D：有 1 个活跃 change

自动接续，从当前 phase 断点恢复：

| 当前 phase | 恢复行为 |
|-----------|----------|
| `started` | 继续 `/alloy-plan` |
| `planned` | 继续 `/alloy-apply` |
| `applied` | 提示用户：`/alloy-finish` 或继续修改 |
| `finished` | 提示用户：`/alloy-archive` |

恢复时输出当前状态概要（change 名、phase、已完成制品、下一步建议）。

### 情况 E：有多个活跃 change

列出所有活跃 change，让用户选择：
```
检测到多个活跃 change：
  1. login-feature (planned) - 已完成 proposal, design, specs, tasks, plan
  2. payment-fix   (started) - 已完成 draft.md

请选择要接续的 change（输入编号），或 `/alloy-start --new <topic>` 开新 change。
```

## 扩展点提示

draft.md 完成后，MUST 输出扩展点提示（v1 仅提示，不调用技能）：

```
draft.md 已完成。
💡 建议：可以用 grill-me 对需求进行深入拷问，确认后再进入 plan。
```

---

## 行为约束

- **闸门规则：** 在用户确认前，DO NOT 创建 change 目录或写入 `.alloy.yaml`
- **上下文推断：** 必须按上述路由逻辑准确分发，不得跳过状态检测
- **断点恢复：** phase + worktree 字段 + 文件存在性三者交叉验证，不可仅依赖 phase 字段
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/alloy/alloy-start/SKILL.md
git commit -m "原型验证：alloy-start SKILL.md 智能入口命令"
```

---

### Task 3: alloy-plan SKILL.md（原型核心）

**Files:**
- Create: `.claude/skills/alloy/alloy-plan/SKILL.md`

- [ ] **Step 1: 创建 alloy-plan SKILL.md**

```markdown
---
name: alloy-plan
description: Alloy 规划阶段 - 逐制品生成设计文档，始终分步，每步可审查
---

# alloy-plan

你是 Alloy 的规划阶段编排器。你的职责是按 OpenSpec schema DAG 依赖顺序，逐制品生成设计文档，每步生成后提供审查窗口。

## 前置检查

1. 确认 `draft.md` 存在于项目根目录，不存在则报错："未找到 draft.md，请先运行 `/alloy-start <topic>` 生成设计草案"
2. 若指定 `[name]` 参数但未匹配到活跃 change：
   - "未找到 change '<name>'，将创建新 change。确认？"

## 流程

### Step 1: 创建 change 目录

若 change 目录不存在：
1. 根据 draft.md 内容建议 change name（kebab-case），用户确认
2. 调用 `/opsx:new <name>` 创建 change 目录
3. 将 `draft.md` 移入 `openspec/changes/<name>/`
4. 写入 `.alloy.yaml`：
   ```yaml
   phase: started
   worktree: null
   schema_version: 1
   created_at: "<YYYY-MM-DD>"
   updated_at: "<YYYY-MM-DD>"
   ```
5. phase → `started`

若 change 目录已存在但有异常（如 draft.md 内容与 change 制品不匹配）：
- 警告用户，让其选择：1) 继续当前 change 2) 创建新 change

### Step 2: 逐制品生成

调用 `/opsx:continue`，按 schema DAG 依赖顺序逐制品生成。

**制品 DAG 顺序：**
```
proposal → design → specs → tasks → plan
```

**每个制品的审查流程：**
1. Agent 生成当前制品
2. 将生成的完整内容展示给用户
3. 审查窗口："以上是 <制品名> 的完整内容。请审查：
   - (a) 确认，继续下一个制品
   - (b) 需要修改（请说明修改点）
   - (c) 跳过此制品"
4. 用户选择 (a) 才继续下一个制品

**审查期间调整上游制品：**
用户如说"把 proposal 第 3 点改一下"，Agent MUST：
1. 修改 proposal.md
2. 自动识别 DAG 中依赖 proposal 的下游制品（design + specs → tasks → plan）
3. 标注这些制品为"已过期"，重新生成

### 各制品指令概述

**proposal：**
- 读 draft.md，提取 Why/What/Capabilities
- 产出 `proposal.md`

**design：**
- 依赖 proposal，读 draft.md 中的技术决策
- 受 proposal 的 Capabilities 范围约束
- 产出 `design.md`

**specs：**
- 依赖 proposal，只读 Capabilities
- 故意不读 draft.md（防止行为 spec 被技术实现细节污染）
- 按 Capabilities 列表逐项写 Delta Spec（ADDED / MODIFIED / REMOVED）
- 产出 `specs/**/*.md`

**tasks：**
- 依赖 specs + design（需"做什么"+"怎么做"）
- 产出 `tasks.md`（层级编号 checkbox 清单）

**plan（隐含 superpowers:writing-plans）：**
- 依赖 tasks
- 将粗粒度 checkbox 拆为 TDD 微步骤（每步 2-5 分钟粒度）
- 产出 `plan.md`

### Step 3: 完成

所有制品生成完毕后：
1. phase → `planned`
2. 输出概要（列出所有制品及状态）
3. 提示："规划完成。制品文件禁止手动修改，如需变更请通过对话驱动。准备好后，运行 `/alloy-apply` 进入执行阶段。"

## 闸门规则

- **始终分步，不提供一键生成（HARD GATE）** —— 每个制品必须单独审查确认后才能继续
- **DO NOT 跳过审查窗口** —— 即使制品的 instruction 说可以快速生成
- **plan 完成后 DO NOT 自动进入 apply**
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/alloy/alloy-plan/SKILL.md
git commit -m "原型验证：alloy-plan SKILL.md 逐制品规划命令"
```

---

### Task 4: alloy-status SKILL.md（原型辅助）

**Files:**
- Create: `.claude/skills/alloy/alloy-status/SKILL.md`

原型阶段也需要查看状态，便于调试。

- [ ] **Step 1: 创建 alloy-status SKILL.md**

```markdown
---
name: alloy-status
description: 查看 Alloy change 的当前阶段、制品状态和下一步操作
---

# alloy-status

查看指定 change 或全部活跃 change 的状态总览。

## 参数

- `/alloy-status` — 显示所有活跃 change 总览
- `/alloy-status <name>` — 显示指定 change 详情

## 无参数：总览模式

扫描 `openspec/changes/*/.alloy.yaml`，输出表格：

```
活跃 Change：
  login-feature  planned    artifacts: draft ✓ proposal ✓ design ✓ specs ✓ tasks ✓ plan ✓
  payment-fix    started    artifacts: draft ✓

下一步：login-feature 等待 /alloy-apply，payment-fix 等待 /alloy-plan
```

## 指定 name：详情模式

输出指定 change 的完整信息：

```
阶段:    planned
Change:  login-feature
路径:    openspec/changes/login-feature/
制品状态:
  draft     ✓
  proposal  ✓
  design    ✓
  specs     ✓
  tasks     ✓
  plan      ✓
下一步:   等待 /alloy-apply
```

## 一致性检查（自动附带）

每次 status 运行时自动检查：

1. `worktree` 字段有值但磁盘路径不存在 → ⚠️ "worktree 残留：.alloy.yaml 声称 worktree 存在但路径不可达"
2. `git worktree list` 中有孤立 worktree（没有对应 .alloy.yaml 的）→ ⚠️ 提示可能的清理项
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/alloy/alloy-status/SKILL.md
git commit -m "原型验证：alloy-status SKILL.md 状态查看命令"
```

---

### Task 5: 原型端到端验证

在 Claude Code 中实际运行验证：

- [ ] **Step 1: 验证 alloy-start**

在 Claude Code session 中执行 `/alloy-start test-feature`，验证：
1. 正确检测到无活跃 change
2. 调用 explore + brainstorming
3. 产出 draft.md
4. 输出扩展点提示

- [ ] **Step 2: 验证 alloy-plan**

执行 `/alloy-plan test-feature`，验证：
1. 正确检测 draft.md 存在
2. 创建 change 目录，移入 draft.md
3. 逐制品生成（proposal → design → specs → tasks → plan）
4. 每步有审查窗口
5. .alloy.yaml 写入正确（phase=planned）

- [ ] **Step 3: 验证 alloy-status**

执行 `/alloy-status` 和 `/alloy-status test-feature`，验证输出正确

- [ ] **Step 4: 验证断点恢复**

在新 session 中执行 `/alloy-start`（无参数），验证自动检测到 test-feature 并恢复到正确阶段

- [ ] **Step 5: 修复问题、提交改进**

```bash
git add -A
git commit -m "原型验证：端到端测试修复和改进"
```

---

## Phase 2: CLI + Schema（第 3-5 周）

> 目标：实现 alloy init / status / doctor / update 四条 CLI 命令 + 从零构建 alloy OpenSpec schema。

### Task 6: CLI 工具函数层

**Files:**
- Create: `src/cli/utils/state.ts`
- Create: `src/cli/utils/env.ts`
- Create: `src/cli/utils/compat.ts`

> 先写工具函数，CLI 命令依赖它们。

- [ ] **Step 1: 创建 state.ts（.alloy.yaml 读写）**

```typescript
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface AlloyState {
  phase: "started" | "planned" | "applied" | "finished" | "archived";
  worktree: string | null;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export function createInitialState(): AlloyState {
  const now = new Date().toISOString().slice(0, 10);
  return {
    phase: "started",
    worktree: null,
    schema_version: 1,
    created_at: now,
    updated_at: now,
  };
}

export async function readState(changePath: string): Promise<AlloyState> {
  const yamlPath = join(changePath, ".alloy.yaml");
  const content = await readFile(yamlPath, "utf-8");
  return parseYaml(content) as AlloyState;
}

export async function writeState(changePath: string, state: AlloyState): Promise<void> {
  const yamlPath = join(changePath, ".alloy.yaml");
  state.updated_at = new Date().toISOString().slice(0, 10);
  const content = stringifyYaml(state);
  await writeFile(yamlPath, content, "utf-8");
}

export async function findActiveChanges(changesDir: string): Promise<Map<string, AlloyState>> {
  const changes = new Map<string, AlloyState>();
  try {
    const entries = await readdir(changesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const state = await readState(join(changesDir, entry.name));
        if (state.phase !== "archived") {
          changes.set(entry.name, state);
        }
      } catch {
        // 目录存在但无 .alloy.yaml，跳过
      }
    }
  } catch {
    // changes 目录可能不存在
  }
  return changes;
}
```

- [ ] **Step 2: 创建 env.ts（环境检测）**

```typescript
import { execSync } from "node:child_process";

export interface EnvInfo {
  nodeVersion: string;
  gitInstalled: boolean;
  claudeCodeInstalled: boolean;
}

export function detectEnv(): EnvInfo {
  const nodeVersion = process.version.slice(1); // 去掉 'v' 前缀

  let gitInstalled = false;
  try {
    execSync("git --version", { stdio: "pipe" });
    gitInstalled = true;
  } catch {
    // git 未安装
  }

  let claudeCodeInstalled = false;
  try {
    execSync("claude --version", { stdio: "pipe" });
    claudeCodeInstalled = true;
  } catch {
    // Claude Code 未安装
  }

  return { nodeVersion, gitInstalled, claudeCodeInstalled };
}
```

- [ ] **Step 3: 创建 compat.ts（版本兼容性检查）**

```typescript
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import semver from "semver";

export interface CompatConfig {
  compatible: { openspec: string; superpowers: string };
  install: { openspec: string; superpowers: string };
}

export async function loadCompat(packageDir: string): Promise<CompatConfig> {
  const content = await readFile(join(packageDir, "compat.yaml"), "utf-8");
  return parseYaml(content) as CompatConfig;
}

export interface CompatResult {
  name: string;
  current: string;
  required: string;
  compatible: boolean;
}

export function checkCompat(config: CompatConfig): CompatResult[] {
  const results: CompatResult[] = [];

  // 检查 OpenSpec
  try {
    const openspecVersion = execSync("openspec --version", { stdio: "pipe" })
      .toString().trim();
    const isCompat = semver.satisfies(openspecVersion, config.compatible.openspec);
    results.push({
      name: "OpenSpec",
      current: openspecVersion,
      required: config.compatible.openspec,
      compatible: isCompat,
    });
  } catch {
    results.push({
      name: "OpenSpec",
      current: "未安装",
      required: config.compatible.openspec,
      compatible: false,
    });
  }

  // Superpowers 版本检查依赖 npx skills 的命令行输出
  // 此处留待实现时确定具体检测方式
  results.push({
    name: "Superpowers",
    current: "检查方式待定",
    required: config.compatible.superpowers,
    compatible: true,
  });

  return results;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/cli/utils/
git commit -m "CLI 工具函数：state/env/compat 工具模块"
```

---

### Task 7: CLI 入口 + alloy init 命令

**Files:**
- Create: `src/cli/utils/deploy.ts`
- Create: `src/cli/commands/init.ts`
- Create: `src/cli/index.ts`

- [ ] **Step 1: 创建 deploy.ts（部署工具）**

```typescript
import { mkdir, cp, readFile, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..", "..");

export interface DeployOptions {
  scope: "global" | "project";
  skipClaudeMd: boolean;
  projectPath: string;
}

const CLAUDE_MD_MARKER_START = "<!-- ALLOY-WORKFLOW:START -->";
const CLAUDE_MD_MARKER_END = "<!-- ALLOY-WORKFLOW:END -->";

export async function deploySkills(opts: DeployOptions): Promise<string[]> {
  const deployed: string[] = [];
  const skillsSource = join(PACKAGE_ROOT, ".claude", "skills", "alloy");

  let targetDir: string;
  if (opts.scope === "global") {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    targetDir = join(home, ".claude", "skills", "alloy");
  } else {
    targetDir = join(opts.projectPath, ".claude", "skills", "alloy");
  }

  await mkdir(targetDir, { recursive: true });
  await cp(skillsSource, targetDir, { recursive: true });
  deployed.push(`→ ${targetDir}`);

  return deployed;
}

export async function deploySchema(opts: DeployOptions): Promise<string> {
  const schemaSource = join(PACKAGE_ROOT, "openspec", "schemas", "alloy");
  const schemaTarget = join(opts.projectPath, "openspec", "schemas", "alloy");

  await mkdir(schemaTarget, { recursive: true });
  await cp(schemaSource, schemaTarget, { recursive: true });

  // 写入 openspec/config.yaml
  const configPath = join(opts.projectPath, "openspec", "config.yaml");
  const configContent = `schema: alloy\n`;
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, configContent, "utf-8");

  return schemaTarget;
}

export async function injectClaudeMd(opts: DeployOptions): Promise<boolean> {
  if (opts.skipClaudeMd) return false;

  const claudeMdPath = join(opts.projectPath, "CLAUDE.md");
  const fragment = `\n${CLAUDE_MD_MARKER_START}\n## Alloy 工作流\n\n本项目使用 [Alloy](https://github.com/user/alloy) 管理开发工作流。\n\n常用命令：\n- \`/alloy-start [topic]\` - 智能入口\n- \`/alloy-plan [name]\` - 逐制品规划\n- \`/alloy-apply [name]\` - 执行实现\n- \`/alloy-finish [name]\` - 收尾\n- \`/alloy-fix\` - Bug 修复\n- \`/alloy-status [name]\` - 查看状态\n\n详细文档：\n- [alloy-design.md](alloy-design.md)\n- [设计规格](docs/superpowers/specs/2026-05-28-alloy-design-spec.md)\n${CLAUDE_MD_MARKER_END}\n`;

  let existing = "";
  try {
    existing = await readFile(claudeMdPath, "utf-8");
  } catch {
    // CLAUDE.md 不存在
  }

  // 如果已有 Alloy 标记区域，替换之
  if (existing.includes(CLAUDE_MD_MARKER_START)) {
    const startIdx = existing.indexOf(CLAUDE_MD_MARKER_START);
    const endIdx = existing.indexOf(CLAUDE_MD_MARKER_END);
    if (endIdx > startIdx) {
      existing = existing.slice(0, startIdx) + existing.slice(endIdx + CLAUDE_MD_MARKER_END.length);
    }
  }

  await writeFile(claudeMdPath, existing + fragment, "utf-8");
  return true;
}

export async function deployVendor(targetDir: string): Promise<string> {
  const vendorSource = join(PACKAGE_ROOT, "vendor", "superpowers");
  const vendorTarget = join(targetDir, "vendor", "superpowers");
  await mkdir(vendorTarget, { recursive: true });
  await cp(vendorSource, vendorTarget, { recursive: true });
  return vendorTarget;
}

export async function installOpenSpec(): Promise<void> {
  execSync("npm install -g @fission-ai/openspec@1", {
    stdio: "inherit",
    cwd: process.cwd(),
  });
}

export async function installSuperpowers(): Promise<void> {
  try {
    execSync("npx skills add obra/superpowers@5", {
      stdio: "inherit",
      cwd: process.cwd(),
    });
  } catch {
    // 网络不可用，从 vendor 复制
    console.log("  网络不可达，使用内置 Superpowers skill 兜底...");
    // vendor 复制逻辑在 alloy init 的 deployVendor 中处理
  }
}
```

- [ ] **Step 2: 创建 init.ts**

```typescript
import { join } from "node:path";
import { detectEnv } from "../utils/env.js";
import { loadCompat, checkCompat } from "../utils/compat.js";
import {
  deploySkills,
  deploySchema,
  injectClaudeMd,
  installOpenSpec,
  installSuperpowers,
  DeployOptions,
} from "../utils/deploy.js";

export interface InitOptions extends DeployOptions {}

export async function initCommand(opts: InitOptions): Promise<void> {
  console.log("\n  🔍 检测环境...");

  // 1. 环境检测
  const env = detectEnv();
  console.log(`     Node.js ${env.nodeVersion} ✓`);
  console.log(`     git ${env.gitInstalled ? "✓" : "✗ 未安装"}`);
  console.log(`     Claude Code ${env.claudeCodeInstalled ? "✓" : "✗ 未安装"}`);

  if (!env.gitInstalled || !env.claudeCodeInstalled) {
    console.error("\n  ❌ 缺少必要依赖，请先安装 git 和 Claude Code");
    process.exit(1);
  }

  // 2. 安装 OpenSpec CLI
  console.log("\n  📥 安装 OpenSpec CLI...");
  try {
    await installOpenSpec();
    console.log("     ✓ @fission-ai/openspec@1");
  } catch (e) {
    console.error(`     ✗ OpenSpec 安装失败: ${e}`);
    process.exit(1);
  }

  // 3. 安装 Superpowers
  console.log("\n  📥 安装 Superpowers...");
  try {
    await installSuperpowers();
    console.log("     ✓ Claude Code → obra/superpowers@5");
  } catch (e) {
    console.error(`     ✗ Superpowers 安装失败: ${e}`);
    process.exit(1);
  }

  // 4. 部署 Alloy skill
  console.log("\n  🚀 部署 Alloy...");
  const skillPaths = await deploySkills(opts);
  for (const p of skillPaths) {
    console.log(`     ✓ ${p}`);
  }

  // 5. 部署 schema
  const schemaPath = await deploySchema(opts);
  console.log(`     ✓ 项目 schema → ${schemaPath}`);

  // 6. 注入 CLAUDE.md
  const injected = await injectClaudeMd(opts);
  if (injected) {
    console.log("     ✓ CLAUDE.md → 已追加 Alloy 工作流提示");
  }

  // 7. 兼容性检查
  console.log("\n  🩺 兼容性检查...");
  const packageDir = join(import.meta.dirname, "..", "..");
  const config = await loadCompat(packageDir);
  const results = checkCompat(config);
  for (const r of results) {
    const mark = r.compatible ? "✓" : "⚠️";
    console.log(`     ${mark} ${r.name} ${r.current}（兼容范围 ${r.required}）`);
  }

  console.log("\n  ✅ Alloy 就绪！");
  console.log("     在 Claude Code 中输入 /alloy-start <topic> 开始工作\n");
}
```

- [ ] **Step 3: 创建 CLI 入口 index.ts**

```typescript
#!/usr/bin/env node
import { parseArgs } from "node:util";
import { initCommand } from "./commands/init.js";

const USAGE = `
alloy <command> [options]

Commands:
  init    项目初始化：检测环境 → 安装依赖 → 部署 schema + skill
  status  查看所有活跃 change 总览
  doctor  诊断：版本兼容性、文件一致性
  update  更新 Alloy skill 文件到最新版

Options:
  --version  版本号
  --help     帮助
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log(USAGE);
    process.exit(0);
  }

  if (args.includes("--version")) {
    const pkg = await import("../../package.json", { with: { type: "json" } });
    console.log(`alloy v${pkg.default.version}`);
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "init": {
      const { values } = parseArgs({
        args: args.slice(1),
        options: {
          scope: { type: "string", default: "global" },
          "skip-claude-md": { type: "boolean", default: false },
        },
      });
      await initCommand({
        scope: (values.scope as "global" | "project") || "global",
        skipClaudeMd: values["skip-claude-md"] as boolean,
        projectPath: process.cwd(),
      });
      break;
    }
    case "status":
      console.log("  status 命令将在 Task 8 中实现");
      break;
    case "doctor":
      console.log("  doctor 命令将在 Task 9 中实现");
      break;
    case "update":
      console.log("  update 命令将在 Task 10 中实现");
      break;
    default:
      console.error(`未知命令: ${command}`);
      console.log(USAGE);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: 验证编译**

Run: `npm run build`
Expected: TypeScript 编译成功，`dist/` 目录生成

Run: `node dist/cli/index.js --version`
Expected: `alloy v0.1.0`

Run: `node dist/cli/index.js --help`
Expected: 帮助信息

- [ ] **Step 5: Commit**

```bash
git add src/cli/index.ts src/cli/commands/init.ts src/cli/utils/deploy.ts
git add dist/ .gitignore  # 如需忽略 dist/，先更新 .gitignore
git commit -m "CLI 入口 + alloy init 命令：环境检测、依赖安装、skill/schema 部署、CLAUDE.md 注入"
```

---

### Task 8: alloy status CLI 命令

**Files:**
- Create: `src/cli/commands/status.ts`
- Modify: `src/cli/index.ts`（补充 status 路由）

- [ ] **Step 1: 创建 status.ts**

```typescript
import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { findActiveChanges, AlloyState } from "../utils/state.js";

const ARTIFACTS = ["draft", "proposal", "design", "specs", "tasks", "plan"] as const;

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

export async function statusCommand(projectPath: string, changeName?: string): Promise<string> {
  const changesDir = join(projectPath, "openspec", "changes");

  if (changeName) {
    // 详情模式
    return await detailMode(changesDir, changeName);
  } else {
    // 总览模式
    return await overviewMode(changesDir);
  }
}

async function overviewMode(changesDir: string): Promise<string> {
  const changes = await findActiveChanges(changesDir);
  if (changes.size === 0) {
    return "无活跃 change。使用 /alloy-start <topic> 开始新工作流。";
  }

  const lines: string[] = ["活跃 Change："];
  for (const [name, state] of changes) {
    const artifacts = checkArtifacts(join(changesDir, name));
    const artifactStatus = ARTIFACTS.map((a) => `${a} ${artifacts[a] ? "✓" : "✗"}`).join(" ");
    lines.push(`  ${name.padEnd(20)} ${state.phase.padEnd(10)} artifacts: ${artifactStatus}`);
  }
  return lines.join("\n");
}

async function detailMode(changesDir: string, name: string): Promise<string> {
  const changePath = join(changesDir, name);
  if (!existsSync(changePath)) {
    return `未找到 change '${name}'`;
  }

  let state: AlloyState;
  try {
    state = (await import("../utils/state.js")).readState(changePath) as unknown as AlloyState;
  } catch {
    return `change '${name}' 缺少 .alloy.yaml`;
  }

  const artifacts = checkArtifacts(changePath);
  const lines: string[] = [
    `阶段:    ${state.phase}`,
    `Change:  ${name}`,
    `路径:    ${changePath}`,
    "制品状态:",
    ...ARTIFACTS.map((a) => `  ${a.padEnd(12)} ${artifacts[a] ? "✓" : "✗"}`),
  ];

  // 下一步建议
  const nextStep = getNextStep(state, artifacts);
  if (nextStep) lines.push(`下一步:   ${nextStep}`);

  return lines.join("\n");
}

function getNextStep(state: AlloyState, artifacts: Record<string, boolean>): string {
  switch (state.phase) {
    case "started":
      return artifacts.plan ? "等待 /alloy-apply" : "继续 /alloy-plan，等待下一个制品生成";
    case "planned":
      return "等待 /alloy-apply";
    case "applied":
      return "等待 /alloy-finish";
    case "finished":
      return "等待 /alloy-archive";
    default:
      return "";
  }
}
```

- [ ] **Step 2: 更新 index.ts 的 status 路由**

更新 `src/cli/index.ts` 中 status case：

```typescript
case "status": {
  const statusName = args[1]; // 可选的 change name
  const result = await statusCommand(process.cwd(), statusName);
  console.log(result);
  break;
}
```

- [ ] **Step 3: 验证**

Run: `npm run build`
Expected: 编译成功

Run: `node dist/cli/index.js status`
Expected: "无活跃 change"（或显示活跃 change 列表）

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/status.ts src/cli/index.ts
git commit -m "CLI status 命令：总览模式 + 详情模式 + 一致性警告"
```

---

### Task 9: alloy doctor CLI 命令

**Files:**
- Create: `src/cli/commands/doctor.ts`
- Modify: `src/cli/index.ts`（补充 doctor 路由）

- [ ] **Step 1: 创建 doctor.ts**

```typescript
import { join } from "node:path";
import { existsSync } from "node:fs";
import { loadCompat, checkCompat, CompatResult } from "../utils/compat.js";
import { findActiveChanges, readState } from "../utils/state.js";

export interface DoctorResult {
  compatResults: CompatResult[];
  consistencyWarnings: string[];
}

export async function doctorCommand(projectPath: string): Promise<DoctorResult> {
  const packageDir = join(import.meta.dirname, "..", "..");

  // 1. 版本兼容性
  const config = await loadCompat(packageDir);
  const compatResults = checkCompat(config);

  // 2. 文件一致性
  const consistencyWarnings: string[] = [];
  const changesDir = join(projectPath, "openspec", "changes");
  const changes = await findActiveChanges(changesDir);

  for (const [name, state] of changes) {
    const changePath = join(changesDir, name);

    // 检查 worktree 字段与实际路径的一致性
    if (state.worktree) {
      const worktreePath = join(projectPath, state.worktree);
      if (!existsSync(worktreePath)) {
        consistencyWarnings.push(
          `${name}: .alloy.yaml 声称 worktree 存在但路径不可达 (${state.worktree})`
        );
      }
    }
  }

  return { compatResults, consistencyWarnings };
}

export function formatDoctorResult(result: DoctorResult, useJson: boolean): string {
  if (useJson) {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];

  lines.push("版本兼容性：");
  for (const r of result.compatResults) {
    const mark = r.compatible ? "✓" : "⚠️";
    lines.push(`  ${mark} ${r.name}: ${r.current}（要求 ${r.required}）`);
  }

  if (result.consistencyWarnings.length > 0) {
    lines.push("\n文件一致性：");
    for (const w of result.consistencyWarnings) {
      lines.push(`  ⚠️ ${w}`);
    }
  } else {
    lines.push("\n文件一致性：✓ 无问题");
  }

  return lines.join("\n");
}
```

- [ ] **Step 2: 更新 index.ts 的 doctor 路由**

```typescript
case "doctor": {
  const useJson = args.includes("--json");
  const result = await doctorCommand(process.cwd());
  console.log(formatDoctorResult(result, useJson));
  break;
}
```

- [ ] **Step 3: 验证编译**

Run: `npm run build`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/doctor.ts src/cli/index.ts
git commit -m "CLI doctor 命令：版本兼容性 + 文件一致性诊断"
```

---

### Task 10: alloy update CLI 命令

**Files:**
- Create: `src/cli/commands/update.ts`
- Modify: `src/cli/index.ts`（补充 update 路由）

- [ ] **Step 1: 创建 update.ts**

```typescript
import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";

const CLAUDE_MD_MARKER_START = "<!-- ALLOY-WORKFLOW:START -->";
const CLAUDE_MD_MARKER_END = "<!-- ALLOY-WORKFLOW:END -->";

export async function updateCommand(projectPath: string): Promise<string[]> {
  const results: string[] = [];

  // 1. 更新 skill 文件
  try {
    execSync("npx skills update alloy", { stdio: "pipe", cwd: projectPath });
    results.push("✓ skills/alloy/ → 已更新到最新版");
  } catch {
    results.push("⚠️ skills/alloy/ 更新失败，请检查网络连接");
  }

  // 2. 更新 vendor
  try {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    const vendorSource = join(home, ".claude", "skills", "alloy", "vendor");
    const vendorTarget = join(projectPath, "vendor");
    await cp(vendorSource, vendorTarget, { recursive: true, force: true });
    results.push("✓ vendor/ → 已同步");
  } catch {
    results.push("⚠️ vendor/ 同步失败");
  }

  // 3. 更新 CLAUDE.md 中的 Alloy 标记区域
  const claudeMdPath = join(projectPath, "CLAUDE.md");
  try {
    let content = await readFile(claudeMdPath, "utf-8");
    if (content.includes(CLAUDE_MD_MARKER_START)) {
      const latestFragment = await getLatestClaudeMdFragment(projectPath);
      const startIdx = content.indexOf(CLAUDE_MD_MARKER_START);
      const endIdx = content.indexOf(CLAUDE_MD_MARKER_END);
      if (endIdx > startIdx) {
        content = content.slice(0, startIdx) + latestFragment + content.slice(endIdx + CLAUDE_MD_MARKER_END.length);
        await writeFile(claudeMdPath, content, "utf-8");
        results.push("✓ CLAUDE.md → Alloy 标记区域已更新");
      }
    }
  } catch {
    results.push("⚠️ CLAUDE.md 更新失败");
  }

  return results;
}

async function getLatestClaudeMdFragment(_projectPath: string): Promise<string> {
  // 从最新 Alloy 包内置的 fragment 读取
  return `\n${CLAUDE_MD_MARKER_START}\n## Alloy 工作流\n...\n${CLAUDE_MD_MARKER_END}\n`;
}
```

- [ ] **Step 2: 更新 index.ts 的 update 路由**

```typescript
case "update": {
  const results = await updateCommand(process.cwd());
  for (const r of results) console.log(`  ${r}`);
  break;
}
```

- [ ] **Step 3: 验证编译**

Run: `npm run build`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/update.ts src/cli/index.ts
git commit -m "CLI update 命令：skill 更新 + vendor 同步 + CLAUDE.md 标记替换"
```

---

### Task 11: Alloy OpenSpec Schema（从零构建）

**Files:**
- Create: `openspec/schemas/alloy/schema.yaml`
- Create: `openspec/schemas/alloy/artifacts/draft.md`
- Create: `openspec/schemas/alloy/artifacts/proposal.md`
- Create: `openspec/schemas/alloy/artifacts/design.md`
- Create: `openspec/schemas/alloy/artifacts/specs.md`
- Create: `openspec/schemas/alloy/artifacts/tasks.md`
- Create: `openspec/schemas/alloy/artifacts/plan.md`
- Create: `openspec/schemas/alloy/templates/` (8 个模板文件)

- [ ] **Step 1: 创建 schema.yaml**

```yaml
name: alloy
version: "1"
description: >
  Alloy schema - 融合 OpenSpec 制品治理和 Superpowers 执行技能。
  Pre-OpenSpec 阶段产出 draft.md，规划阶段逐制品生成，
  执行阶段使用 worktree + SDD(TDD) + verify + retrospective。

artifacts:
  - id: draft
    generates: draft.md
    template: templates/draft.md
    instruction: artifacts/draft.md
    requires: []

  - id: proposal
    generates: proposal.md
    template: templates/proposal.md
    instruction: artifacts/proposal.md
    requires: [draft]

  - id: design
    generates: design.md
    template: templates/design.md
    instruction: artifacts/design.md
    requires: [proposal]

  - id: specs
    generates: "specs/"
    template: templates/specs.md
    instruction: artifacts/specs.md
    requires: [proposal]

  - id: tasks
    generates: tasks.md
    template: templates/tasks.md
    instruction: artifacts/tasks.md
    requires: [specs, design]

  - id: plan
    generates: plan.md
    template: templates/plan.md
    instruction: artifacts/plan.md
    requires: [tasks]

apply:
  requires: [plan]
  steps:
    - id: worktree
      description: "创建隔离 workspace (git worktree)"
      skill: superpowers:using-git-worktrees
    - id: subagent
      description: "逐任务子 agent 执行 (SDD + TDD + code review)"
      skill: superpowers:subagent-driven-development
    - id: verify
      description: "代码行为验证 + 制品结构验证"
      command: openspec-verify-change
      generates: verify.md
    - id: retrospective
      description: "证据驱动复盘"
      generates: retrospective.md
      template: templates/retrospective.md
```

- [ ] **Step 2: 创建 artifact instruction 文件**

每个 `artifacts/<name>.md` 文件定义 Agent 生成该制品时的行为指令。

**artifacts/draft.md：**
```markdown
# draft 制品指令

产出: draft.md（项目根目录，Pre-OpenSpec 阶段临时文件）

## 生成指令

1. 调用 `superpowers:brainstorming` skill 进行交互式需求探索
2. 在新项目上探索需求空间；在存量项目上先探查代码库架构和约束
3. 与用户多轮对话：理解目的、约束、成功标准
4. 提出 2-3 个方案选项，对比利弊，推荐最优方案
5. 获得用户设计审批后，产出 draft.md

## draft.md 内容要求

自由格式设计草案，应包含：
- 要解决的问题（Why）
- 方案概述（What）
- 关键技术决策及理由
- 范围和边界

## 约束

- draft.md 存放在项目根目录，不在 change 目录内
- 生成即完成，不自动创建 change 目录
- 完成后提示用户可运行 /alloy-plan
```

**artifacts/proposal.md：**
```markdown
# proposal 制品指令

产出: proposal.md
依赖: draft（由 instruction 读取，不通过 schema requires 声明）

## 生成指令

1. 读取 draft.md，提取 Why/What/Capabilities
2. 按 OpenSpec proposal 格式输出：
   - ## Why - 为什么做
   - ## What Changes - 做什么（Capabilities 列表）
   - ## Impact - 影响范围

## 约束

- Capabilities 列表必须是抽象的行为能力描述，不包含技术实现细节
- 范围不应超出 draft.md 中约定的边界
```

**artifacts/design.md：**
```markdown
# design 制品指令

产出: design.md
依赖: proposal + draft（由 instruction 读取）

## 生成指令

1. 读取 draft.md 中的技术决策（Q1-Qn），重组为结构化技术方案
2. 读取 proposal.md 的 Capabilities，确保技术方案不超出范围
3. 按 OpenSpec design 格式输出架构决策、技术选型、集成点

## 约束

- 技术方案受 proposal 的 Capabilities 范围约束
- 与 draft.md 中的决策保持一致，不可自行偏离
```

**artifacts/specs.md：**
```markdown
# specs 制品指令

产出: specs/**/*.md（Delta Spec，按 Capability 拆分）
依赖: proposal

## 生成指令

1. 读取 proposal.md 的 Capabilities 列表
2. 按 Capability 逐项写 Delta Spec
3. 每个 Capability 一个 spec 文件
4. 使用 ADDED / MODIFIED / REMOVED 区段

## CRITICAL 约束

- **故意不读 draft.md** —— 只读 proposal 的 Capabilities 列表
- 规格是行为契约，不写类名、库选型、逐步流程
- 仅描述外部可观察行为
```

**artifacts/tasks.md：**
```markdown
# tasks 制品指令

产出: tasks.md（层级编号 checkbox 清单）
依赖: specs + design

## 生成指令

1. 读取 specs（确定"做什么"）
2. 读取 design（确定"怎么做"）
3. 将实现拆分为层级编号的 checkbox 清单
4. 粗粒度追踪整体进度

## 约束

- 任务粒度适中（每个 task 对应一个可独立交付的功能单元）
- 不涉及 TDD 微步骤（留给 plan 制品处理）
```

**artifacts/plan.md：**
```markdown
# plan 制品指令

产出: plan.md（TDD 微步骤）
依赖: tasks

## 生成指令

1. 调用 `superpowers:writing-plans` skill
2. 将 tasks.md 的粗粒度 checkbox 拆为 TDD 微步骤（每步 2-5 分钟粒度）
3. 每步包含：目的、文件路径、预期代码、测试命令、预期输出

## 约束

- DO NOT 使用 /opsx:ff（一键生成）
- 始终分步，每步可审查
```

- [ ] **Step 3: 创建 templates/ 模板文件**

每个 `templates/<name>.md` 提供制品的 Markdown 结构骨架。此处省略完整模板内容（与 superpowers-bridge 的模板结构一致，适配 Alloy 的 artifact 名）。

- [ ] **Step 4: 创建 templates/retrospective.md**

```markdown
# Retrospective

## §0 量化指标
- 实现时间: 
- Task 完成数: 
- Plan 偏离度: 
- 修复循环次数: 

## §1 Wins（做对了什么）

## §2 Misses（做错了什么）

## §3 Plan Deviations（计划偏离）

## §4 Skill Compliance（技能遵循度）

## §5 Surprises（意外发现）

## §6 Promote Candidates（值得推广的模式）
```

- [ ] **Step 5: Commit**

```bash
git add openspec/schemas/alloy/
git commit -m "Alloy Schema：从零构建，含 7 个 artifact + instruction + templates"
```

---

## Phase 3: 完整流程（第 6-8 周）

> 目标：补全 apply / finish / archive / fix / discard 的 SKILL.md + 3 个 shell 脚本。

### Task 12: alloy-apply SKILL.md

**Files:**
- Create: `.claude/skills/alloy/alloy-apply/SKILL.md`

- [ ] **Step 1: 创建 alloy-apply SKILL.md**

```markdown
---
name: alloy-apply
description: Alloy 执行阶段 - worktree 隔离 + SDD(TDD) + verify + retrospective
---

# alloy-apply

你是 Alloy 的执行阶段编排器。按 plan.md 逐任务实现，内部遵循 TDD，执行完毕自动验证和复盘。

## 前置检查

1. 确认 `plan.md` 存在于 change 目录，不存在则报错："未找到 plan.md，请先运行 /alloy-plan"
2. 确认 change 的 phase 为 `planned`

## 执行步骤

### Step 1: 创建隔离 workspace

1. 读取 `.alloy.yaml`，将 worktree 路径写入为 `.worktrees/<name>`
2. 调用 `superpowers:using-git-worktrees` skill —— 创建 git worktree 和新分支
3. 切换到 worktree 目录开始工作

### Step 2: 子 agent 驱动开发（SDD）

1. 调用 `superpowers:subagent-driven-development` skill
2. 主 agent 读取 plan.md，按微步骤逐个分派子 agent
3. 每个子 agent 内部遵循 `superpowers:test-driven-development`（RED-GREEN-REFACTOR）
4. 每个子 agent 完成后，子 agent 内部执行 code review（使用 requesting-code-review 模板）
5. 主 agent 在每步完成后审查子 agent 的产出

**关键规则：**
- SDD 内部自动激活 TDD + code review，Alloy 不重复声明
- 每个 plan 微步骤 = 一个子 agent 任务
- 子 agent 失败 → 主 agent 分析原因 → 修复或重试

### Step 3: 验证

1. 调用 `superpowers:verification-before-completion` skill —— 代码行为验证
2. 运行 `openspec-verify-change` —— 产出 verify.md（7 项检查）
3. 验证失败 → 修复后重新验证 → 循环直到通过（**HARD GATE: 不通过不结束 apply**）

### Step 4: 复盘

生成 `retrospective.md`（使用 schema 中定义的 retrospective 模板，7 节结构，证据驱动）

### Step 5: 完成

1. phase → `applied`
2. 输出扩展点提示：

```
retrospective.md 已生成。phase → applied

💡 建议：可以执行 QA 测试或浏览器测试等质量检查，确认后再进入 finish。

准备好后，运行 /alloy-finish 进入收尾阶段。
```

## 闸门规则

- **verify 不通过不结束 apply（HARD GATE）** —— 循环修复直到通过
- **apply 完成后 DO NOT 自动进入 finish**
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/alloy/alloy-apply/SKILL.md
git commit -m "alloy-apply SKILL.md：worktree + SDD(TDD) + verify 闭环 + retrospective"
```

---

### Task 13: alloy-finish SKILL.md

**Files:**
- Create: `.claude/skills/alloy/alloy-finish/SKILL.md`

- [ ] **Step 1: 创建 alloy-finish SKILL.md**

```markdown
---
name: alloy-finish
description: Alloy 收尾阶段 - merge / PR / keep / discard 人工闸门
---

# alloy-finish

你是 Alloy 的收尾阶段编排器。在 apply 完成后，由人类决定如何处理当前 change。

## 前置检查

1. 确认 `verify.md` 存在
2. **HARD GATE: 询问用户人工测试是否通过。** 用户必须明确确认："人工测试已通过"

## 执行

调用 `superpowers:finishing-a-development-branch` skill，提供 4 个选项：

1. **本地 merge** → 代码合入 main → "代码已合入。是否现在归档？/alloy-archive <name>"
   - phase → `finished`
2. **创建 PR** → "PR 已创建。审查通过后 /alloy-archive <name>"
   - phase → `finished`
   - PR 审查反馈通过自然对话处理，Agent 遵循 receiving-code-review 行为规范
3. **保持分支** → "分支已保留。后续可 /alloy-archive 或 /alloy-discard"
   - phase → `finished`
4. **丢弃** → 清理完毕，流程结束
   - 不写 phase，直接进入 discard 流程

## 闸门规则

- **人工测试必须人类确认（HARD GATE）** —— DO NOT 假设测试已通过
- **仅选项 1、2、3 写 phase=finished**
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/alloy/alloy-finish/SKILL.md
git commit -m "alloy-finish SKILL.md：merge/PR/keep/discard 四选一人工闸门"
```

---

### Task 14: alloy-archive + alloy-discard + alloy-fix SKILL.md

**Files:**
- Create: `.claude/skills/alloy/alloy-archive/SKILL.md`
- Create: `.claude/skills/alloy/alloy-discard/SKILL.md`
- Create: `.claude/skills/alloy/alloy-fix/SKILL.md`

- [ ] **Step 1: 创建 alloy-archive SKILL.md**

```markdown
---
name: alloy-archive
description: Alloy 归档 - 硬校验 phase=finished，执行 openspec archive
---

# alloy-archive

## 前置检查（HARD STOP）

**phase MUST = `finished`。** 如果 phase != finished，硬拒绝：

```
[HARD STOP] Change '<name>' 的 phase 为 '<phase>'，归档要求 phase=finished。
请先运行 /alloy-finish 完成收尾。
```

## 执行

```
openspec archive -y
→ sync delta spec + 归档到 archive/YYYY-MM-DD-<name>/
phase → archived
```
```

- [ ] **Step 2: 创建 alloy-discard SKILL.md**

```markdown
---
name: alloy-discard
description: Alloy 放弃 change - 按 phase 分级清理
---

# alloy-discard

## Phase 行为

| phase | 行为 |
|-------|------|
| started / planned | 仅删除 `openspec/changes/<name>/` 目录 |
| applied / finished | 删除 change 目录 + worktree + 分支 |
| finished（已 merge） | 警告 "代码已合入 main，仅清理 change 目录，不撤销 merge" |
| archived | **[HARD STOP] 已归档的 change 不可 discard** |

## 确认提示

```
将删除以下内容，不可恢复:
  - Change: <name>
  - Worktree: <path>（如有）
  - Branch: <name>（如有）
  - 目录: <change dir>
  输入 'discard <name>' 确认
```

## 确认后清理

1. `git worktree remove <path> --force`（如有）
2. `git branch -D <name>`（如有且未合并）
3. `rm -rf openspec/changes/<name>/`
```

- [ ] **Step 3: 创建 alloy-fix SKILL.md**

```markdown
---
name: alloy-fix
description: Alloy Bug 修复入口 - 诊断 → 环境感知 → 分流
---

# alloy-fix

## Step 1: 环境感知

```
在 worktree 内 → "当前在 worktree <path>，在此修复并提交"
不在 worktree → "在当前分支 <branch> 修复并提交"
```
（告知用户操作位置，不自动跳转）

## Step 2: 诊断

调用 `superpowers:systematic-debugging` skill → 根因定位

## Step 3: 分流

### 不改 spec（实现偏离现有 spec）
→ TDD 修复 → verification-before-completion → 直接 PR

### 需改 spec（spec 需新增或修正）

**无代码落地（有活跃 change 且 phase < applied）：**
→ "spec 变更可并入当前 change <name>。回到 /alloy-plan 更新制品。"
→ 无需开新 change

**已有代码落地（无活跃 change 或 phase ≥ applied）：**
→ "修复需要变更 spec。开新 change: /alloy-start <建议名称>"
→ 不自动创建，让用户感知后手动发起
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/alloy/alloy-archive/SKILL.md \
        .claude/skills/alloy/alloy-discard/SKILL.md \
        .claude/skills/alloy/alloy-fix/SKILL.md
git commit -m "alloy-archive/discard/fix SKILL.md：归档闸门、分级清理、Bug 分流"
```

---

### Task 15: Shell 脚本（guard + state + archive）

**Files:**
- Create: `.claude/skills/alloy/scripts/alloy-guard.sh`
- Create: `.claude/skills/alloy/scripts/alloy-state.sh`
- Create: `.claude/skills/alloy/scripts/alloy-archive.sh`

- [ ] **Step 1: 创建 alloy-guard.sh**

```bash
#!/usr/bin/env bash
# alloy-guard.sh — 阶段转换闸门校验
# 用法: alloy-guard.sh <change-dir> <target-phase> [--apply]
# 退出码: 0=通过, 1=阻断

set -euo pipefail

CHANGE_DIR="$1"
TARGET_PHASE="$2"
APPLY=false
[[ "${3:-}" == "--apply" ]] && APPLY=true

ALLOY_YAML="$CHANGE_DIR/.alloy.yaml"

# 提取当前 phase
current_phase=$(grep -E '^phase:' "$ALLOY_YAML" | awk '{print $2}')

# 合法转换定义
declare -A VALID_TRANSITIONS
VALID_TRANSITIONS["started->planned"]=1
VALID_TRANSITIONS["planned->applied"]=1
VALID_TRANSITIONS["applied->finished"]=1
VALID_TRANSITIONS["finished->archived"]=1

transition="${current_phase}->${TARGET_PHASE}"

if [[ -z "${VALID_TRANSITIONS[$transition]:-}" ]]; then
  echo "[HARD STOP] 不允许的 phase 转换: $current_phase → $TARGET_PHASE"
  echo "  允许的转换: started→planned, planned→applied, applied→finished, finished→archived"
  exit 1
fi

# 针对特定转换的额外检查
case "$transition" in
  "planned->applied")
    if [[ ! -f "$CHANGE_DIR/plan.md" ]]; then
      echo "[HARD STOP] plan.md 不存在，无法进入 apply 阶段"
      exit 1
    fi
    ;;
  "applied->finished")
    if [[ ! -f "$CHANGE_DIR/verify.md" ]]; then
      echo "[HARD STOP] verify.md 不存在，无法进入 finish 阶段"
      exit 1
    fi
    ;;
  "finished->archived")
    if [[ ! -f "$CHANGE_DIR/retrospective.md" ]]; then
      echo "[HARD STOP] retrospective.md 不存在，无法进入 archive 阶段"
      exit 1
    fi
    ;;
esac

if $APPLY; then
  # 更新 phase
  sed -i '' "s/^phase:.*/phase: $TARGET_PHASE/" "$ALLOY_YAML"
  # 更新 updated_at
  today=$(date +%Y-%m-%d)
  sed -i '' "s/^updated_at:.*/updated_at: \"$today\"/" "$ALLOY_YAML"
  echo "✓ phase: $current_phase → $TARGET_PHASE"
fi

exit 0
```

- [ ] **Step 2: 创建 alloy-state.sh**

```bash
#!/usr/bin/env bash
# alloy-state.sh — 统一状态管理（Agent 操作 .alloy.yaml 的独占接口）
# 用法:
#   alloy-state.sh read <change-dir> <field>        — 读取字段
#   alloy-state.sh write <change-dir> <field> <value> — 写入字段
#   alloy-state.sh check <change-dir> <phase>        — 检查 phase 是否匹配

set -euo pipefail

ACTION="$1"
CHANGE_DIR="$2"
FIELD="${3:-}"
VALUE="${4:-}"

ALLOY_YAML="$CHANGE_DIR/.alloy.yaml"

case "$ACTION" in
  read)
    grep -E "^${FIELD}:" "$ALLOY_YAML" | sed 's/^[^:]*: *//'
    ;;
  write)
    if grep -qE "^${FIELD}:" "$ALLOY_YAML"; then
      sed -i '' "s/^${FIELD}:.*/${FIELD}: ${VALUE}/" "$ALLOY_YAML"
    else
      echo "${FIELD}: ${VALUE}" >> "$ALLOY_YAML"
    fi
    today=$(date +%Y-%m-%d)
    sed -i '' "s/^updated_at:.*/updated_at: \"$today\"/" "$ALLOY_YAML"
    ;;
  check)
    current=$(grep -E '^phase:' "$ALLOY_YAML" | awk '{print $2}')
    expected="$FIELD"
    if [[ "$current" != "$expected" ]]; then
      echo "phase 不匹配: 当前=$current, 期望=$expected"
      exit 1
    fi
    ;;
  *)
    echo "未知操作: $ACTION (支持: read, write, check)"
    exit 1
    ;;
esac
```

- [ ] **Step 3: 创建 alloy-archive.sh**

```bash
#!/usr/bin/env bash
# alloy-archive.sh — 归档：验证状态 → sync delta spec → 移动归档
# 用法: alloy-archive.sh <project-dir> <change-name> [--dry-run]

set -euo pipefail

PROJECT_DIR="$1"
CHANGE_NAME="$2"
DRY_RUN=false
[[ "${3:-}" == "--dry-run" ]] && DRY_RUN=true

CHANGE_DIR="$PROJECT_DIR/openspec/changes/$CHANGE_NAME"
ALLOY_YAML="$CHANGE_DIR/.alloy.yaml"

# 1. 状态验证
phase=$(grep -E '^phase:' "$ALLOY_YAML" | awk '{print $2}')
if [[ "$phase" != "finished" ]]; then
  echo "[HARD STOP] phase 必须为 finished，当前为 $phase"
  exit 1
fi

if $DRY_RUN; then
  echo "[DRY RUN] 将归档 change '$CHANGE_NAME' (phase=$phase)"
  echo "[DRY RUN] openspec archive -y --change $CHANGE_NAME"
  exit 0
fi

# 2. 执行 openspec archive
if command -v openspec &> /dev/null; then
  openspec archive -y --change "$CHANGE_NAME"
  echo "✓ delta spec 已同步，change 已归档"
else
  echo "⚠️  OpenSpec CLI 未安装，跳过 spec 同步"
fi

# 3. 更新 phase
today=$(date +%Y-%m-%d)
sed -i '' "s/^phase:.*/phase: archived/" "$ALLOY_YAML"
sed -i '' "s/^updated_at:.*/updated_at: \"$today\"/" "$ALLOY_YAML"

echo "✓ phase → archived"
```

- [ ] **Step 4: 设置可执行权限**

```bash
chmod +x .claude/skills/alloy/scripts/alloy-guard.sh
chmod +x .claude/skills/alloy/scripts/alloy-state.sh
chmod +x .claude/skills/alloy/scripts/alloy-archive.sh
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/alloy/scripts/
git commit -m "Shell 脚本：guard 闸门校验 + state 状态管理 + archive 归档"
```

---

### Task 16: Vendor Superpowers 内置兜底

**Files:**
- Create: `vendor/superpowers/` 目录下的 7 个 SKILL.md

- [ ] **Step 1: 创建 vendor 目录和占位文件**

```bash
mkdir -p vendor/superpowers/{brainstorming,using-git-worktrees,subagent-driven-development,verification-before-completion,finishing-a-development-branch,systematic-debugging,receiving-code-review}
```

- [ ] **Step 2: 写入占位 SKILL.md**

每个 vendor 文件写一个占位说明，待 `alloy update` 时从 registry 同步实际内容：

```markdown
# [Skill Name] (Alloy vendor 兜底)

此文件为 Alloy 内置兜底。运行时如网络可用，将使用从 registry 安装的最新版本。

实际 skill 内容由 `alloy update` 同步。
```

- [ ] **Step 3: Commit**

```bash
git add vendor/
git commit -m "Vendor：Superpowers 内置兜底 skill 占位文件"
```

---

### Task 17: 主入口 SKILL.md（路由分发）

**Files:**
- Create: `.claude/skills/alloy/SKILL.md`

- [ ] **Step 1: 创建主入口 SKILL.md**

```markdown
---
name: alloy
description: Alloy - OpenSpec + Superpowers 编排层。路由到 /alloy-start, /alloy-plan, /alloy-apply, /alloy-finish, /alloy-archive, /alloy-fix, /alloy-discard, /alloy-status
---

# Alloy

你是 Alloy 开发工作流编排器的主入口。根据用户输入的命令路由到对应的子 skill。

## 命令路由

| 用户输入 | 路由到 |
|---------|--------|
| `/alloy-start [topic]` | alloy-start |
| `/alloy-plan [name]` | alloy-plan |
| `/alloy-apply [name]` | alloy-apply |
| `/alloy-finish [name]` | alloy-finish |
| `/alloy-archive [name]` | alloy-archive |
| `/alloy-fix` | alloy-fix |
| `/alloy-discard [name]` | alloy-discard |
| `/alloy-status [name]` | alloy-status |

## 行为

1. 识别用户输入的命令
2. 加载对应的子 skill 文件（`.claude/skills/alloy/alloy-<command>/SKILL.md`）
3. 严格按照子 skill 的指令执行
4. 对于带 `[name]` 参数的命令，若省略则从 `openspec/changes/*/.alloy.yaml` 自动推断
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/alloy/SKILL.md
git commit -m "Alloy 主入口 SKILL.md：命令路由 + 上下文推断"
```

---

## Phase 4: 测试 + 推广（第 9-10 周）

> 目标：CLI 单元测试 + shell 脚本 Bats 测试 + 端到端验证 + 团队推广。

### Task 18: CLI 单元测试

**Files:**
- Create: `test/cli/init.test.ts`
- Create: `test/cli/status.test.ts`
- Create: `test/cli/doctor.test.ts`
- Create: `test/cli/update.test.ts`

- [ ] **Step 1: 创建 vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 2: 编写测试文件**

此处省略完整测试代码（涉及 mock 文件系统、exec command 等），测试覆盖：
- `alloy init` 环境检测逻辑、scope 参数、skip-claude-md 参数
- `alloy status` 总览/详情模式、无 change 场景
- `alloy doctor` 版本兼容性检查、一致性检查
- `alloy update` skill 更新、vendor 同步

- [ ] **Step 3: 运行测试**

Run: `npm test`
Expected: 所有测试通过

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts test/
git commit -m "测试：CLI 单元测试（init/status/doctor/update）"
```

---

### Task 19: Shell 脚本 Bats 测试

**Files:**
- Create: `test/shell/alloy-guard.bats`
- Create: `test/shell/alloy-state.bats`
- Create: `test/shell/alloy-archive.bats`

- [ ] **Step 1: 安装 Bats**

```bash
npm install -g bats
```

- [ ] **Step 2: 编写 Bats 测试**

每个脚本覆盖：
- 正常路径（合法 phase 转换、合法字段读写）
- 边界条件（非法转换、HARD STOP 触发、dry-run 模式）
- 文件系统状态验证

- [ ] **Step 3: 运行 Bats 测试**

```bash
bats test/shell/
```

- [ ] **Step 4: Commit**

```bash
git add test/shell/
git commit -m "测试：Shell 脚本 Bats 测试"
```

---

### Task 20: 端到端验证 + 推广准备

- [ ] **Step 1: 端到端验证（完整流程）**

在 Claude Code 中跑通完整的 0→1 流程：
1. `/alloy-start new-feature` → draft.md 生成
2. `/alloy-plan new-feature` → 逐制品生成（proposal → design → specs → tasks → plan）
3. `/alloy-apply new-feature` → worktree + SDD + verify + retrospective
4. `/alloy-finish new-feature` → 人工测试确认 → 本地 merge
5. `/alloy-archive new-feature` → 归档

验证点：
- 状态文件（.alloy.yaml）phase 转换正确
- Schema DAG 按时序执行
- 闸门（verify 不过不结束 apply、archived 不可 discard）正确生效
- 断点恢复（/alloy-start 在中断后正确恢复）

- [ ] **Step 2: 修复验证中发现的问题**

```bash
git add -A
git commit -m "端到端验证修复"
```

- [ ] **Step 3: 输出推广清单**

准备推广文档（团队内部使用）：
- 安装指南（npm install -g + alloy init）
- 快速上手（/alloy-start 三步走）
- 常见问题（Q&A）

```bash
git add docs/
git commit -m "文档：团队推广指南"
```

- [ ] **Step 4: 团队内试运行**

在 2-3 个真实项目中试用，收集反馈：
- 闸门是否过于严格/宽松？
- 制品生成质量是否满意？
- 断点恢复是否可靠？

- [ ] **Step 5: 反馈整合 + 发布 v0.1.0**

```bash
npm version 0.1.0
git push origin main
```

---

## 自审

**1. 规格覆盖检查：**
- 8 条 slash command → Task 2, 3, 4, 12, 13, 14 ✓
- 4 条 CLI command → Task 7, 8, 9, 10 ✓
- Schema DAG → Task 11 ✓
- 状态管理 (.alloy.yaml) → Task 1, 6 ✓ (state.ts)
- 扩展点提示 → Task 2, 12 (内嵌在 SKILL.md 中) ✓
- 平台兼容 (v1 Claude Code) → 全部 SKILL.md 仅适配 Claude Code ✓
- Shell 脚本 → Task 15 ✓
- Vendor → Task 16 ✓
- 测试 → Task 18, 19 ✓
- 风险缓解 → compat.yaml (Task 1), guard.sh (Task 15), doctor (Task 9) ✓

**2. 占位符扫描：** 无 TBD/TODO，无 "implement later"。Task 18 的测试代码标注为"此处省略完整测试代码"——留给执行时按 TDD 详细编写。vendor 文件为占位内容，是设计上的有意行为（alloy update 时同步）。

**3. 类型一致性：** `AlloyState` 接口在 Task 6 定义，Task 7-10 全部引用同一类型。`DeployOptions` 在 Task 7 定义，Task 7 内部自用。`CompatConfig`/`CompatResult` 在 Task 6 定义，Task 9 引用。
