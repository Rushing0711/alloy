# 技能使用记录持久化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将全周期技能使用记录从 Agent 内存迁移到 `.alloy.yaml` 持久化存储，使 retrospective 的 §4 技能审计在断点恢复后仍然准确。

**Architecture:** 新增 `SkillUsageEntry` 类型和 `alloy _skill` 命令，在各阶段命令的 Skill 调用点插入记录逻辑。retrospective 模板从 `skill_usage[]` 读取数据而非 Agent 自报。

**Tech Stack:** TypeScript, Node.js fs/promises, yaml, vitest

---

### Task 1: 数据模型——types.ts + state.ts

**Files:**
- Modify: `src/core/types.ts:48-80`
- Modify: `src/cli/utils/state.ts:15-28`

- [ ] **Step 1: 在 types.ts 中新增 SkillUsageEntry 接口**

在 `ArtifactRecord` 接口后面添加：

```typescript
export interface SkillUsageEntry {
  skill: string;
  stage: string;
  used: boolean;
  count?: number;
  via?: string;
  reason?: string;
  recorded_at: string;
}
```

- [ ] **Step 2: 在 AlloyState 中新增 skill_usage 字段**

在 `AlloyState` 接口的 `records: ArtifactRecord[];` 后面添加：

```typescript
skill_usage: SkillUsageEntry[];
```

- [ ] **Step 3: 在 createInitialState() 中初始化 skill_usage**

在 `src/cli/utils/state.ts` 的 `createInitialState()` 返回对象中，`records: [],` 后面添加：

```typescript
skill_usage: [],
```

- [ ] **Step 4: 编译验证**

Run: `npm run build`
Expected: 编译成功，无类型错误。

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/cli/utils/state.ts
git commit -m "feat: 新增 SkillUsageEntry 类型和 AlloyState.skill_usage 字段"
```

---

### Task 2: alloy _skill 命令实现

**Files:**
- Create: `src/cli/commands/internal/skill-usage.ts`
- Modify: `src/cli/index.ts:14-16`

- [ ] **Step 1: 创建 skill-usage.ts 命令文件**

```typescript
// src/cli/commands/internal/skill-usage.ts
import { readState, writeState } from "../../utils/state.js";
import type { SkillUsageEntry } from "../../../core/types.js";

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export async function skillUsageCommand(args: string[]): Promise<void> {
  const action = args[0];   // log | skip
  const changeDir = args[1];
  const stage = args[2];
  const skill = args[3];

  if (!action || !changeDir || !stage || !skill) {
    console.error("用法: alloy _skill <log|skip> <change-dir> <stage> <skill> [--via <source>] [--reason <reason>]");
    process.exit(1);
  }

  const state = await readState(changeDir);
  if (!state.skill_usage) state.skill_usage = [];

  const now = formatTimestamp();

  // 解析可选参数
  let via: string | undefined;
  let reason: string | undefined;
  for (let i = 4; i < args.length; i++) {
    if (args[i] === "--via" && i + 1 < args.length) {
      via = args[++i];
    } else if (args[i] === "--reason" && i + 1 < args.length) {
      reason = args[++i];
    }
  }

  // 幂等：同一 skill+stage 组合已存在时更新
  const existing = state.skill_usage.findIndex(
    r => r.skill === skill && r.stage === stage
  );

  const entry: SkillUsageEntry = {
    skill,
    stage,
    used: action === "log",
    recorded_at: now,
  };

  if (action === "log") {
    if (via) entry.via = via;
    // count: 如果已存在则 +1，否则 = 1
    if (existing >= 0) {
      const prev = state.skill_usage[existing];
      entry.count = (prev.count || 1) + 1;
    } else {
      entry.count = 1;
    }
  } else {
    // skip
    if (reason) entry.reason = reason;
  }

  if (existing >= 0) {
    state.skill_usage[existing] = entry;
  } else {
    state.skill_usage.push(entry);
  }

  await writeState(changeDir, state);
  console.log(`✓ skill_usage: ${skill} (${stage}) → ${action === "log" ? "used" : "skipped"}`);
}
```

- [ ] **Step 2: 在 index.ts 中注册 _skill 路由**

在 `src/cli/index.ts` 中：
1. 在 import 区域添加：
```typescript
import { skillUsageCommand } from "./commands/internal/skill-usage.js";
```
2. 在 switch-case 中，`case "_record":` 前面添加：
```typescript
case "_skill": {
  await skillUsageCommand(restArgs);
  break;
}
```

- [ ] **Step 3: 编译验证**

Run: `npm run build`
Expected: 编译成功。

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/internal/skill-usage.ts src/cli/index.ts
git commit -m "feat: 新增 alloy _skill 命令，持久化技能使用记录"
```

