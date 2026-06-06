# phase_timings 丢失与 Worktree 创建问题 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 phase_timings pipeline NPE、worktree 创建不健壮、YAML 字段分散三个问题

**Architecture:** 新增 `_state merge` 子命令（深层合并替代脆弱 bash+python 管道）；5 个 skill 文件 phase_timings 写入点换用 merge；`createInitialState()` 预声明所有字段固定 YAML 排序；apply.md worktree fallback 流程健壮化

**Tech Stack:** TypeScript (Node.js), YAML, bash/CLI

---

### Task 1: 新增 `_state merge` 子命令 + deepMerge 函数

**Files:**
- Modify: `src/cli/commands/internal/state.ts:94-97`（添加 `merge` case）
- Test: `test/cli/state.test.ts`（新增 deepMerge 测试）

- [ ] **Step 1: 实现 deepMerge 函数并添加到 stateCommand**

在 `stateCommand` 函数上方添加 `deepMerge` 函数：

```typescript
function deepMerge(target: unknown, source: unknown): unknown {
  if (target === null || target === undefined) return source;
  if (source === null) return source;
  if (typeof target !== "object" || typeof source !== "object") return source;
  if (Array.isArray(target) || Array.isArray(source)) return source;

  const result: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  const src = source as Record<string, unknown>;

  for (const key of Object.keys(src)) {
    if (!(key in result)) {
      // 新 key：直接添加
      result[key] = src[key];
    } else if (
      typeof src[key] === "object" &&
      src[key] !== null &&
      !Array.isArray(src[key]) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      // 双方都是对象：递归合并（已有嵌套 key 不被覆盖）
      result[key] = deepMerge(result[key], src[key]);
    }
    // else: key 在两边都存在且至少一方是 leaf → 跳过（幂等）
  }
  return result;
}
```

在 `switch` 中新增 `merge` case（放在 `write` 和 `check` 之间）：

```typescript
case "merge": {
  const field = args[2];
  const value = args[3];
  if (!field || value === undefined) {
    console.error("用法: alloy _state merge <change-dir> <field> <partial-json>");
    process.exit(1);
  }
  let state: AlloyState;
  try {
    state = await readState(changeDir);
  } catch {
    state = createInitialState();
  }
  const currentValue = (state as unknown as Record<string, unknown>)[field];
  const parsedValue = coerceValue(field, value);
  (state as unknown as Record<string, unknown>)[field] = deepMerge(currentValue, parsedValue);
  await writeState(changeDir, state);
  console.log(`✓ ${field} 已 merge: ${changeDir}`);
  break;
}
```

并在 `_state` 文档/help 字符串中更新用法说明。

- [ ] **Step 2: 写 deepMerge 单元测试**

在 `test/cli/state.test.ts` 的 `describe("state utils")` 区块末尾新增：

```typescript
describe("deepMerge", () => {
  // deepMerge 不对外暴露，通过 stateCommand 间接测试时通过 _state merge 调用
  // 这里直接测试 merge 行为

  it("merge 新字段到空 target 返回 source", () => {
    const { stateCommand } = await import("../../src/cli/commands/internal/state.js");
    // 用工具函数方式测试
  });
});
```

实际上直接写集成测试更可靠。在 `describe("state utils")` 末尾添加：

