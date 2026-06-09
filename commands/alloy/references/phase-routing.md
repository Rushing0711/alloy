# Phase 路由表

所有 alloy 阶段命令共享的 phase 自动路由规则。当 `alloy _guard` 检测到 phase 不匹配时，按此表自动跳转到正确阶段。

## 路由表

| 当前 phase | 行为 |
|-----------|------|
| started | 尚未 plan → 加载 alloy-plan 指令 |
| planned | 尚未 apply → 加载 alloy-apply 指令 |
| applied | 尚未 archive → 加载 alloy-archive 指令 |
| archived | 尚未 finish → 加载 alloy-finish 指令 |
| finished | 工作流已完成 → STOP |

## 实现方式

输出对应命令文件的完整指令（`commands/alloy/plan.md` / `apply.md` / `archive.md` / `finish.md`），将 change name 和当前进度信息作为上下文传入。Agent 无缝进入对应阶段。

## HARD STOP 保留场景

change 目录不存在（前序阶段完全没做）→ 引导用户先运行 `/alloy:start`。这是唯一保留 HARD STOP 的场景。