---

### Task 3: retrospective 模板和指令更新

**Files:**
- Modify: `openspec/schemas/alloy/templates/retrospective.md:109-137`
- Modify: `openspec/schemas/alloy/instructions/retrospective.md:91-131`

- [ ] **Step 1: 更新 templates/retrospective.md §4——三列格式 + 补全阶段**

将 §4 部分从当前的两列格式替换为：

```markdown
## §4 全周期技能审计

数据来源：`.alloy.yaml` 的 `skill_usage[]` 字段。`skill_usage[]` 为空（旧 change 无记录）→ 对应行填 `—`。

### start 阶段

| 技能/命令 | 使用 | 原因 |
|----------|:---:|------|
| `opsx:explore` | | |
| `superpowers:brainstorming` | | |
| `/opsx:new` | | |

### plan 阶段

| 技能/命令 | 使用 | 原因 |
|----------|:---:|------|
| `/opsx:continue` | | |
| `superpowers:writing-plans` | | |

### apply 阶段

| 技能/命令 | 使用 | 原因 |
|----------|:---:|------|
| `superpowers:using-git-worktrees` | | |
| `superpowers:subagent-driven-development` | | |
| `test-driven-development` | | |
| `spec-compliance-review` | | |
| `code-quality-review` | | |
| `superpowers:executing-plans` | | |
| `superpowers:requesting-code-review` | | |
| `superpowers:verification-before-completion` | | |
| `/opsx:verify` | | |

### archive 阶段

| 技能/命令 | 使用 | 原因 |
|----------|:---:|------|
| `/opsx:archive` | | |

### finish 阶段

| 技能/命令 | 使用 | 原因 |
|----------|:---:|------|
| `superpowers:finishing-a-development-branch` | | |

### Deliberately Skipped Skills

<!-- 对于每个标记 ✗ 的技能，填写以下三项：
1. **What was skipped** — 具体跳过了哪个技能或子步骤
2. **Why this cycle** — 具体触发原因
3. **How to prevent recurrence** — schema graph fix / skill description tightening / CLAUDE.md trigger / scope-judgment rule / one-off
-->
```

- [ ] **Step 2: 更新 instructions/retrospective.md §4——从 skill_usage[] 读取**

将 §4 部分的"Agent 自报全周期技能和命令使用情况（同一 session 亲历）："替换为：

```markdown
#### §4 全周期技能审计

从 `.alloy.yaml` 的 `skill_usage[]` 字段读取全周期技能使用记录（各阶段 `alloy _skill log` 写入）：

```bash
alloy _state read openspec/changes/<name> skill_usage
```

按 `templates/retrospective.md` 的 §4 格式生成审计表：

- `used=true` → 填 `✓`，有 `count` 时追加 `(×N)`，有 `via` 时原因列填 `via <source>`
- `used=false` → 填 `✗`，原因列填 `reason` 字段的值
- 不在 `skill_usage[]` 中（旧 change 无记录）→ 填 `—`
- `skill_usage[]` 为空数组 → 所有行填 `—`，在表前加一行提示："> ⚠️ 当前 change 无 skill_usage 记录（旧 change），以下数据不可用。"

**Deliberately Skipped Skills：** 对于每个 `used=false` 的条目，展开三问：
1. **What was skipped** — 具体跳过了哪个技能或子步骤
2. **Why this cycle** — 具体触发原因（优先用 `reason` 字段的值）
3. **How to prevent recurrence** — schema graph fix / skill description tightening / CLAUDE.md trigger / scope-judgment rule / one-off
```