```typescript
it("_state merge 可追加新字段", async () => {
  const changeDir = join(tmpDir, "merge-add");
  await mkdir(changeDir, { recursive: true });
  // 先用 write 写入 phase_timings.start
  const state = createInitialState();
  state.phase_timings = { start: { started_at: "2026-06-06 08:00:00", completed_at: "2026-06-06 09:00:00" } };
  await writeState(changeDir, state);

  // merge 追加 plan 阶段
  const { stateCommand } = await import("../../src/cli/commands/internal/state.js");
  await stateCommand(["_state", "merge", changeDir, "phase_timings", JSON.stringify({ plan: { started_at: "2026-06-06 09:30:00" } })]);

  const loaded = await readState(changeDir);
  expect(loaded.phase_timings?.start).toBeDefined();
  expect(loaded.phase_timings?.start?.started_at).toBe("2026-06-06 08:00:00");
  expect(loaded.phase_timings?.plan).toBeDefined();
  expect(loaded.phase_timings?.plan?.started_at).toBe("2026-06-06 09:30:00");
});

it("_state merge 不覆盖已有 leaf 值", async () => {
  const changeDir = join(tmpDir, "merge-idempotent");
  await mkdir(changeDir, { recursive: true });
  const state = createInitialState();
  state.phase_timings = { start: { started_at: "2026-06-06 08:00:00" } };
  await writeState(changeDir, state);

  // merge 尝试覆盖已有的 started_at
  const { stateCommand } = await import("../../src/cli/commands/internal/state.js");
  await stateCommand(["_state", "merge", changeDir, "phase_timings", JSON.stringify({ start: { started_at: "SHOULD_NOT_OVERWRITE" } })]);

  const loaded = await readState(changeDir);
  expect(loaded.phase_timings?.start?.started_at).toBe("2026-06-06 08:00:00");
});

it("_state merge 嵌套对象递归合并", async () => {
  const changeDir = join(tmpDir, "merge-nested");
  await mkdir(changeDir, { recursive: true });
  const state = createInitialState();
  state.phase_timings = { start: { started_at: "08:00", completed_at: "09:00" } };
  await writeState(changeDir, state);

  const { stateCommand } = await import("../../src/cli/commands/internal/state.js");
  // 追加 plan.started_at，不碰 start
  await stateCommand(["_state", "merge", changeDir, "phase_timings", JSON.stringify({ plan: { started_at: "09:30" } })]);

  const loaded = await readState(changeDir);
  expect(loaded.phase_timings?.start?.started_at).toBe("08:00");
  expect(loaded.phase_timings?.start?.completed_at).toBe("09:00");
  expect(loaded.phase_timings?.plan?.started_at).toBe("09:30");
});

it("_state merge phase_timings 字段不存在时等价于 write", async () => {
  const changeDir = join(tmpDir, "merge-from-scratch");
  await mkdir(changeDir, { recursive: true });
  const state = createInitialState();
  await writeState(changeDir, state); // 无 phase_timings

  const { stateCommand } = await import("../../src/cli/commands/internal/state.js");
  await stateCommand(["_state", "merge", changeDir, "phase_timings", JSON.stringify({ apply: { started_at: "10:00" } })]);

  const loaded = await readState(changeDir);
  expect(loaded.phase_timings?.apply?.started_at).toBe("10:00");
});
```

- [ ] **Step 3: 运行测试确认通过**

Run: `npx vitest run test/cli/state.test.ts --reporter=verbose`
Expected: 所有测试 PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/internal/state.ts test/cli/state.test.ts
git commit -m "feat: 新增 _state merge 子命令支持深层合并

新增 deepMerge 函数实现非破坏性深层合并：
- 新 key 追加到已有对象
- 已有 leaf 值不被覆盖（幂等）
- 数组整体替换而非合并
- 字段不存在时等价于 write

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: fix createInitialState 预声明字段 + 更新测试

**Files:**
- Modify: `src/cli/utils/state.ts:15-25`
- Modify: `test/cli/state.test.ts:129-131, 161-163`

- [ ] **Step 1: 更新 createInitialState**

将 `feature_branch` 和 `worktree_branch` 预声明为 `null`，与 `worktree` 相邻：

```typescript
export function createInitialState(): AlloyState {
  const now = formatTimestamp();
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

这样 YAML 输出字段顺序固定为：`phase > worktree > feature_branch > worktree_branch > schema_version > created_at > updated_at > records`。

- [ ] **Step 2: 更新测试断言**

文件 `test/cli/state.test.ts` 需要改两处：

第 131 行：`expect(state.feature_branch).toBeUndefined()` → `expect(state.feature_branch).toBeNull()`

第 163 行：`expect(state.worktree_branch).toBeUndefined()` → `expect(state.worktree_branch).toBeNull()`

- [ ] **Step 3: 运行测试**

Run: `npx vitest run test/cli/state.test.ts --reporter=verbose`
Expected: 测试全部 PASS（含 `readState 无 feature_branch 时返回 undefined` 的向后兼容测试）

- [ ] **Step 4: Commit**

```bash
git add src/cli/utils/state.ts test/cli/state.test.ts
git commit -m "refactor: createInitialState 预声明 feature_branch/worktree_branch

预声明为 null 确保 YAML 字段顺序固定，worktree 相关字段相邻。
保留向后兼容：旧 YAML 文件无这些字段时 readState 返回 undefined。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 替换 start.md phase_timings pipeline 为 `_state merge`

**Files:**
- Modify: `commands/alloy/start.md`

- [ ] **Step 1: 替换 step 5 的 phase_timings.start.started_at 写入**

原有代码（line 223-232）：

```bash
TIMINGS=$(alloy _state read openspec/changes/<name> phase_timings 2>/dev/null || echo "{}")
echo "$TIMINGS" | python3 -c "
import sys,json
content = sys.stdin.read()
d = json.loads(content) if content.strip() else {}
p = d.setdefault('start',{})
if 'started_at' not in p:
    p['started_at']='$SESSION_START'
print(json.dumps(d))
" | while read -r val; do alloy _state write openspec/changes/<name> phase_timings "$val"; done
```

