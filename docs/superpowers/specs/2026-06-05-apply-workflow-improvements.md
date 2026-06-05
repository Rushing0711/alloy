# Apply 阶段工作流改进

## Why

当前 `apply.md` 存在三个问题：

1. **Worktree 生命周期不完整**：create 在 apply，但 merge back + 清理缺失，导致 archive/finish 对 worktree 分支上的代码变更无感知
2. **executing-plans 路径审查不完整**：只有代码审查，缺少 spec 合规审查，代码可能偏离 spec
3. **执行策略选择标准模糊**：subagent vs executing-plans 的推荐出现在提示中，但没有区分场景，用户不知道如何抉择

## What

### 1. Worktree 生命周期规范化

**当前状态：** Create 在 apply Step 1，后续无 merge/cleanup。

**改为：** Worktree 是 apply 阶段的纯隔离工具，用完即焚。

```
apply Step 1 → 建 worktree（如果用户选择）
apply 5 个步骤执行完毕
apply 完成阶段 → 检测 worktree 状态
  ├─ 有 worktree → merge worktree 分支 → feature 分支
  │              → 删除 worktree 目录 + worktree 分支
  │              → 清除 worktree 状态
  └─ 无 worktree → 跳过

archive → 无感知（在 feature 分支上正常操作）
finish  → 无感知（merge feature 分支 → main）
```

**apply Step 1 提示文案（根因说明 + 决策引导）：**

```
> [Step 1/5] 隔离环境设置
>
> 当前在 feature/<name> 分支，未在隔离 worktree 中。
>
> 分支隔离的是提交历史，但同一时间只能有一个分支在工作目录里。
> Worktree 隔离的是工作目录——每个 worktree 有独立的文件副本，可同时 checkout 不同分支。
>
> 如果你的 feature 开发期间要切到其他分支（如修紧急 bug、切 main 查东西），
> worktree 让你无需 stash/commit 当前进度，直接进另一个目录操作。
>
> 你想创建隔离 worktree 吗？
>
>   > Would you like me to set up an isolated worktree?
>   > It protects your current branch from changes.
>
> - 是 → 创建 .claude/worktrees/<name> worktree，在隔离环境中实现
> - 否 → 在当前 feature/<name> 分支直接工作
>
> 加载 superpowers:using-git-worktrees 技能...
```

### 2. executing-plans 路径增加 Spec 合规审查

**当前：** TDD 设定 → executing-plans 执行 → code review

**改为：** TDD 设定 → executing-plans 执行 → Spec 合规审查 → code review

新增的 Spec 合规审查（轻量，非每 task 而是整体一次）：

> executing-plans 执行完成后，进行 Spec 合规审查
>
> 审查内容（由 Agent 自行检查，不加载额外技能）：
> 1. tasks.md 的每个 checkbox → 代码中是否有对应实现？
> 2. 代码中是否有 tasks.md 未要求的实现？（over-building）
> 3. plan.md 中明确排除的范围 → 代码是否碰了？
>
> 不通过 → 修复 → 重新审查 → 通过后进入 code review

code review 保持不变，仍通过 `superpowers:requesting-code-review` 技能执行。

### 3. 执行策略选择标准

**当前提示：** 只有推荐方案和理由，没有场景对照。

**改为（在 apply.md Step 2 中）：**

```
推荐方案：superpowers:subagent-driven-development（规划阶段建议）
理由：每个组件/hook 可独立测试，不共享可变状态，适合并行的 subagent 独立实现

选择哪个？

subagent-driven-development（推荐）
  适用场景：
  - 任务多（≥3 个）、相互独立
  - 涉及不同文件/模块，可并行
  - 适合：新功能、多组件改造、跨模块变更

executing-plans
  适用场景：
  - 任务少（1-2 个）、紧密耦合
  - 共享状态或同一文件、不可拆分
  - 适合：小修小改、重构单个模块、快速修复
```

### 4. Worktree 分支命名

`worktree-<change-name>` → `feature/<change-name>--wt`

命名规则：
- 前缀 `feature/` 与 feature 分支保持一致
- 中间 `--wt` 后缀区分 worktree 分支
- 完整示例：feature/add-login → feature/add-login--wt

## 涉及文件

| 文件 | 改动 |
|------|------|
| `commands/alloy/apply.md` | Step 1 提示文案 + worktree 生命周期清理逻辑 |
| `commands/alloy/apply.md` | Step 2 executing-plans 路径增加 spec 合规审查 |
| `commands/alloy/apply.md` | Step 2 执行策略选择标准文案 |
| `commands/alloy/archive.md` | 简化 worktree 相关提示（不再需要感知 worktree） |

## 不改动的文件

| 文件 | 原因 |
|------|------|
| `commands/alloy/finish.md` | 始终 merge feature 分支 → main，不感知 worktree，无变化 |
| `commands/alloy/start.md` | 分支创建逻辑不变 |

## 测试策略

- 不涉及 TypeScript 代码改动，只改 skill 文件（Markdown）
- 验证方式：人工走一遍 `/alloy:start` → `/alloy:plan` → `/alloy:apply`（有 worktree 和无 worktree 两种场景）→ `/alloy:archive` → `/alloy:finish`，确认流程正确
