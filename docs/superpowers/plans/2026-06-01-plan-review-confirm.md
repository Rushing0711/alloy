# Plan 审查窗口 (b) 选项二次确认 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/alloy:plan` 制品审查窗口用户选 (b) 后，增加 AI 判断 + 用户二次确认环节，替代直接执行回溯。

**Architecture:** 仅修改 `commands/alloy/plan.md` 审查窗口部分，将"选 (b) → 直接执行"改为"选 (b) → 用户说明修改点 → AI 内部判断 → 呈现 (a) 确认回溯 / (b) 取消 两个选项 → 用户选择 → 执行"。

**Tech Stack:** Markdown（Alloy Skill 指令文件）

---

### Task 1: 修改 plan.md 审查窗口 (b) 选项行为

**Files:**
- Modify: `commands/alloy/plan.md:156-162`

- [ ] **Step 1: 更新审查窗口选项说明**

将审查窗口的 (b) 选项提示从"修改后重新展示"改为"说明修改点"：

```markdown
> → (a) 确认，锁定 specs 并继续 tasks
> → (b) 需要调整 — 说明修改点
```

- [ ] **Step 2: 替换 (b) 选项的处理逻辑**

将第 162 行：

```markdown
- **选 (b)**：制品未通过审查 → 停止当前 plan 流程。加载 `superpowers:brainstorming` 以现有 draft.md 为基础重新讨论，在当前 change 内修正需求——无需创建新 change。typo/措辞等纯文本修正除外——可直接修改后重新展示
```

替换为：

```markdown
- **选 (b)**：用户说明修改点后，AI 内部评估修改性质，然后呈现确认选项：

  > → (a) 确认变更，回溯到 brainstorming
  > → (b) 取消变更，继续当前审查

  **AI 判断指南（内部推理，不对外展示标签）：**
  - typo/措辞修正（错别字、格式调整、表达优化，不改变功能边界）→ 内部标记为轻量变更
  - 需求层面变更（功能增删、行为变更、范围调整）→ 内部标记为需求变更

  无论 AI 如何判断，始终向用户呈现相同的 (a)/(b) 两个选项。
  用户选 (a) → 执行回溯清理步骤（见"回溯修改"章节），回到 brainstorming。
  用户选 (b) → 回到当前审查窗口，继续审查流程。
```

- [ ] **Step 3: 验证修改后的文件完整性**

Read `commands/alloy/plan.md` 全文，确认：
- 审查窗口格式正确（块引用、箭头、选项）
- (a) 确认逻辑不变（锁定 + 继续）
- (b) 新流程完整（说明 → 判断 → 确认 → 执行/取消）
- 回溯清理步骤章节引用正确（`见"回溯修改"章节` 指向实际存在的章节）
- 闸门规则部分无需更新（规则本身不变）

- [ ] **Step 4: Commit**

```bash
git add commands/alloy/plan.md
git commit -m "feat(plan): 审查窗口选 (b) 后增加二次确认环节，避免直接回溯

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
