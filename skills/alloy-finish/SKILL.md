---
name: alloy-finish
description: Alloy 独立收尾 - merge / PR / keep（archive 内部自动调用或 keep 后手动恢复）
---

# alloy-finish

你是 Alloy 的独立收尾命令。两种使用场景：
1. **archive 内部自动调用** —— /alloy-archive 归档完成后自动调起
2. **手动调用** —— archive 时选了"保持分支"，后续想合入时手动调

finish 是 Alloy 工作流的最后一步——代码已归档，spec 已同步，最终去留由人类决定。

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。**

**什么算"finish 使用不当"（反例）：**
- phase 不是 finished 时手动调 finish——"反正就合个代码"——跳过了 archive，spec 没有同步
- 分支已 merge 或删除后重复调 finish——浪费操作，应该直接告知用户无需再次 finish
- finish 时试图修改 phase——phase 由 archive 写入 finished，finish 不负责状态管理

---

## 前置检查

```
---
## Alloy · 独立收尾 · 人工闸门
---

### Step 1/2：前置检查
---

phase 是否为 finished？ <检查结果>
```

**phase 必须是 `finished`。** 如果 phase != finished：
```
[HARD STOP] Change '<name>' 的 phase 为 '<phase>'，独立 finish 要求 phase=finished。
请先运行 /alloy-archive 完成归档。
```

通过 alloy-guard.sh 校验（仅检查状态，不转换 phase）：
```bash
bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> finished --check
```

确认当前有对应的 git 分支存在：
```bash
git branch --list <change-name>
```
分支不存在 → "分支 <change-name> 不存在，可能已 merge 或删除。无需再次 finish。"

---

## 执行

```
---
### Step 2/2：收尾处理 · superpowers:finishing-a-development-branch
---

phase=finished 已确认 ✓

请选择处理方式：
  1. 本地 merge  — 合入 main
  2. 创建 PR    — 提交代码审查
  3. 保持分支   — 暂不处理
```

使用 Skill 工具加载 `superpowers:finishing-a-development-branch` 技能，传入上下文：
```
Change: <name>
状态：phase=finished（已归档），spec 已同步
当前分支：<change-name>
```

技能加载后，按其指引提供 3 个选项。

### 各选项的后续行为

**选项 1：本地 merge**
- 代码合入 main 后，提示："代码已合入 main。Alloy 工作流完成。"

**选项 2：创建 PR**
- PR 创建后，提示："PR 已创建。审查通过后合并，Alloy 工作流即完成。"
- 当用户收到 PR 审查反馈并在对话中讨论时，遵循以下行为规范（来自 superpowers:receiving-code-review）：
  - **验证优先** —— 不要盲从审查意见。先验证 reviewer 指出的问题是否真实存在，再决定是否修改
  - **技术推理** —— 如果你的实现有技术理由，解释原因而不是被动接受。reviewer 可能缺少上下文
  - **不要表演性认同** —— 不理解的评论不要假装同意。追问清楚再动手
  - **每条反馈独立回应** —— 不要批量处理，逐一确认、验证、修改

**选项 3：保持分支**
- 提示："分支已保留。后续需要时再次运行 `/alloy-finish <name>` 进行处理。"

---

### 完成

```
---
### Alloy Finish 完成
---

处理方式：<选择的方式>
```

---

## 闸门规则

- **phase 必须为 finished** —— 已归档的 change 才能独立 finish
- **分支必须存在** —— 分支已 merge 或删除时无需再次 finish
- **不修改 phase** —— finish 不改变状态（phase 由 archive 写入 finished）
