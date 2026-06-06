# 分支与 Worktree 体系重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 main_branch / feature_branch / worktree / worktree_branch 数据模型，修复 start.md 执行顺序 Bug，apply.md 全篇去硬编码改用 state 驱动。

**Architecture:** 四个字段按级别分散（项目级 config / change 级 state），worktree 创建后检测实际值写入 state，完成时从 state 读取操作。向下兼容遗留 change。

**Tech Stack:** TypeScript（`src/`），Markdown Skill 文件（`commands/alloy/`），vitest 测试

---

### Task 1: types.ts — 新增 worktree_branch 字段

**Files:**
- Modify: `src/core/types.ts:69-78`

- [ ] **Step 1: 在 AlloyState 接口中新增 worktree_branch 字段**

```typescript
export interface AlloyState {
  phase: "started" | "planned" | "applied" | "archived" | "finished";
  worktree: string | null;
  worktree_branch?: string;       // 新增：worktree 内 checkout 的分支名
  feature_branch?: string;        // 已有
  schema_version: number;
  created_at: string;
  updated_at: string;
  phase_timings?: PhaseTimings;
  records: ArtifactRecord[];
}
```

- [ ] **Step 2: 运行测试确认原有测试不因字段新增而失败**

Run: `npm test`
Expected: 274 passed

---

### Task 2: init.ts — 补充 .claude/worktrees/ 到 .gitignore

**Files:**
- Modify: `src/cli/commands/init.ts:40`

- [ ] **Step 1: 修改 GITIGNORE_RULES 常量**

```typescript
const GITIGNORE_RULES = [
  "docs/superpowers/",
  ".worktrees/",
  "worktrees/",
  ".claude/worktrees/",   // 新增
  "*.local.*",
  ".superpowers/",
];
```

---

### Task 3: start.md — 修复步骤执行顺序

**Files:**
- Modify: `commands/alloy/start.md`（约 210-240 行区域）

**当前顺序（有 Bug）：**
```
Step 3: 分支选择 → alloy _state write feature_branch + worktree null  ← 目录不存在！
Step 4: /opsx:new <name>   → 创建 change 目录
Step 5: alloy _state init   → 创建 .alloy.yaml（覆盖 step 3 写入）
```

**改为：**

- [ ] **Step 1: 调整 start.md 中步骤顺序**

将顺序改为：

```
3. 分支选择 → 切换分支完成（不写 state）
4. 调用 /opsx:new <name> → 创建 change 目录
5. **写入 state** — alloy _state init → 创建 .alloy.yaml（含 records: []）
6. **记录分支信息** — 
   alloy _state write ... feature_branch "<name>"
   alloy _state write ... worktree null
7. 按模板生成 draft.md
8. 提交
```

具体改动：

移除步骤 3 末尾的 state 写入（行 216-218）：
```
alloy _state write openspec/changes/<name> feature_branch <branch-name>
alloy _state write openspec/changes/<name> worktree null
```

在步骤 5（`_state init`）之后新增步骤 6，写入 feature_branch 和 worktree null。

步骤重新编号：原 6（draft.md）→ 7，原 7（提交）→ 8。

---

### Task 4: apply.md Step 1 — 事后检测 worktree_branch 和 worktree

**Files:**
- Modify: `commands/alloy/apply.md`（约 163-210 行区域）

- [ ] **Step 1: 在技能执行完成后，新增事后检测逻辑**

在 skill 执行完成后（当前行 186-188 区域），新增检测步骤：

```bash
echo "  正在检测 worktree 实际状态..."

# 检测 worktree 路径：从 git worktree list 获取当前 worktree 路径
WORKTREE_LIST=$(git worktree list --porcelain 2>/dev/null)
echo "$WORKTREE_LIST" | while read -r line; do
  if echo "$line" | grep -q "^worktree "; then
    # 主仓库路径
    MAIN_ROOT=$(echo "$line" | cut -d' ' -f2-)
    break
  fi
done

# 判断是否创建了 worktree：检查 GIT_DIR != GIT_COMMON
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)

if [ "$GIT_DIR" != "$GIT_COMMON" ]; then
  # 已在 worktree 中
  WORKTREE_PATH=$(git rev-parse --show-toplevel)
  WORKTREE_BRANCH=$(git branch --show-current)
  alloy _state write openspec/changes/<name> worktree "$WORKTREE_PATH"
  alloy _state write openspec/changes/<name> worktree_branch "$WORKTREE_BRANCH"
  echo "  ✓ worktree 已记录: $WORKTREE_BRANCH @ $WORKTREE_PATH"
fi
```

- [ ] **Step 2: 确认去重修改后的 Step 1 逻辑完整**

验证流程：
```
幂等检查（null）→ 展示摘要 → 加载 worktree 技能 → 技能执行 →
事后检测（git worktree list 或 GIT_DIR vs GIT_COMMON）→ 
写入 worktree + worktree_branch → 完成
```

---

### Task 5: apply.md — 全篇去硬编码

