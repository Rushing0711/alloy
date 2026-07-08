# Phase 路由表

所有 alloy 阶段 skill 共享的 phase 自动路由规则。当 `alloy _guard` 检测到 phase 不匹配时，按此表自动跳转到正确阶段。

## phase 语义

每个阶段有两个 phase 值:
- `-ing`(如 starting/planning/applying):阶段进行中(_phase start 后,_phase complete 前)
- `-ed`(如 started/planned/applied):阶段已完成(_phase complete 后)

## 路由表

| 当前 phase | 行为 |
|-----------|------|
| starting | start 进行中 → 加载 alloy-start |
| started | start 已完成 → 加载 alloy-plan |
| planning | plan 进行中 → 加载 alloy-plan |
| planned | plan 已完成 → 加载 alloy-apply |
| applying | apply 进行中 → 加载 alloy-apply |
| applied | apply 已完成 → 加载 alloy-archive |
| archiving | archive 进行中 → 加载 alloy-archive |
| archived | archive 已完成 → 加载 alloy-finish |
| finishing | finish 进行中 → 加载 alloy-finish |
| finished | 工作流已完成 → STOP |

## 实现方式

输出对应 skill 的完整指令（`skills/alloy-plan/SKILL.md` / `skills/alloy-apply/SKILL.md` / `skills/alloy-archive/SKILL.md` / `skills/alloy-finish/SKILL.md`），将 change name 和当前进度信息作为上下文传入。Agent 无缝进入对应阶段。

## HARD STOP 保留场景

change 目录不存在（前序阶段完全没做）→ 引导用户先运行 `/alloy-start`。这是唯一保留 HARD STOP 的场景。
