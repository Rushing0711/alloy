# 文档对齐代码 设计

> **问题：** 近期多次修复和优化（worktree 生命周期、commit 合并、分支命名等）未同步更新文档。产品规格和视觉规范与实际代码存在显著差异。

## 对齐方向

- **产品规格** → 向 skill 文件对齐（代码是真相源）
- **Skill 文件** → 向视觉规范对齐（视觉规范定义格式标准）

---

## 一、产品规格更新（01-product-spec.md）

### 1. apply 段落

| 变更 | 当前 spec | 实际代码 |
|------|----------|---------|
| worktree 清理 | 在 apply 完成阶段 | 已移至 archive |
| worktree 分支名 | `feature/<name>--wt` | `worktree-<name>` |
| worktree 路径 | `.claude/worktrees/<name>`（正确）但示例用 `.worktrees/` | `.claude/worktrees/<name>` |
| commit 合并 | verify/retro 各自独立 commit | retro commit 可包含 phase_timings |
| _guard commit | 未描述 | _guard --apply 后补 commit |
| 需求变更闸门 | 无 | tasks.md checkbox 检查 |

### 2. archive 段落

| 变更 | 当前 spec | 实际代码 |
|------|----------|---------|
| worktree 清理 | 无（spec 说 archive 感知不到 worktree） | 有完整清理逻辑 |
| commit 时序 | 单次 commit | 三次 commit（移动 → 清理 → 完成 → guard） |
| git add -A | "永远不用" | 限定路径的 -A 允许 |

### 3. finish 段落

| 变更 | 当前 spec | 实际代码 |
|------|----------|---------|
| phase_timings | 未描述 | 写入 finish.completed_at |
| phase 时序 | merge 后 phase → finished | guard + phase 在 merge 之前 |
| git add -A | "永远不用 -A/-a/." | 闸门规则漏了 -A |

### 4. .alloy.yaml schema

新增字段：
- `worktree_created_at: "2026-05-28 09:10:00"` — worktree 创建时间
- `worktree_branch: "worktree-<name>"` — worktree 分支名
- `worktree_merged_at: "2026-05-28 15:00:00"` — worktree 合并时间

### 5. 闸门规则

`git add` 规则更新：
- 旧：永远不用 `-A`/`-a`/`.`
- 新：`-A` 限定路径可用（如 `git add -A openspec/specs/ openspec/changes/`），无路径限定禁止。`-a`/`.` 始终禁止。

### 6. 关键设计决策

更新决策 #26：
- 旧：worktree 在 apply 生命周期内闭环
- 新：worktree 在 archive 阶段清理（归档变更先 commit，再合并 worktree）

新增决策：
- #29: `_guard --apply` 后补 commit — phase 变更必须 commit，否则 worktree 清理时丢失
- #30: 归档 commit 在 worktree 清理之前 — opsx:archive 的 mv 不被 git 跟踪

---

## 二、视觉规范确认（02-visual-spec.md）

当前视觉规范基本正确，确认以下格式：

- **颜色标签：** `✓`/`✗`/`⚠️` 符号（非 `[PASS]`/`[FAIL]` 标签）
- **Step 编号：** `[Step N/M]` + 38 字符 `─` 下划线（纯文本，不用 `###`）
- **框线样式：** entry box 4 行 + DONE box 6 行，均需 `└─┘` 闭合

---

## 三、Skill 文件视觉格式修复

### 需要修复的文件

| 文件 | 问题 |
|------|------|
| plan.md | entry/DONE box 缺闭合、Step 2 用 `**bold**` |
| apply.md | entry/DONE box 缺闭合、`[PASS]/[FAIL]` 标签、Step 用 `###`、进度检测格式 |
| archive.md | entry/DONE box 缺闭合 |
| finish.md | entry/DONE box 缺闭合 |

### 修复内容

1. **框线闭合：** 补全 `└─┘` 行
2. **颜色标签：** `[PASS]` → `✓`、`[FAIL]` → `✗`、`[WARN]` → `⚠️`、`[HALT]` → `✗`、`[DONE]` → `✓`
3. **Step 编号：** `### [Step N/M] 标题` → `[Step N/M] 标题\n──────────────────────────────────────`
4. **进度检测格式：** 保留但确认与视觉规范一致

---

## 闸门规则

- **产品规格向代码看齐** — 代码行为是真相源
- **视觉格式向规范看齐** — 视觉规范是格式标准
- **不改变代码行为** — 只更新文档和修复格式
