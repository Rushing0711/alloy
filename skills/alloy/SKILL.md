---
name: alloy
description: Alloy 开发工作流编排器主入口——当用户输入 /alloy-* 命令时自动路由到对应子技能
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
3. 严格按照子 skill 的指令执行——不要自作主张跳过步骤或简化流程
4. 带 `[name]` 参数的命令若省略，从 `openspec/changes/*/.alloy.yaml` 自动推断
5. 涉及 phase 转换时，子 skill 会调用 `alloy _guard` 做硬校验——不要跳过

**什么算"路由失败"（反例）：**
- 没有加载子 skill，而是自己内联执行了子 skill 的流程——丢失闸门和脚本校验
- 加载了子 skill 但不遵循其指令，自行"优化"步骤——编排器的职责是委托，不是改造
- 用户输入无法匹配的命令时沉默——应该提示可用命令列表

## 脚本位置

子 skill 通过以下脚本操作状态和校验转换：

| 脚本 | 用途 |
|------|------|
| `alloy _state` | 读写 .alloy.yaml（Agent 不直接编辑 YAML） |
| `alloy _guard` | 阶段转换闸门校验 + phase 更新 |
| `alloy _archive` | 归档验证 + openspec archive + phase 更新 |
