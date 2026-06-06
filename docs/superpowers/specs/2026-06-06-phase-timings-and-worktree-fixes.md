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

### Fix A：保留的 python3 pipeline 增加 None 类型保护

主要路径（8 处 `started_at`/`completed_at` 写入）已通过 Fix B+C 直接消除，不再经过 python3 pipeline。仅在 2 处无法消除的复杂操作中加固：

**plan.md 回溯清理** — 需要删除多个 key + 重置值：
```python
content = sys.stdin.read().strip()
d = json.loads(content) if content and content != 'null' else {}
```

**plan.md DRAFT_RECORD 过滤** — records 字段的 json.loads 同样可能收到 `null`：
```python
content = sys.stdin.read().strip()
records = json.loads(content) if content and content != 'null' else []
```

`content and content != 'null'` 防止 `json.loads("null")` 返回 Python `None`。

### Fix B：新增 `_state merge` 子命令

在 `stateCommand` 中新增 `merge` action，支持深层合并而非替换：

```
用法: alloy _state merge <change-dir> <field> <partial-json>

示例:
  alloy _state merge ... phase_timings '{"apply":{"started_at":"..."}}'
```

语义：读取 `state[field]`（必须是 object 或 null/undefined），对传入的 partial-json 做递归合并，写回。

实现策略（幂等语义——已有 leaf 不覆盖）：

```typescript
function deepMerge(target: unknown, source: unknown): unknown {
  // null/undefined/primitive → replace
  if (target === null || target === undefined) return source;
  if (source === null) return source;
  if (typeof target !== "object" || typeof source !== "object") return source;
  if (Array.isArray(target) || Array.isArray(source)) return source;

  const result = { ...(target as Record<string, unknown>) };
  const src = source as Record<string, unknown>;

  for (const key of Object.keys(src)) {
    if (!(key in result)) {
      result[key] = src[key];           // 新 key：直接添加
    } else if (
      // 双方都是嵌套对象 → 递归
      typeof src[key] === "object" && src[key] !== null &&
      !Array.isArray(src[key]) &&
      typeof result[key] === "object" && result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], src[key]);
    }
    // else：已有 leaf → 跳过（幂等，不覆盖）
  }
  return result;
}
```

这消除所有 bash+python merge pipeline 的脆弱性。Merge 语义：新 key 追加、已有 leaf 不覆盖、数组整体替换、字段不存在时等价于 write。

### Fix C：skill 文件 phase_timings 写入换用 `_state merge`

5 个 skill 文件共 8 处 `started_at`/`completed_at` 写入由 python3 pipeline 替换为单行 `alloy _state merge`：

```bash
alloy _state merge openspec/changes/<name> phase_timings "{\"phase\":{\"key\":\"$TIMESTAMP\"}}"
```

**保留 2 处 python3 pipeline**（加 None 安全保护）：
- plan.md 回溯清理（需删除多个 key + 重置值，merge 语义不支持删除）
- plan.md DRAFT_RECORD 过滤（records 数组过滤，非 phase_timings 写入）

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

### Fix E：worktree fallback 路径检测健壮化

EnterWorktree 失败后（`using-git-worktrees` 技能回退至 Step 1b），`else` 分支不再假定 `cd .worktrees/<name>` 一定成功，先检测目录是否存在：

```bash
WT_DIR=".worktrees/<name>"
if [ -d "$WT_DIR" ]; then
  WORKTREE_PATH=$(cd "$WT_DIR" 2>/dev/null && pwd -P)
  if [ -n "$WORKTREE_PATH" ]; then
    WORKTREE_BRANCH=$(cd "$WORKTREE_PATH" && git branch --show-current)
    # 写 worktree 路径和分支到 state
  fi
fi
```

用 `[ -d "$WT_DIR" ]` 预检替代直接 `cd`，消除 `no such file or directory` 错误。

## 影响范围

| 文件 | 改动 |
|------|------|
| `src/core/types.ts` | `feature_branch?` / `worktree_branch?` 类型扩展为 `string \| null` |
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
- TypeScript 接口 `AlloyState` 的 `feature_branch?` 和 `worktree_branch?` 从 `string` 扩展为 `string | null`（配套 `createInitialState` 设 null 的编译要求）
