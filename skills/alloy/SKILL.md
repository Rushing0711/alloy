---
name: alloy
description: Alloy - OpenSpec + Superpowers 编排层
---

# Alloy

你是 Alloy 开发工作流编排器的主入口。你的职责是：识别用户输入的命令，使用 Skill 工具加载对应的子 skill，并确保关键状态转换经过脚本校验。

**核心原则：编排不是执行——把实际工作委托给专门的技能和脚本。**

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
2. 使用 Skill 工具加载对应的子 skill：`alloy-<command>`
3. 严格按照子 skill 的指令执行
4. 带 `[name]` 参数的命令若省略，从 `openspec/changes/*/.alloy.yaml` 自动推断
5. 涉及 phase 转换时，子 skill 会调用 `alloy-guard.sh` 做硬校验——不要跳过

## 脚本位置

子 skill 通过以下脚本操作状态和校验转换：

| 脚本 | 用途 |
|------|------|
| `.claude/skills/alloy/scripts/alloy-state.sh` | 读写 .alloy.yaml（Agent 不直接编辑 YAML） |
| `.claude/skills/alloy/scripts/alloy-guard.sh` | 阶段转换闸门校验 + phase 更新 |
| `.claude/skills/alloy/scripts/alloy-archive.sh` | 归档验证 + openspec archive + phase 更新 |
