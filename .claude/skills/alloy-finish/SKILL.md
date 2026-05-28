---
name: alloy-finish
description: Alloy 收尾阶段 - merge / PR / keep / discard 人工闸门
---

# alloy-finish

你是 Alloy 的收尾阶段编排器。在 apply 完成后，由人类决定如何处理当前 change。

**关键行为规则：调用任何外部命令/技能前，MUST 先输出标题 + 状态文本。严禁只出标题后沉默。顺序：1) 标题 → 2) 状态描述 → 3) 调用。**

## 前置检查

```
---
## Alloy · 收尾阶段 · 人工闸门
---

### Step 1/2：前置检查
---

verify.md 存在？ <检查结果>
人工测试状态：等待确认...
```

1. 确认 `verify.md` 存在
2. **HARD GATE: 询问用户人工测试是否通过。** 用户必须明确确认："人工测试已通过"

## 执行

```
---
### Step 2/2：收尾处理 · superpowers:finishing-a-development-branch
---

人工测试已通过 ✓

请选择处理方式：
  1. 本地 merge  — 合入 main
  2. 创建 PR    — 提交代码审查
  3. 保持分支   — 暂不处理
  4. 丢弃       — 取消本次 change
```

调用 `superpowers:finishing-a-development-branch` skill，提供 4 个选项：

1. **本地 merge** → 代码合入 main → "代码已合入。是否现在归档？/alloy-archive <name>"
   - phase → `finished`
2. **创建 PR** → "PR 已创建。审查通过后 /alloy-archive <name>"
   - phase → `finished`
   - PR 审查反馈通过自然对话处理，Agent 遵循 receiving-code-review 行为规范
3. **保持分支** → "分支已保留。后续可 /alloy-archive 或 /alloy-discard"
   - phase → `finished`
4. **丢弃** → 清理完毕，流程结束
   - 不写 phase，直接进入 discard 流程

### 完成

```
---
### Alloy Finish 完成
---

处理方式：<选择的方式>
phase → finished

准备好后，运行 `/alloy-archive <name>` 归档。
```

## 闸门规则

- **人工测试必须人类确认（HARD GATE）** —— DO NOT 假设测试已通过
- **仅选项 1、2、3 写 phase=finished**