替换为：

```bash
alloy _state merge openspec/changes/<name> phase_timings "{\"start\":{\"started_at\":\"$SESSION_START\"}}"
```

- [ ] **Step 2: 替换 step 8 的 phase_timings.start.completed_at 写入**

原有代码（line 256-264）：

```bash
TIMINGS=$(alloy _state read openspec/changes/<name> phase_timings 2>/dev/null || echo "{}")
echo "$TIMINGS" | python3 -c "
import sys,json
content = sys.stdin.read()
d = json.loads(content) if content.strip() else {}
p = d.setdefault('start',{})
p['completed_at']='$COMPLETED_AT'
print(json.dumps(d))
" | while read -r val; do alloy _state write openspec/changes/<name> phase_timings "$val"; done
```

替换为：

```bash
alloy _state merge openspec/changes/<name> phase_timings "{\"start\":{\"completed_at\":\"$COMPLETED_AT\"}}"
```

- [ ] **Step 3: Commit**

```bash
git add commands/alloy/start.md
git commit -m "fix: start.md phase_timings 写入改用 _state merge

消除 bash+python 管道的 NPE 风险（json.loads('null') → None）。
利用 _state merge 的幂等语义：已有 started_at 不被覆盖，支持断点恢复。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 替换 plan.md phase_timings pipeline 为 `_state merge`

**Files:**
- Modify: `commands/alloy/plan.md`

- [ ] **Step 1: 替换 step 1 的 plan.started_at 写入**

Line 54-63 → 替换为：
```bash
alloy _state merge openspec/changes/<name> phase_timings "{\"plan\":{\"started_at\":\"$PHASE_START\"}}"
```

- [ ] **Step 2: 替换 plans 完成时的 plan.completed_at 写入**

Line 221-230 → 替换为：
```bash
alloy _state merge openspec/changes/<name> phase_timings "{\"plan\":{\"completed_at\":\"$COMPLETED_AT\"}}"
```

- [ ] **Step 3: 修复回溯清理的 pipeline（None 类型安全）**

Line 305-316 的回溯清理需要覆盖已有值（删除 plan/apply/archive/finish 键 + 重置 start.completed_at）。保留 python3 pipeline 但加 None 安全保护：

```bash
TIMINGS=$(alloy _state read openspec/changes/<name> phase_timings 2>/dev/null || echo "{}")
echo "$TIMINGS" | python3 -c "
import sys,json
content = sys.stdin.read().strip()
d = json.loads(content) if content and content != 'null' else {}
for k in ['plan','apply','archive','finish']:
    d.pop(k, None)
if 'start' in d:
    d['start']['completed_at'] = None
print(json.dumps(d))
" | while read -r val; do alloy _state write openspec/changes/<name> phase_timings "$val"; done
```

注意：`content and content != 'null'` 替代原有的 `content.strip()`，防止 `json.loads("null")` 返回 None。

- [ ] **Step 4: Commit**

```bash
git add commands/alloy/plan.md
git commit -m "fix: plan.md phase_timings 写入改用 _state merge

简单追加（started_at/completed_at）用 merge 替代。
回溯清理（需删除 key + overwrite）保留 python3 pipeline 但增加 None 安全保护。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 替换 apply.md phase_timings pipeline + worktree fallback 健壮化

**Files:**
- Modify: `commands/alloy/apply.md`

- [ ] **Step 1: 替换 apply.started_at 写入**

Line 79-88 → 替换为：
```bash
alloy _state merge openspec/changes/<name> phase_timings "{\"apply\":{\"started_at\":\"$PHASE_START\"}}"
```

- [ ] **Step 2: 替换 apply.completed_at 写入**

Line 441-449 → 替换为：
```bash
alloy _state merge openspec/changes/<name> phase_timings "{\"apply\":{\"completed_at\":\"$COMPLETED_AT\"}}"
```

- [ ] **Step 3: EnterWorktree 失败后的 fallback 健壮化**

在 Step 1/5 的 `using-git-worktrees` 技能执行后的检测逻辑中，确认 worktree 创建成功后才 `cd`：

