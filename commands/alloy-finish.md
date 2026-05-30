---
name: "Alloy Finish"
description: Alloy 收尾——archive 完成后，合入代码并清理现场
category: Workflow
tags: [alloy, workflow]
---

# alloy-finish

你是 Alloy 的收尾命令。你的职责是：在 spec 已归档（phase=archived）的前提下，完成代码合入与现场清理，将 phase 推进到 `finished`。

**finish 只做代码层面的收尾，不涉及 spec 变更。** 如果合入过程中（如 PR 审查）发现需要修改 spec，那是另一个 change 的事——当前 change 的 spec 已归档封存。

**什么算"finish 使用不当"（反例）：**
- phase 不是 archived 时调 finish——"反正就合个代码"——跳过了 archive，spec 没有同步
- 分支已 merge 或删除后重复调 finish——浪费操作，应该直接告知用户无需再次 finish
- finish 过程中试图修改 spec——spec 已归档，任何 spec 级变更应走新 change

---

## 前置检查

```
┌──────────────────────────────────────┐
│ Alloy [5/5] · Phase: Finish          │
└──────────────────────────────────────┘
```

### [Step 1/3] 前置检查

> phase 是否为 archived？ <检查结果>

**phase 必须是 `archived`。** 如果 phase != archived：
```
[HARD STOP] Change '<name>' 的 phase 为 '<phase>'，finish 要求 phase=archived。
请先运行 /alloy-archive 完成归档。
```

通过 `alloy _guard` 校验：
```bash
alloy _guard openspec/changes/<name> finished
```

确认当前有对应的 git 分支存在：
```bash
git branch --list <change-name>
```
分支不存在 → "分支 <change-name> 不存在，可能已 merge 或删除。无需再次 finish。"

---

## 执行

### [Step 2/3] superpowers:finishing-a-development-branch

> phase=archived 已确认 ✓
>
> **请选择处理方式：**
> **1.** 本地 merge  — 合入基础分支
> **2.** 创建 PR    — 提交代码审查
> **3.** 保持分支   — 暂不处理

使用 Skill 工具加载 `superpowers:finishing-a-development-branch` 技能，传入上下文：
```
Change: <name>
状态：phase=archived（spec 已归档，代码待合入）
当前分支：<change-name>
基础分支：<apply 阶段用户选择的分支>（merge 回合目标）
```

技能加载后，按其指引提供 3 个选项。

### 各选项的后续行为

**选项 1：本地 merge**

在执行 merge 之前，必须展示确认信息并等待用户确认：

> 确认合并
> ──────────────────────────────────────
>
> 即将执行本地合并：
>
> | | |
> |---|---|
> | **源分支** | <change-name> |
> | **目标分支** | <base-branch> |
>
> **即将合入的提交：**
> ```
> <git log base-branch..change-name --oneline 的输出>
> ```
>
> 合并后 worktree 将被清理，分支将被删除。
>
> 输入 `merge <change-name> into <base-branch>` 确认，或输入其他内容取消。

**必须等待用户精确输入确认语句。** "好"、"可以"、"y" 都不算确认。

用户确认后执行 merge：
```bash
git checkout <base-branch>
git pull
git merge <change-name>
```

合并成功后运行测试验证，然后更新 phase：
```bash
alloy _guard openspec/changes/<name> finished --apply
```

提示："代码已合入 <base-branch>。Alloy 工作流完成。"

**选项 2：创建 PR**
- PR 创建后，更新 phase：
  ```bash
  alloy _guard openspec/changes/<name> finished --apply
  ```
- 提示："PR 已创建。审查通过后合并，Alloy 工作流即完成。"
- 当用户收到 PR 审查反馈并在对话中讨论时，遵循以下行为规范（来自 superpowers:receiving-code-review）：
  - **验证优先** —— 不要盲从审查意见。先验证 reviewer 指出的问题是否真实存在，再决定是否修改
  - **技术推理** —— 如果你的实现有技术理由，解释原因而不是被动接受。reviewer 可能缺少上下文
  - **不要表演性认同** —— 不理解的评论不要假装同意。追问清楚再动手
  - **每条反馈独立回应** —— 不要批量处理，逐一确认、验证、修改
  - **spec 级变更 = 新 change** —— 如果审查反馈要求修改 spec，当前 change 的 spec 已归档，应走新 change

**选项 3：保持分支**
- 提示："分支已保留。后续需要时再次运行 `/alloy-finish <name>` 进行处理。"
- phase 保持 archived，不推进到 finished

---

### [Step 3/3] 完成

```
┌──────────────────────────────────────┐
│ Alloy [5/5] · Phase: Finish — DONE   │
└──────────────────────────────────────┘
```

> **处理方式：** <选择的方式>
> **phase → finished**

---

## 闸门规则

- **phase 必须为 archived** —— spec 已归档的 change 才能 finish
- **分支必须存在** —— 分支已 merge 或删除时无需再次 finish
- **不涉及 spec 变更** —— spec 已归档封存，任何 spec 级修改应走新 change
- **选项 3 不推进 phase** —— 保持分支意味着未真正收尾，phase 停留在 archived
