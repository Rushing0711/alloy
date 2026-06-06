---
title: 分支与 Worktree 体系重新设计
date: 2026-06-06
status: draft
---

# 分支与 Worktree 体系重新设计

## 问题

当前 `main_branch`、`feature_branch`、`worktree` 三个概念的关系不清晰，存在以下问题：

1. **`feature_branch` 写入但从未读取** — start.md 写入 `.alloy.yaml`，但 apply.md 全篇硬编码 `feature/<name>`，不读 state。
2. **start.md 执行顺序 Bug** — 步骤 3 写入 state 时 change 目录尚未创建（步骤 4 的 `/opsx:new` 才创建），导致 ENOENT。
3. **worktree 路径显示不一致** — apply.md 完成汇总显示 `.claude/worktrees/<name>/`，但实际路径取决于 worktree 创建机制。
4. **worktree 分支名不可预测** — `EnterWorktree` 原生工具使用 `worktree-<name>`，`git worktree add` 后备分支名未定义，Agent 自决。

## 数据模型

### AlloyState 字段

| 字段 | 类型 | 级别 | 存储位置 | 含义 |
|------|------|------|---------|------|
| `main_branch` | `string` | 项目级 | `openspec/config.yaml` | 主干分支名，自动检测 + 用户确认 |
| `feature_branch` | `string?` | change 级 | `.alloy.yaml` | 本 change 的开发分支 |
| `worktree` | `string\|null` | change 级 | `.alloy.yaml`（已有） | worktree 目录路径 |
| `worktree_branch` | `string?` | change 级 | `.alloy.yaml`（新增） | worktree 内 checkout 的分支名 |

### 字段生命周期

```
start.md → write feature_branch     → 有值
         → write worktree: null

apply.md Step 1 → 创建 worktree
                → 检测实际分支 → write worktree_branch
                → 检测实际路径 → write worktree: "<path>"

apply.md 完成 → merge worktree_branch → feature_branch
              → git worktree remove worktree_path
              → write worktree: null
              → write worktree_branch: null
```

### 取值矩阵

| 状态 | `worktree` | `worktree_branch` |
|------|-----------|------------------|
| 初始（刚 start） | `null` | 不存在 |
| 用户选择不创建 | `"skipped"` | 不存在 |
| worktree 已创建 | `".claude/worktrees/<name>/"` | `"worktree-<name>"` |
| apply 完成清理后 | `null` | 不存在 |

## 命名规范

### 分支名 — 全场景统一

```
worktree_branch = "worktree-" + <change-name>
```

| 创建机制 | 分支名结果 |
|---------|-----------|
| `EnterWorktree`（原生工具） | `worktree-<name>` |
| `git worktree add`（后备） | `worktree-<name>`（apply.md 显式指定） |

### 路径 — 按环境分开

```
Claude 环境（有 EnterWorktree 工具或 .claude/ 目录）:
  .claude/worktrees/<name>/

非 Claude 环境（Cursor / CodeX / OpenCode 等）:
  .worktrees/<name>/
```

Agent 自我判别，将目录偏好传递给 worktree 技能。

## 流程改动

### start.md — 修复执行顺序

**当前：** 步骤 3 写入 state → 步骤 4 `/opsx:new` 创建目录 → 步骤 5 `_state init` 覆盖

**改为：**

```
P: /opsx:new <name>          → 创建 change 目录
Q: alloy _state init          → 创建 .alloy.yaml（含 records: []）
R: alloy _state write ... feature_branch "<分支名>"
   alloy _state write ... worktree null
```

### apply.md Step 1 — 去重 + 统一命名 + 事后检测

幂等检查（已有逻辑不变）。null 时：

1. 读取 `feature_branch`，展示摘要
2. 判断环境（Claude / 非 Claude）确定目录偏好
3. 加载 `superpowers:using-git-worktrees` 技能
   - 传入分支名 `worktree-<name>` 和目录偏好
4. 技能执行
5. 创建后检测：
   ```bash
   cd <worktree_path>
   BRANCH=$(git branch --show-current)
   alloy _state write ... worktree_branch "$BRANCH"
   ```
6. 写入 `worktree: "<实际路径>"`

### apply.md 全篇 — 去硬编码

全文搜索 `feature/<name>`，替换为从 state 读取：

| 位置 | 替换前 | 替换后 |
|------|--------|--------|
| 文案 | 当前在 feature/\<name\> 分支 | 当前在 \<feature_branch\> 分支 |
| 文案 | 源分支: feature/\<name\> | 源分支: \<feature_branch\> |
| 完成 merge | `git merge "feature/<name>--wt"` | `git merge "$(alloy _state read ... worktree_branch)"` |
| 完成删分支 | `git branch -d "feature/<name>--wt"` | `git branch -d "$(alloy _state read ... worktree_branch)"` |

### apply.md 完成 — 从 state 读分支信息

```bash
WORKTREE_PATH=$(alloy _state read ... worktree)
FEATURE_BRANCH=$(alloy _state read ... feature_branch)
WORKTREE_BRANCH=$(alloy _state read ... worktree_branch)

if [ "$WORKTREE_PATH" != "null" ] && [ -n "$WORKTREE_PATH" ] && [ "$WORKTREE_PATH" != "skipped" ]; then
  cd "$MAIN_ROOT"
  git merge "$WORKTREE_BRANCH" --no-edit
  git worktree remove "$WORKTREE_PATH"
  git branch -d "$WORKTREE_BRANCH"
  alloy _state write ... worktree null
  alloy _state write ... worktree_branch null
fi
```

### apply.md 完成汇总

```
> Worktree 路径: <从 state.worktree 读取>
```

### init.ts — 补充 .gitignore

```typescript
const GITIGNORE_RULES = [
  ".worktrees/",
  ".claude/worktrees/",
  // ...
];
```

## 影响范围

| 文件 | 改动 |
|------|------|
| `src/core/types.ts` | 新增 `worktree_branch?: string` 字段 |
| `src/cli/commands/init.ts` | `.gitignore` 补充 `.claude/worktrees/` |
| `commands/alloy/start.md` | 修复步骤顺序（`/opsx:new` → `_state init` → `_state write`） |
| `commands/alloy/apply.md` | Step 1 事后检测 + 全篇去硬编码 + 完成从 state 读分支 |
| `tests/` | 验证新字段序列化、worktree 创建后检测流程 |

## 向下兼容

- 遗留 change 无 `feature_branch` 字段 → `alloy _state read` 返回 null → 退回到 `feature/<name>` 硬编码
- 遗留 `worktree` 字段（仅路径，无 `worktree_branch`）→ 完成合并直接退回到假设 `worktree-<name>` 为分支名
