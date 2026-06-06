---
title: phase_timings 丢失与 Worktree 创建问题修复
date: 2026-06-06
status: draft
---

# phase_timings 丢失与 Worktree 创建问题修复

## 问题清单

### 1. phase_timings pipeline NPE（P0 阻断）

**现象：** start/plan 阶段的 phase_timings 在 apply 阶段被覆盖丢失。

**根因：** python3 merge pipeline 中 `json.loads("null")` 返回 Python `None`，不是 `{}`：

```python
content = sys.stdin.read()
d = json.loads(content) if content.strip() else {}  # "null" → None
p = d.setdefault('start',{})  # AttributeError: 'NoneType' has no attribute 'setdefault'
```

`_state read` 在字段不存在时输出字符串 `"null"` 并退出码 0，bash 的 `|| echo "{}"` 不触发。Agent 收到报错后可能跳过写入或手动写入不完整数据。

**影响范围：** start.md、plan.md、apply.md、archive.md、finish.md 中所有使用 `TIMINGS=$(...) | python3 ... | while read -r val` 管道的 `phase_timings` 写入点（共 9 个位置）。

### 2. `_state` 命令缺少原子化子字段更新（P1）

**根因：** `_state write phase_timings` 整体替换该字段，不支持深层 merge。Agent 必须通过复杂的 bash+python 管道读→改→写，流程脆弱。

**影响：** 任何一步管道出错都会导致 phase_timings 被部分覆盖。

### 3. `_guard` 前 state 脏状态（P1）

**根因：** plan 阶段结束前 `_guard planned --apply` 时 `.alloy.yaml` 有未提交修改（`M` 状态），guard 报 HARD STOP。

**影响：** 阻塞流程，Agent 需手动处理脏状态。

### 4. EnterWorktree 失败后 fallback 不健壮（P1）

**根因：** `EnterWorktree` 原生工具因 git 仓库检测失败。Agent 回退到 Step 1b 使用 `git worktree add`，但：
- worktree 路径变为 `.worktrees/` 而非设计的 `.claude/worktrees/`
- `cd .worktrees/<name>` 时目录尚未创建 → 报错

### 5. YAML 字段分散且不全（P2）

**根因：** `createInitialState()` 不包含 `feature_branch` 和 `worktree_branch`，JavaScript 按插入顺序序列化导致字段分散。

## 修复方案

### Fix A：python3 pipeline 增加 None 类型保护

所有 `json.loads` 调用处增加 `None` 检查：

```python
d = json.loads(content) if content and content.strip() and content.strip() != 'null' else {}
```

改为更健壮的防御式写法：

```python
import sys, json
content = sys.stdin.read().strip()
d = {}
if content:
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            d = parsed
    except json.JSONDecodeError:
        pass
```

这样无论 `null`、`{}`、空串还是非法 JSON，都安全降级为空 dict。

### Fix B：新增 `_state merge` 子命令

在 `stateCommand` 中新增 `merge` action，支持深层合并而非替换：

```
用法: alloy _state merge <change-dir> <field> <partial-json>

示例:
  alloy _state merge ... phase_timings '{"apply":{"started_at":"..."}}'
```

语义：读取 `state[field]`（必须是 object 或 null/undefined），对传入的 partial-json 做递归合并，写回。

实现策略：

```typescript
function deepMerge(target: any, source: any): any {
  if (typeof target !== 'object' || target === null) return source;
  if (typeof source !== 'object' || source === null) return target;
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
```

这消除所有 bash+python merge pipeline 的脆弱性。

### Fix C：skill 文件 phase_timings 写入全部换用 `_state merge`

替换 start.md、plan.md、apply.md、archive.md、finish.md 中所有：

```bash
TIMINGS=$(alloy _state read ... phase_timings ...)
echo "$TIMINGS" | python3 -c "..." | while read -r val; do ...
```

为：

```bash
alloy _state merge ... phase_timings '{"phase_key":{"started_at":"...","completed_at":"..."}}'
```

### Fix D：createInitialState 预声明所有字段（P2）

```typescript
export function createInitialState(): AlloyState {
  return {
    phase: "started",
    worktree: null,
    feature_branch: null,
    worktree_branch: null,
    schema_version: 1,
    created_at: now,
    updated_at: now,
    records: [],
  };
}
```

确保 YAML 字段顺序固定，且 `feature_branch` / `worktree_branch` 与 `worktree` 相邻。

### Fix E：worktree 路径标准化与检测健壮化

EnterWorktree 失败后的 fallback 流程：

1. 确认当前在 git repo 根目录
2. `git worktree add .claude/worktrees/<name> -b worktree-<name>`
3. 验证目录已创建
4. 从 worktree 实际路径检测分支名然后写入 state

不依赖相对路径假定。

## 影响范围

| 文件 | 改动 |
|------|------|
| `src/cli/commands/internal/state.ts` | 新增 `merge` action，deepMerge 函数 |
| `src/cli/utils/state.ts` | `createInitialState()` 预声明 feature_branch/worktree_branch |
| `commands/alloy/start.md` | phase_timings 写入改用 `_state merge`，兼容 SESSION_START 变量 |
| `commands/alloy/plan.md` | 同上 + guard 前确保 state 干净 |
| `commands/alloy/apply.md` | phase_timings 写入改用 `_state merge` + worktree fallback 健壮化 + EnterWorktree 路径指定 |
| `commands/alloy/archive.md` | phase_timings 写入改用 `_state merge` |
| `commands/alloy/finish.md` | phase_timings 写入改用 `_state merge` |
| `test/cli/state.test.ts` | 新增 deepMerge 测试 + merge 子命令测试 |

## 不涉及

- Guard 的 HARD STOP 逻辑保留不变（脏状态检测是安全的）
- `_state write` 的现有行为不变，`merge` 是新增加的，不是替换
- TypeScript 接口 `AlloyState` 不修改（`feature_branch?` 和 `worktree_branch?` 已经是可选字符串）
