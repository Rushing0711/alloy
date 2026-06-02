# 分支管理与 Commit 优化设计

> **日期：** 2026-06-02
> **状态：** 已实施
> **范围：** start.md step 6 重写、discard.md 清理逻辑、commit 优化、.alloy.yaml 新增字段、TypeScript 类型变更

---

## 背景

代码审查发现以下问题：
1. `git add -A` 违反设计文档闸门规则（plan.md、apply.md）
2. archive 阶段 `2>/dev/null` 吞掉 commit 错误，存在 spec 丢失风险
3. commit 次数偏多（21+），phase_timings 可以附着在制品 commit 上
4. draft 用 `feat` 前缀与其他制品 `docs` 不一致
5. start 阶段允许在主分支开发，discard 时无法安全清理分支
6. archive 的 git add 缺少原 change 目录删除
7. fix.md B2 路径未处理并行 change 冲突（phase ≥ applied 时不能同时 apply 新 change）
8. B2 "先 finish"与 fix 前提矛盾（spec 需改但先标记 finished）
9. main_branch 应为项目级配置，非 per-change
10. start step 6 边界：无非主分支、无 main/master 时的处理
11. finish 阶段未读取 main_branch 作为默认合并目标

---

## 一、Commit 优化

### 已落地的改动

| 改动 | 说明 |
|------|------|
| plan.md `git add -A` | 删除 fallback，改为 HARD STOP |
| apply.md `git add -A` | 删除 fallback，改为 HARD STOP |
| archive.md `2>/dev/null` | 移除，commit 失败阻断 |
| archive.md git add 补全 | 加入 `openspec/changes/<name>/` 跟踪原目录删除 |
| `feat` → `docs` | draft commit 统一用 docs 前缀 |
| start ②+④ 合并 | phase_timings 附着在 draft commit |
| start ①+③ 合并 | 消除重复基础设施 commit |
| plan ⑨+⑪ 合并 | phase_timings 附着在 plans commit |
| apply ⑮+⑯ 合并 | phase_timings 附着在 retrospective commit |
| archive ⑰+⑱ 合并 | phase_timings 附着在归档 commit |

### 优化后 Commit 全景

```
start 阶段 (2 次)
  ① chore: alloy init 项目初始化          [条件] 新项目 git init 后
  ② docs(<name>): draft 已确认            [必然] draft hash-lock + phase_timings

plan 阶段 (最多 7 次)
  ③-⑦ docs(<name>): <artifact> 已确认     [必然] proposal/design/specs/tasks/plans 各一次
  ⑧   chore(<name>): 回溯——清理 plan 制品  [条件] 用户要求调整时

apply 阶段 (4+ 次)
  ⑨  chore(<name>): apply 阶段开始前状态快照 [条件]
  ⑩  SDD 技能内部的代码变更 commit           [必然] 数量不定
  ⑪  docs(<name>): verify 已确认            [必然]
  ⑫  docs(<name>): retrospective 已确认     [必然] retro hash-lock + phase_timings

archive 阶段 (1 次)
  ⑬ chore(<name>): Delta Spec 已同步并归档   [必然] 失败阻断，含 phase_timings

finish 阶段 (1-2 次)
  ⑭ merge commit                            [条件] 选项 1 本地 merge 时
  ⑮ chore(<name>): 记录 finish 阶段完成时间  [必然]
```

总计：16+ 次（原 21+），减少 5 次。

---

## 二、分支管理（待实施）

### 设计原则

1. **主分支由用户确认** — 不硬编码 main/master/dev，始终询问用户
2. **主分支保护** — 不允许在主分支开发，commit 会污染主分支历史
3. **每个 change 独立分支** — 不允许在当前分支继续，必须切换或新建 feature 分支，确保 discard 可安全清理
4. **新建分支始终可选** — 任何情况下都允许用户创建新分支

### start.md step 6 重写

```
Step 6: 分支选择
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

① 识别主分支候选
   git branch -a → 提取分支列表
   优先匹配 main / master 作为候选
   若都没有 → 直接列出所有分支，让用户选择

② 确认主分支
   "检测到以下分支：<列表>
    请确认主分支名称（用于后续分支管理）：___"

   用户确认后写入项目级配置 openspec/config.yaml 的 alloy.main_branch 字段。
   （主分支是项目级概念，所有 change 共享，不写入 per-change 的 .alloy.yaml）

③ 检测当前分支
   CURRENT=$(git branch --show-current)

④ 当前分支 == 主分支？
   ├── 是 → HARD STOP："当前在主分支 <main_branch>，不允许在主分支开发。
   │        commit 会污染主分支历史，请新建或切换到 feature 分支。"
   │        → 只展示选项 2（新建分支）
   │
   └── 否 → 展示选项（见⑤）

⑤ 展示选项（不允许在当前分支继续，必须明确选择分支）：

   非主分支的已有分支存在时：
     1. 切换到已有分支 — 展示非主分支的已有分支列表
     2. 新建分支       — 始终可选

   无可用的非主分支时：
     → 直接进入新建分支流程（跳过选项 1）

   每个 change 必须有独立的 feature 分支，确保 discard 时可安全清理。

⑥ 新建分支命名：
   默认建议：feature/<change-name>
   用户可输入自定义名称
   校验：不允许与主分支同名
   git checkout -b <branch-name>
   写入 .alloy.yaml 的 feature_branch 字段
```

