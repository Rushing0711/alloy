> 生成时间: <timestamp>

# Retrospective

> 生成前 PRECHECK：
> 1. 确认 `verify.md` 存在
> 2. 确认 verify.md 的 Overall Decision 不是 FAIL
> 两项都通过后才生成 retrospective。每项结论引用具体 commit hash、文件路径或测试名称。

## §0 量化全景

### 全周期时间线
<!-- 从 .alloy.yaml records 提取：created_at → 每个制品的 committed_at -->

| 制品 | 审批人 | Hash | 审批时间 |
|------|--------|------|---------|
| draft | | | |
| proposal | | | |
| design | | | |
| specs | | | |
| tasks | | | |
| plans | | | |
| verify | | | |
| retrospective | | — | 待确认 |

### Commit 汇总（按 type）
<!-- git log <base>..HEAD --oneline，按 Conventional Commits type 分组 -->

| Type | 数量 |
|------|-----|
| feat | |
| docs | |
| chore | |
| fix | |
| test | |
| 其他 | |

### Commit 汇总（按阶段）
<!-- 根据 commit message 前缀分组 -->

| 阶段 | 数量 |
|------|-----|
| start | |
| plan | |
| apply | |

### 阶段耗时
<!-- .alloy.yaml created_at + git log 最后 commit 时间 -->

| 阶段 | 开始 | 结束 | 耗时 |
|------|------|------|-----|
| start | | | |
| plan | | | |
| apply | | | |
| **总计** | | | |

### 任务完成比
<!-- tasks.md checkbox -->

已勾 / 总数 = xx%

### 变更规模
<!-- git diff --stat <base>..HEAD -->

- 文件数：
- 行数（+/-）：

### Worktree 状态
<!-- .alloy.yaml worktree -->

### 计划策略 vs 实际策略
<!-- plans.md frontmatter strategy vs Agent 自报 -->

- 计划推荐：
- 实际采用：
- 偏差原因（如有）：

### 验证状态
<!-- verify.md Overall Decision -->

### 测试覆盖信号
<!-- 测试文件 vs 源文件变更比例 -->

### 完整提交链
<!-- git log <base>..HEAD --oneline -->
```
```

## §1 做对了什么

<!-- 什么做得好，每条引用 §0 的证据 -->

## §2 做错了什么

<!-- 按严重程度标注，每条带 evidence：
- 🔴 [blocking | evidence: <commit/file/test>] <描述>
- 🟡 [painful  | evidence: <commit/file/test>] <描述>
- 📌 [nit      | evidence: <commit/file/test>] <描述>
-->

## §3 计划偏离

<!-- 哪些 task 的范围在执行中发生了变化，为什么 -->

| Plan task | What changed | Why |
|-----------|-------------|-----|
| | | |

## §4 全周期技能审计

### start 阶段

| 技能/命令 | 使用 |
|----------|:---:|
| `/opsx:new` | |
| `opsx:explore` | |
| `superpowers:brainstorming` | |

### plan 阶段

| 技能/命令 | 使用 |
|----------|:---:|
| `/opsx:continue` | |
| `superpowers:writing-plans` | |

### apply 阶段

| 技能/命令 | 使用 |
|----------|:---:|
| `superpowers:using-git-worktrees` | |
| `superpowers:subagent-driven-development` | |
| `superpowers:executing-plans` | |
| `superpowers:test-driven-development` | |
| `superpowers:requesting-code-review` | |
| `superpowers:verification-before-completion` | |
| `/opsx:verify` | |

### Deliberately Skipped Skills

<!-- 对于每个标记 ✗ 的技能，填写以下三项：
1. **What was skipped** — 具体跳过了哪个技能或子步骤
2. **Why this cycle** — 具体触发原因（必须有具体的 commit hash、日志行或观察到的行为）
3. **How to prevent recurrence** — schema graph fix / skill description tightening / CLAUDE.md trigger / scope-judgment rule / one-off
-->

## §5 意外发现

<!-- 哪些假设被证明是错误的 -->

## §6 值得推广

<!-- 使用 - [ ] checklist，未勾选的 = 跨周期 carry-forward
格式：
- [ ] 🔴 教训简述
  → **Promote to** memory（或 CLAUDE.md / schema / skill / one-off）
  > **Why**: <原因>
  > **How to apply**: <触发条件>
-->

---

## Forward-Pointer 策略

后续 cycle 发现本 retrospective 中结论有误时：
- **不要重写**本文件（会丢失审计线索）
- 追加：`> **Update YYYY-MM-DD**: section X superseded by <链接>