同时更新 instructions 中的技能清单为 5 阶段格式（与模板对齐），替换原有的 3 阶段 `| 技能/命令 | 使用 |` 两列表格。

- [ ] **Step 3: Commit**

```bash
git add openspec/schemas/alloy/templates/retrospective.md openspec/schemas/alloy/instructions/retrospective.md
git commit -m "docs: retrospective 技能审计改为从 skill_usage[] 读取，三列格式 + 五阶段"
```

---

### Task 4: start.md 添加技能记录

**Files:**
- Modify: `commands/alloy/start.md`

- [ ] **Step 1: opsx:explore 后添加记录**

在 start.md Step 1/2 中，`opsx:explore` 技能加载后，添加：

```markdown
**技能加载后立即记录：**
```bash
alloy _skill log openspec/changes/<name> start opsx:explore
```
```

- [ ] **Step 2: superpowers:brainstorming 后添加记录**

在 start.md Step 2/2 中，`superpowers:brainstorming` 技能加载后，添加：

```markdown
**技能加载后立即记录：**
```bash
alloy _skill log openspec/changes/<name> start superpowers:brainstorming
```
```

- [ ] **Step 3: /opsx:new 后添加记录**

在 start.md 步骤 4（调用 `/opsx:new` 创建 change 目录）后，添加：

```markdown
**命令执行后立即记录：**
```bash
alloy _skill log openspec/changes/<name> start opsx:new
```
```

- [ ] **Step 4: Commit**

```bash
git add commands/alloy/start.md
git commit -m "docs(start): 添加 3 处 alloy _skill log 记录"
```

---

### Task 5: plan.md 添加技能记录

**Files:**
- Modify: `commands/alloy/plan.md`

- [ ] **Step 1: 每次 /opsx:continue 后添加记录**

在 plan.md Step 2/3 的审查窗口中，每个制品审批通过（用户选 a）后，hash+commit 步骤前，添加：

```markdown
**hash 锁定前，记录技能使用：**
```bash
alloy _skill log openspec/changes/<name> plan opsx:continue
```
```

注：`/opsx:continue` 被调用 4 次（proposal/design/specs/tasks），每次审查通过后记录一次。`alloy _skill log` 自带幂等更新和 count 递增。

- [ ] **Step 2: superpowers:writing-plans 后添加记录**

在 plan.md tasks 审批通过后、加载 `superpowers:writing-plans` 技能的位置，添加：

```markdown
**技能加载后立即记录：**
```bash
alloy _skill log openspec/changes/<name> plan superpowers:writing-plans
```
```

- [ ] **Step 3: Commit**

```bash
git add commands/alloy/plan.md
git commit -m "docs(plan): 添加 alloy _skill log 记录 opsx:continue 和 writing-plans"
```

---

### Task 6: apply.md 添加技能记录 + 更新 §4 引用

**Files:**
- Modify: `commands/alloy/apply.md`

- [ ] **Step 1: using-git-worktrees 后添加记录**

在 apply.md Step 1/5 中，`superpowers:using-git-worktrees` 技能加载后（约第 214 行），添加：

```markdown
**技能加载后立即记录：**
```bash
alloy _skill log openspec/changes/<name> apply superpowers:using-git-worktrees
```
```

- [ ] **Step 2: 路径 A——subagent-driven-development 后添加记录**

在 apply.md 路径 A 描述处（约第 355-357 行），`superpowers:subagent-driven-development` 加载后，添加：

```markdown
**技能加载后立即记录：**
```bash
alloy _skill log openspec/changes/<name> apply superpowers:subagent-driven-development
alloy _skill log openspec/changes/<name> apply test-driven-development --via subagent-driven-development
alloy _skill log openspec/changes/<name> apply spec-compliance-review --via subagent-driven-development
alloy _skill log openspec/changes/<name> apply code-quality-review --via subagent-driven-development
```
```