### discard.md 清理逻辑重写

```
每个 change 必须有独立的 feature 分支（start step 6 保证），
discard 时可安全删除整个分支。

Phase 分级行为：

| phase | 清理动作 |
|-------|---------|
| started / planned | git checkout <main_branch> + git branch -D <feature_branch> + rm change 目录 |
| applied / archived | git worktree remove + git checkout <main_branch> + git branch -D <feature_branch> + rm change 目录 |
| finished | HARD STOP |

执行顺序（必须按序）：
  1. git worktree remove（如存在）
  2. git checkout <main_branch>（切离要删的分支）
  3. git branch -D <feature_branch>
  4. rm -rf openspec/changes/<name>/

安全兜底：
  - feature_branch == main_branch → 不删分支（理论上不会发生，start 已拦截）
  - main_branch 未记录 → 提示用户手动切回主分支
```

### 配置文件变更

**openspec/config.yaml（项目级，新增 main_branch）：**

```yaml
schema: alloy
alloy:
  main_branch: main    # 用户确认的主分支名，所有 change 共享
```

**.alloy.yaml（per-change，新增 feature_branch）：**

```yaml
# 新增
feature_branch: feat/login  # 本次 change 使用的分支

# 已有字段不变
phase: started
worktree: null
schema_version: 1
created_at: ...
updated_at: ...
records: []
phase_timings: {}
```

### finish 阶段适配

finish 选项 1（本地 merge）应从 `openspec/config.yaml` 读取 `main_branch` 作为默认合并目标分支，不再让用户手动选择。

---

## 三、fix.md B2 路径修正（待实施）

### 问题

当前 fix.md B2 路径（需改 spec + phase ≥ applied）只说"请手动发起 `/alloy:start`"，但没有处理：
1. 当前 change 仍在 applied/archived 阶段，不能同时 apply 新 change
2. start 的接续逻辑会拦截，不会进入新 change 流程
3. "无活跃 change"和"phase ≥ applied"混在一个条件里，处理方式不同

### 修正后的 B2 路径

```
B2 — 需要开新 change（有活跃 change 且 phase ≥ applied）：

  ① 告知用户："当前 change <name> 处于 <phase> 阶段，spec 需要修改。
     当前 change 的代码基于旧 spec，需要先处理再开新 change。"

  ② 提供选项：
     a. 先完成当前 change → 推进测试、archive、finish，后续开新 change 修 spec + 修 bug（推荐，代码已落地，先确保当前工作完整交付）
     b. discard 当前 change → 重新开始（spec + 代码一起重做，适用于代码本身有严重问题的场景）
     c. 记下建议名称，手动决定时机

  ③ 不自动创建新 change——让用户感知当前 change 的状态后再决定
```

### B 路径完整分流表

| 条件 | 路径 | 处理 |
|------|------|------|
| 有活跃 change + phase < applied | B1 | 并入当前 change，回到 brainstorming |
| 有活跃 change + phase ≥ applied | B2 | discard 或先 finish，再开新 change |
| 无活跃 change | B2 | 直接 /alloy:start <建议名称> |

---

## 四、TypeScript 改动（待实施）

| 文件 | 改动 |
|------|------|
| `src/core/types.ts` | `AlloyState` 接口新增 `feature_branch?: string`；新增项目级配置类型（`main_branch`） |
| `src/cli/commands/internal/state.ts` | `_state init` 支持 `feature_branch` 字段 |
| `src/cli/utils/state.ts` | 项目级 config 读写支持 `alloy.main_branch` |
| 测试文件 | 补充 state 读写新字段的用例 |

---

## 五、实施顺序

1. ~~Commit 优化（已落地到命令文件）~~ ✓
2. ~~TypeScript 类型新增字段（feature_branch + 项目级 main_branch 读写）~~ ✓
3. ~~start.md step 6 重写（分支管理 + 主分支确认）~~ ✓
4. ~~discard.md 清理逻辑重写（分支清理 + 切回主分支）~~ ✓
5. ~~fix.md B2 路径修正~~ ✓
6. ~~finish.md 适配（读取 main_branch 作为默认合并目标）~~ ✓
7. ~~测试补全（146/146 通过）~~ ✓