```bash
if [ "$GIT_DIR" != "$GIT_COMMON" ]; then
  # 已在 worktree 中
  WORKTREE_PATH=$(cd "$(git rev-parse --show-toplevel)" 2>/dev/null && pwd -P)
  WORKTREE_BRANCH=$(cd "$WORKTREE_PATH" && git branch --show-current)
  alloy _state write openspec/changes/<name> worktree "$WORKTREE_PATH"
  alloy _state write openspec/changes/<name> worktree_branch "$WORKTREE_BRANCH"
  echo "  ✓ worktree 已记录: 分支=$WORKTREE_BRANCH  路径=$WORKTREE_PATH"
else
  # 检测是否通过 git worktree add 在 .worktrees/ 下创建了目录
  WT_DIR=".worktrees/<name>"
  if [ -d "$WT_DIR" ] && git rev-parse --git-dir >/dev/null 2>&1; then
    WORKTREE_PATH=$(cd "$WT_DIR" 2>/dev/null && pwd -P)
    if [ -n "$WORKTREE_PATH" ]; then
      WORKTREE_BRANCH=$(cd "$WORKTREE_PATH" && git branch --show-current)
      alloy _state write openspec/changes/<name> worktree "$WORKTREE_PATH"
      alloy _state write openspec/changes/<name> worktree_branch "$WORKTREE_BRANCH"
      echo "  ✓ worktree fallback 已记录: 分支=$WORKTREE_BRANCH  路径=$WORKTREE_PATH"
    else
      echo "  ℹ 未检测到 worktree，按用户选择记录"
      alloy _state write openspec/changes/<name> worktree skipped
    fi
  else
    echo "  ℹ 未检测到 worktree，按用户选择记录"
    alloy _state write openspec/changes/<name> worktree skipped
  fi
fi
```

关键改动：`else` 分支不再假设 `cd .worktrees/<name>` 一定成功，先检查目录是否存在。

- [ ] **Step 4: Commit**

```bash
git add commands/alloy/apply.md
git commit -m "fix: apply.md phase_timings 换用 merge + worktree fallback 健壮化

phase_timings 写入改用 _state merge 消除 NPE 风险。
worktree fallback 路径检测改为先验证目录存在再 cd，消除 'no such file or directory' 错误。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 替换 archive.md phase_timings pipeline 为 `_state merge`

**Files:**
- Modify: `commands/alloy/archive.md`

- [ ] **Step 1: 替换 archive.started_at 写入**

Line 34-42 → 替换为：
```bash
alloy _state merge openspec/changes/<name> phase_timings "{\"archive\":{\"started_at\":\"$PHASE_START\"}}"
```

- [ ] **Step 2: 替换 archive.completed_at 写入**

Line 126-135 → 替换为：
```bash
alloy _state merge "$ARCHIVE_DIR" phase_timings "{\"archive\":{\"completed_at\":\"$COMPLETED_AT\"}}"
```

注意：archive.md 的 completed_at 使用 `$ARCHIVE_DIR` 变量而非 `openspec/changes/<name>`。

- [ ] **Step 3: Commit**

```bash
git add commands/alloy/archive.md
git commit -m "fix: archive.md phase_timings 写入改用 _state merge

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: 替换 finish.md phase_timings pipeline 为 `_state merge`

**Files:**
- Modify: `commands/alloy/finish.md`

- [ ] **Step 1: 替换 finish.started_at 写入**

Line 32-41 → 替换为：
```bash
alloy _state merge openspec/changes/<name> phase_timings "{\"finish\":{\"started_at\":\"$PHASE_START\"}}"
```

- [ ] **Step 2: 替换 finish.completed_at 写入**

Line 193-202 → 替换为：
```bash
alloy _state merge openspec/changes/<name> phase_timings "{\"finish\":{\"completed_at\":\"$COMPLETED_AT\"}}"
```

- [ ] **Step 3: Commit**

```bash
git add commands/alloy/finish.md
git commit -m "fix: finish.md phase_timings 写入改用 _state merge

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: 构建 + 全量测试验证

- [ ] **Step 1: 构建 dist**

Run: `npm run build`
Expected: 编译成功，无错误

- [ ] **Step 2: 全量测试**

Run: `npm test`
Expected: 所有测试 PASS

- [ ] **Step 3: 验证 `_state merge` CLI 可用**

```bash
node dist/cli/index.js _state merge 2>&1 | grep -q "用法" && echo "✓ CLI help OK"
```

Expected: 显示用法提示

- [ ] **Step 4: Commit（如有必要）**

```bash
git add -A
git commit -m "chore: 构建 + 全量测试通过后提交产物"
```

---

### 执行中的附带修复（未在原始计划中）

| 发现项 | Task | 修复 |
|--------|------|------|
| `types.ts` 类型不兼容 null | 2（构建报错） | `feature_branch?` / `worktree_branch?` → `string \| null` |
| apply.md 行 211 注释文本重复 | 5（审查发现） | 去重 |
| plan.md DRAFT_RECORD pipeline 缺 None 保护 | 最终审查发现 | `content and content != 'null'` 加固 |