- [ ] **Step 3: 路径 B——executing-plans 三步添加记录**

在 apply.md 路径 B 描述处（约第 361-376 行）：

加载 `superpowers:test-driven-development` 后：
```markdown
**技能加载后立即记录：**
```bash
alloy _skill log openspec/changes/<name> apply superpowers:test-driven-development
```
```

加载 `superpowers:executing-plans` 后：
```markdown
**技能加载后立即记录：**
```bash
alloy _skill log openspec/changes/<name> apply superpowers:executing-plans
```
```

加载 `superpowers:requesting-code-review` 后：
```markdown
**技能加载后立即记录：**
```bash
alloy _skill log openspec/changes/<name> apply superpowers:requesting-code-review
```
```

- [ ] **Step 4: verification-before-completion 后添加记录**

在 apply.md Step 3/5 中，`superpowers:verification-before-completion` 技能加载后（约第 385 行），添加：

```markdown
**技能加载后立即记录：**
```bash
alloy _skill log openspec/changes/<name> apply superpowers:verification-before-completion
```
```

- [ ] **Step 5: /opsx:verify 后添加记录**

在 apply.md Step 4/5 中，`/opsx:verify` 调用后（约第 413 行），添加：

```markdown
**命令执行后立即记录：**
```bash
alloy _skill log openspec/changes/<name> apply opsx:verify
```
```

- [ ] **Step 6: 更新 §4 引用**

将 apply.md 第 487 行：
```
**§4 全周期技能审计：** Agent 自报 start/plan/apply 三阶段 11 项技能/命令使用情况（✓/✗）。同一 session 亲历，无需推断。跳过的技能填三问（跳过什么/为什么/如何防复发）。
```

替换为：
```
**§4 全周期技能审计：** 从 `.alloy.yaml` 的 `skill_usage[]` 字段读取 start/plan/apply/archive/finish 五阶段技能使用记录。`skill_usage[]` 为空（旧 change）→ 对应行填 `—`，不推断。跳过的技能展开三问（跳过什么/为什么/如何防复发）。
```

- [ ] **Step 7: Commit**

```bash
git add commands/alloy/apply.md
git commit -m "docs(apply): 添加 6 处 alloy _skill log 记录 + 更新 §4 引用"
```

---

### Task 7: archive.md 和 finish.md 添加技能记录

**Files:**
- Modify: `commands/alloy/archive.md`
- Modify: `commands/alloy/finish.md`

- [ ] **Step 1: archive.md——/opsx:archive 后添加记录**

在 archive.md Step 2/3 中，`/opsx:archive` 命令执行后（约第 74-76 行），添加：

```markdown
**命令执行后立即记录：**
```bash
alloy _skill log openspec/changes/<name> archive opsx:archive
```
```

- [ ] **Step 2: finish.md——finishing-a-development-branch 后添加记录**

在 finish.md Step 2/3 中，`superpowers:finishing-a-development-branch` 技能加载后（约第 91 行），添加：

```markdown
**技能加载后立即记录：**
```bash
alloy _skill log openspec/changes/<name> finish superpowers:finishing-a-development-branch
```
```

- [ ] **Step 3: Commit**

```bash
git add commands/alloy/archive.md commands/alloy/finish.md
git commit -m "docs(archive,finish): 添加 alloy _skill log 记录"
```

---

### Task 8: 测试 + 编译最终验证

- [ ] **Step 1: 运行全量测试**

Run: `npm test`
Expected: 280 tests passed (22 files)

- [ ] **Step 2: 运行编译**

Run: `npm run build`
Expected: 编译成功，无错误

- [ ] **Step 3: 手动验证 alloy _skill 命令**

Run: `node dist/cli/index.js _skill`
Expected: 显示用法提示

Run: `node dist/cli/index.js _skill log /nonexistent start test-skill`
Expected: 报错（目录不存在），但命令解析正确

- [ ] **Step 4: 最终确认**

```bash
git status
git log --oneline -10
```
