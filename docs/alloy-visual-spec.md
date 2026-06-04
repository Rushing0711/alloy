# Alloy 终端输出视觉规范

> **目标读者：** 人类开发者 + AI Agent
> **职责：** Alloy Slash Command 在终端输出的统一视觉格式规范。写 Skill 时参考本文档。
> **来源：** 从 [alloy-design.md](alloy-design.md) 提取独立，以实际落地格式为准。

---

## 一、核心格式

Alloy 终端输出使用四种基础格式，覆盖所有阶段的进度提示和交互。

### 1. Phase 框

阶段的入口和出口。Unicode 单线框，固定宽度 38 字符。

**入口：**

```
┌──────────────────────────────────────┐
│ Alloy [N/5] · Phase: Xxx             │
│ 启动时间: 2026-05-31 16:02:00        │
└──────────────────────────────────────┘
```

**出口：**

```
┌──────────────────────────────────────┐
│ Alloy [N/5] · Phase: Xxx — DONE      │
│ 启动时间: 2026-05-31 16:02:00        │
│ 完成时间: 2026-05-31 16:08:30        │
│ 耗时: 6m28s                          │
└──────────────────────────────────────┘
```

**规则：**
- 仅在阶段入口和完成时输出，中间步骤不重复
- 宽度固定 38 字符（`─` × 38）
- 耗时 `<60s` 显示 `Xs`，`≥60s` 显示 `XmXs`
- 启动时间：从 `.alloy.yaml` 读 `phase_timings.<phase>.started_at`；Start "全新开始" 用入口框渲染前捕获的时间（后续写入 started_at）

**各阶段 Phase 编号：**

| Phase | 框内文本 |
|-------|---------|
| Start | `Alloy [1/5] · Phase: Start` |
| Plan | `Alloy [2/5] · Phase: Plan` |
| Apply | `Alloy [3/5] · Phase: Apply` |
| Archive | `Alloy [4/5] · Phase: Archive` |
| Finish | `Alloy [5/5] · Phase: Finish` |

### 2. Step 标题

每进入新步骤时输出。纯文本 `[Step N/M]` + 38 字符 `─` 下划线。

```
[Step 2/3] 制品生成
──────────────────────────────────────
```

**规则：**
- 不使用 Markdown `###` 标题——Agent 应输出纯文本格式
- 下划线宽度与 Phase 框一致（38 字符）

### 3. `>` 块引用

用于三种场景：状态通报、选择交互、制品审查。

**状态通报**——告知当前进度或结果：

```
> precheck 通过：6/6 技能可用 ✓
> 共 5 个步骤：隔离 → SDD → 代码验证 → 制品验证 → 复盘
```

**选择交互**——让用户做出选择（详见第二章）：

```
> 选择工作分支
> ──────────────────────────────────────
>
> 当前在 main 分支
>
> 1. 在当前分支继续 —— 直接在 main 上开发
> 2. 切换到已有分支 —— 选择一个已有分支
> 3. 新建分支       —— 创建新分支并切换
>
> → 建议新建 neon-runners 分支，保持 main 干净
```

**制品审查**——Plan 阶段展示制品内容（详见第三章）：

```
> 制品 [3/5] specs ✓ 完成
>
> [制品完整内容]
>
> → 下一个：tasks（依赖 specs + design）
> → (a) 确认，锁定 specs 并继续 tasks
> → (b) 需要调整 — 说明修改点
```

### 4. `→` 前缀行

用于两种场景：完成摘要、引导提示。

**完成摘要**——Phase 完成框之后，展示阶段关键属性：

```
→ Change: login-feature
→ Phase: applied
→ Worktree: .worktrees/login-feature/
```

**引导提示**——步骤间的引导、建议、下一步提示：

```
→ 下一个：tasks（依赖 specs + design）
→ 建议新建 neon-runners 分支，保持 main 干净
[HARD STOP] phase 不合法：当前为 archived，需要 applied
```

---

## 二、选择交互格式

所有需要用户选择的场景统一使用此格式（分支选择、git 初始化、worktree 启用、finish 合并、Superpowers 执行方式等）。

### 结构

```
> <标题>
> ──────────────────────────────────────
>
> <上下文描述>
>
> 1. <动作> —— <说明>
> 2. <动作> —— <说明>
> 3. <动作> —— <说明>
>
> → <引导提示>
```

### 规则

- 标题行：纯文本，不用 `**`，顶格
- 分隔线：`> ──` 38 字符（与 Phase 框同宽）
- 上下文：空行后，简洁描述当前状态
- 选项：数字 `1.` `2.` `3.` 纯文本（不用 `**1.**`），`——` 分隔动作与说明，用空格对齐 `——`
- 引导：`→` 前缀，放在选项之后

### 完整示例

**3 选项（分支选择）：**

```
> 选择工作分支
> ──────────────────────────────────────
>
> 当前在 main 分支
>
> 1. 在当前分支继续 —— 直接在 main 上开发
> 2. 切换到已有分支 —— 选择一个已有分支
> 3. 新建分支       —— 创建新分支并切换
>
> → 建议新建 neon-runners 分支，保持 main 干净
```

