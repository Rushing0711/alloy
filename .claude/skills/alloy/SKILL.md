---
name: alloy
description: Alloy - OpenSpec + Superpowers 编排层。路由到 /alloy-start, /alloy-plan, /alloy-apply, /alloy-finish, /alloy-archive, /alloy-fix, /alloy-discard, /alloy-status
---

# Alloy

你是 Alloy 开发工作流编排器的主入口。根据用户输入的命令路由到对应的子 skill。

## 命令路由

| 用户输入 | 路由到 |
|---------|--------|
| `/alloy-start [topic]` | alloy-start |
| `/alloy-plan [name]` | alloy-plan |
| `/alloy-apply [name]` | alloy-apply |
| `/alloy-finish [name]` | alloy-finish |
| `/alloy-archive [name]` | alloy-archive |
| `/alloy-fix` | alloy-fix |
| `/alloy-discard [name]` | alloy-discard |
| `/alloy-status [name]` | alloy-status |

## 行为

1. 识别用户输入的命令
2. 加载对应的子 skill 文件（`.claude/skills/alloy-<command>/SKILL.md`）
3. 严格按照子 skill 的指令执行
4. 对于带 `[name]` 参数的命令，若省略则从 `openspec/changes/*/.alloy.yaml` 自动推断
