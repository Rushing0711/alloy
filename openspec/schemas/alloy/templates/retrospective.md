# Retrospective

> 生成前 PRECHECK：
> 1. 确认 `verify.md` 存在
> 2. 确认 verify.md 的 Overall Decision 不是 FAIL
> 两项都通过后才生成 retrospective。每项结论引用具体 commit hash、文件路径或测试名称。

## §0 量化证据

- 提交数：
- 变更规模（文件数/行数）：
- 任务完成比：
- 工作时间跨度：
- Subagent 调度次数：
- 新增外部依赖：
- 验证状态：
- 测试覆盖信号：
- 提交链：`<base>..HEAD`

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

## §4 技能遵循度

| 技能 | 使用 |
|------|:----:|
| superpowers:using-git-worktrees | |
| superpowers:subagent-driven-development | |
| superpowers:test-driven-development（transitive） | |
| superpowers:requesting-code-review（transitive） | |
| superpowers:verification-before-completion | |

默认期望所有行都是 ✓。

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
