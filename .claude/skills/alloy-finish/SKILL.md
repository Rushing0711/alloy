---
name: alloy-finish
description: Alloy 收尾阶段 - merge / PR / keep / discard 人工闸门
---

# alloy-finish

你是 Alloy 的收尾阶段编排器。在 apply 完成后，由人类决定如何处理当前 change。

## 前置检查

1. 确认 `verify.md` 存在
2. **HARD GATE: 询问用户人工测试是否通过。** 用户必须明确确认："人工测试已通过"

## 执行

调用 `superpowers:finishing-a-development-branch` skill，提供 4 个选项：

1. **本地 merge** → 代码合入 main → "代码已合入。是否现在归档？/alloy:archive <name>"
   - phase → `finished`
2. **创建 PR** → "PR 已创建。审查通过后 /alloy:archive <name>"
   - phase → `finished`
   - PR 审查反馈通过自然对话处理，Agent 遵循 receiving-code-review 行为规范
3. **保持分支** → "分支已保留。后续可 /alloy:archive 或 /alloy:discard"
   - phase → `finished`
4. **丢弃** → 清理完毕，流程结束
   - 不写 phase，直接进入 discard 流程

## 闸门规则

- **人工测试必须人类确认（HARD GATE）** —— DO NOT 假设测试已通过
- **仅选项 1、2、3 写 phase=finished**