**Files:**
- Modify: `commands/alloy/apply.md`（共 5 处）

- [ ] **Step 1: 替换文案中的硬编码分支名（2 处）**

行 168：
```
> 当前在 feature/<name> 分支
→ > 当前在 <从 alloy _state read ... feature_branch 读取，若无则 feature/<name>> 分支
```

行 199：
```
> 源分支:      feature/<name>
→ > 源分支:      <从 state 读取 feature_branch，若无则 feature/<name>>
```

- [ ] **Step 2: 替换完成阶段的硬编码分支引用（3 处）**

行 200：
```
> Worktree 分支: feature/<name>--wt
→ > Worktree 分支: <从 state 读取 worktree_branch，若无则显示 N/A>
```

行 201 已在前次去重修改中涉及路径显示：
```
> Worktree 路径: .claude/worktrees/<name>
→ > Worktree 路径: <从 state 读取 worktree，若无则显示 N/A>
```

- [ ] **Step 3: 替换 worktree 合并清理中的硬编码分支**

行 498：`git merge "feature/<name>--wt"` → `git merge "$WORKTREE_BRANCH"`
行 503：`git branch -d "feature/<name>--wt"` → `git branch -d "$WORKTREE_BRANCH"`
行 509：错误提示中的 `feature/<name>` → `$FEATURE_BRANCH`

---

### Task 6: apply.md 完成 — 从 state 读取分支信息

**Files:**
- Modify: `commands/alloy/apply.md`（约 493-520 行区域）

- [ ] **Step 1: 重写完成阶段的 worktree 合并清理逻辑**

当前逻辑硬编码 `feature/<name>--wt`。改为从 state 读取：

```bash
WORKTREE_PATH=$(alloy _state read openspec/changes/<name> worktree 2>/dev/null)
FEATURE_BRANCH=$(alloy _state read openspec/changes/<name> feature_branch 2>/dev/null)
WORKTREE_BRANCH=$(alloy _state read openspec/changes/<name> worktree_branch 2>/dev/null)

if [ "$WORKTREE_PATH" != "null" ] && [ -n "$WORKTREE_PATH" ] && [ "$WORKTREE_PATH" != "skipped" ]; then
  echo "     ℹ 检测到 worktree（$WORKTREE_PATH），正在合并回 feature 分支..."

  # 向下兼容：遗留 change 无 feature_branch → 退回到 feature/<name>
  if [ -z "$FEATURE_BRANCH" ] || [ "$FEATURE_BRANCH" = "null" ]; then
    FEATURE_BRANCH="feature/<name>"
  fi

  # 向下兼容：遗留 change 无 worktree_branch → 退回到 worktree-<name>
  if [ -z "$WORKTREE_BRANCH" ] || [ "$WORKTREE_BRANCH" = "null" ]; then
    WORKTREE_BRANCH="worktree-<name>"
  fi

  # 切回主仓库目录
  MAIN_ROOT=$(cd "$WORKTREE_PATH" && git rev-parse --show-toplevel 2>/dev/null)

  # 从 worktree 分支合并代码到 feature 分支
  cd "$MAIN_ROOT"
  git merge "$WORKTREE_BRANCH" --no-edit

  if [ $? -eq 0 ]; then
    # 删除 worktree 目录和分支
    git worktree remove "$WORKTREE_PATH"
    git branch -d "$WORKTREE_BRANCH"
    # 清理 worktree 状态
    alloy _state write openspec/changes/<name> worktree null
    alloy _state write openspec/changes/<name> worktree_branch null
    echo "     ✓ worktree 已合并至 $FEATURE_BRANCH 分支并清理"
  else
    echo "     ⚠ merge 冲突，请手动解决后再继续"
    echo "     先: git checkout $FEATURE_BRANCH && git merge $WORKTREE_BRANCH"
    exit 1
  fi
fi
```

---

### Task 7: 测试 — worktree_branch 序列化验证

**Files:**
- Modify: `test/cli/state.test.ts`（新增测试）

- [ ] **Step 1: 新增 worktree_branch 默认不存在测试**

仿照现有的 `feature_branch 默认不存在` 测试（行 129-132）：

```typescript
it("worktree_branch 默认不存在", () => {
  const state = createInitialState();
  expect(state.worktree_branch).toBeUndefined();
});
```

- [ ] **Step 2: 新增 worktree_branch 往返一致测试**

```typescript
it("writeState 和 readState worktree_branch 往返一致", async () => {
  const changeDir = join(tmpDir, "test-wt-branch");
  await mkdir(changeDir, { recursive: true });
  const state = createInitialState();
  state.worktree_branch = "worktree-test-feat";
  await writeState(changeDir, state);
  const loaded = await readState(changeDir);
  expect(loaded.worktree_branch).toBe("worktree-test-feat");
});
```

- [ ] **Step 3: 运行全部测试**

Run: `npm test`
Expected: 276+ passed（原有 274 + 2 新增）