**2 选项（git 初始化）：**

```
> Git 仓库检测
> ──────────────────────────────────────
>
> 检测到项目还不是 git 仓库。worktree 隔离和版本追踪依赖 git。
>
> 1. 立即初始化 —— 执行 git init 并做一次初始提交（推荐）
> 2. 稍后自行处理 —— 手动初始化后再运行 /alloy:apply
```

**3 选项（finish 合并确认）：**

```
> 选择处理方式
> ──────────────────────────────────────
>
> phase=archived 已确认 ✓
>
> 1. 本地 merge —— 合入基础分支
> 2. 创建 PR    —— 提交代码审查
> 3. 保持分支   —— 暂不处理
```

---

## 三、制品审查窗口

Plan、Apply 等生成可审批制品的阶段通用，每个制品生成后展示。

```
> 制品 [N/M] <name> ✓ 完成
>
> [制品完整内容]
>
> → 下一个：<下一制品名>（依赖 <上游制品>）
> → (a) 确认，锁定 <name> 并继续
> → (b) 需要调整 — 说明修改点，修改后重新展示
```

**规则：**
- 首行 `制品 [N/M] <name> ✓ 完成`——N/M 按当前阶段新生成的制品编号
- 中间展示制品完整内容
- `→ 下一个：...` 和 `→ (a)` `→ (b)`
- 用户选 (a) 后才 hash 锁定并 commit

**使用阶段：**

| 阶段 | 制品 | 编号 |
|------|------|------|
| Plan | proposal / design / specs / tasks / plans | [1/5] ~ [5/5] |
| Apply | verify / retrospective | [1/2] ~ [2/2] |

draft 较特殊——审批嵌入 brainstorming 对话流程，不走独立审查窗口。

---

## 四、预检总结行

阶段入口的 Step 0 前置检查结果，纯文本一行：

```
前置检查通过：draft.md ✓  phase=started ✓  git ✓
```

---

## 五、硬阻断

阻断性错误提示，用 `HARD STOP` 前缀：

```
[HARD STOP] phase 不合法：当前为 archived，需要 applied
[HARD STOP] plans 可能被未审批修改
```

---

## 六、精确确认输入

不可逆操作（discard、finish merge）要求用户输入精确语句确认。纯文本，无框无线：

```
输入 discard login-feature 确认，或输入其他内容取消。
```

```
输入 merge login-feature into main 确认，或输入其他内容取消。
```

---

## 七、状态符号

取消方括号标签格式，统一使用符号：

| 符号 | 含义 | 使用场景 |
|------|------|---------|
| `✓` | 检查通过 / 制品锁定 | 预检总结、制品表、操作完成确认 |
| `⚠️` | 警告（非致命） | worktree 残留/孤儿、网络不可达、制品过期 |
| `✗` | 失败 / 阻断 | 技能审计未通过、hash 不匹配 |

---

## 七-2、颜色语义

