---
behaviors:
  preconditions: 5
  hard_stops:    7
  user_gates:    4
  warns:         2
  artifacts: []
  transitions_to: finished
  external_calls: [superpowers:finishing-a-development-branch]
---

# alloy finish 行为规格

详见 skill 文件：`commands/alloy/finish.md`

## 命令格式

```
/alloy:finish [name]（省略时从当前活跃 change 推断）
```

独立命令，两种使用场景：
1. /alloy:archive 完成后 → 代码合入与现场清理
2. 手动调用 → archive 时选了 keep，后续想 merge / PR

## 前置检查

→ phase 路由: archived → 通过；否则自动路由到对应阶段
→ HARD STOP：分支不存在（可能已 merge 或删除）
→ Skill 预检：superpowers:finishing-a-development-branch 可用

## 执行

superpowers:finishing-a-development-branch
→ 读取 openspec/config.yaml 的 main_branch 作为默认合并目标
→ 3 选项:
    1. 本地 merge → 记录完成时间 + guard + phase → finished → commit → squash merge 到 main_branch
    2. 创建 PR    → 记录完成时间 + guard + phase → finished → commit → 创建 PR
    3. 保持分支   → phase 保持 archived，"分支已保留"
→ phase_timings.finish.started_at / completed_at 记录阶段耗时
→ guard + phase → finished 必须在 merge 之前完成（squash merge 后主分支仅 1 个 commit）

## 约束

finish 纯做代码收尾，不涉及 spec 变更。若 PR 审查引出 spec 级修改，应走新 change。
注意：finish 阶段不涉及 worktree——worktree 已在 archive 阶段合并清理。

选 PR 后，审查反馈通过自然对话处理，Agent 内部遵循
superpowers:receiving-code-review 行为规范（验证优先、不盲从、技术推理）。