Alloy CLI 输出使用 [picocolors](https://github.com/alexeyraspopov/picocolors) 添加终端颜色，增强可读性。

### 颜色映射

| 颜色函数 | 语义 | 使用场景 |
|----------|------|---------|
| `color.green()` | 成功 / 通过 | ✓ 标记、安装成功、部署完成 |
| `color.yellow()` | 警告 | ⚠️ 标记、非致命问题 |
| `color.red()` | 失败 / 阻断 | ✗ 标记、安装失败、阻断性错误 |
| `color.cyan()` | 信息高亮 | 版本号、当前值、阶段名 |
| `color.dim()` | 次要信息 | 要求值、路径、时间戳 |
| `color.bold()` | 标题 / 强调 | 章节标题（健康检查、文件一致性、制品状态） |

### 自动检测 TTY

picocolors 自动检测终端环境：

- **TTY 环境**（真实终端）：输出带 ANSI 颜色转义码
- **非 TTY 环境**（管道、测试、CI）：输出纯文本，颜色函数返回原始字符串

### 代码实现

```typescript
// src/utils/format.ts
import pc from "picocolors";
export const color = pc;

// 使用示例（src/cli/commands/doctor.ts）
import { color } from "../../utils/format.js";

const mark = r.status === "pass"
  ? color.green("✓")
  : r.status === "warn"
    ? color.yellow("⚠️")
    : color.red("✗");
```

### 适用命令

| 命令 | 颜色应用 |
|------|---------|
| `doctor` | 健康检查状态、文件一致性警告 |
| `status` | 活跃 Change 列表、制品状态、阶段名 |
| `init` | 环境检测、安装结果、兼容性检查 |
| `update` | 版本信息、升级结果、部署状态 |

---

## 八、制品汇总表

Start / Plan / Apply 阶段在完成框后展示。固定列宽保证对齐：

```
所有制品已生成并锁定：

  制品             状态    Hash          创建时间
  ──────────────  ────    ────────────  ───────────────────
  draft           ✓       a344dedcb16d  2026-05-31 16:02:00
  proposal        ✓       28b8834a666f  2026-05-31 16:03:15
```

**列宽规则：** 制品名 14、状态 4、Hash 12、创建时间 19，列间 4 空格。

**各阶段展示行数：**

| 阶段 | 制品 |
|------|------|
| Start | draft（1 行） |
| Plan | draft / proposal / design / specs / tasks / plans（6 行） |
| Apply | plans / verify / retrospective（3 行） |

---

## 九、各阶段完成定制输出

### Start [1/5]

```
→ Change: <name>
→ Phase: started

[制品汇总表 — 仅 draft 一行]

准备好后，运行 /alloy:plan 进入规划阶段。
```

### Plan [2/5]

```
→ Change: <name>
→ Phase: planned

[制品汇总表 — draft/proposal/design/specs/tasks/plans 六行]

每个制品已在审批时独立 commit，无需再次提交。
制品文件禁止手动修改。如需变更，回到 brainstorming 在当前 change 内重新讨论。

准备好后，运行 /alloy:apply 进入执行阶段。
```

### Apply [3/5]

```
→ Change: <name>
→ Phase: applied
→ Worktree: <path  或  当前分支>

[制品汇总表 — plans/verify/retrospective 三行]

→ 代码变更已提交
→ 验证: <PASS  或  存在 N 个 WARN>

准备好后，运行 /alloy:archive 进入归档阶段。
```

### Archive [4/5]（无制品汇总表）

```
→ Change: <name>
→ Phase: archived
→ 归档位置: archive/YYYY-MM-DD-<name>/

✓ Delta Spec 已合并到主 spec
✓ Change 已归档

→ 运行 /alloy:finish 完成代码合入与现场清理
```

### Finish [5/5]（无制品汇总表）

```
→ Change: <name>
→ Phase: finished
→ 处理方式: <本地 merge  /  PR  /  保留分支>
→ 分支: <merged  /  已删除  /  保留>
```

---

## 十、非阶段命令格式

fix、discard、status 不属于 5 阶段体系，使用简化但不失一致的格式——无 Phase 框，用命令名 + 下划线作为阶段标记，Step 标题与阶段命令保持一致。

### 阶段标记

```
Alloy · <命令名>
──────────────────────────────────────
```

下划线宽度与 Phase 框一致（38 字符），命令名使用中文简称：Bug 修复 / 放弃 Change / 状态查看。

**完成标记：**

```
Alloy · <命令名> — DONE
──────────────────────────────────────
```

**各命令的命令名：**

| 命令 | 中文简称 |
|------|---------|
| `/alloy:fix` | Bug 修复 |
| `/alloy:discard` | 放弃 Change |
| `/alloy:status` | 状态查看 |

### Step 标题

与阶段命令一致：`[Step N/M] 标题` + 38 字符 `─` 下划线。

```
[Step 1/3] 环境感知
──────────────────────────────────────
```

### 块引用和引导行

复用 `>` 块引用和 `→` 引导行（规则同 §一）。

### 硬阻断

与阶段命令一致，使用 `[HARD STOP]` 前缀（中括号，全大写）：

```
[HARD STOP] Change '<name>' 的 phase 为 '<phase>'，archived 不可 discard。
```

### fix 命令完整示例

```
Alloy · Bug 修复
──────────────────────────────────────

[Step 1/3] 环境感知
──────────────────────────────────────

> 当前在 worktree `.worktrees/login-feature/`，在此修复并提交

[Step 2/3] 根因诊断 · superpowers:systematic-debugging
──────────────────────────────────────

> 正在系统化诊断问题...

[Step 3/3] 分流修复
──────────────────────────────────────

根因：<诊断结论>
分流：不改 spec——代码偏离了现有 spec，修复实现即可

→ 修复路径：TDD → verification → commit

Alloy · Bug 修复 — DONE
──────────────────────────────────────

修复路径：<路径>
诊断结论：<根因摘要>
结果：<修复结果>
```

### discard 命令完整示例

```
Alloy · 放弃 Change
──────────────────────────────────────

将删除以下内容，不可恢复:

  Change:     login-feature
  Phase:      planned
  分支:       login-feature
  目录:       openspec/changes/login-feature/

输入 'discard login-feature' 确认，或输入其他任意内容取消。

Alloy · 放弃 Change — DONE
──────────────────────────────────────

✓ login-feature 已清理
  已删除：openspec/changes/login-feature/
```

### status 命令完整示例

```
Alloy · 状态查看
──────────────────────────────────────

活跃 Change：
  login-feature  planned    artifacts: draft ✓ proposal ✓ design ✓ specs ✓ tasks ✓ plans ✓
  payment-fix    started    artifacts: draft ✓

下一步：login-feature 等待 /alloy:apply，payment-fix 等待 /alloy:plan
```

---

## 十一、时间格式

统一使用本地时间 `YYYY-MM-DD HH:MM:SS`，无 `T`、无 `Z`、无时区偏移。

- Skill 中 `<TIMESTAMP>` 占位符由 Agent 执行 `date "+%Y-%m-%d %H:%M:%S"` 替换
- `.alloy.yaml` 存储的 `created_at` / `updated_at` 同此格式
