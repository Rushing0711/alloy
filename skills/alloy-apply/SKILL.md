---
name: alloy-apply
description: Alloy 执行阶段——当 plan.md 完成后，在隔离环境中实现代码并通过双层验证
---

# alloy-apply

你是 Alloy 的执行阶段编排器。按 plan.md 任务实现，内部遵循 TDD，执行完毕自动验证和复盘。

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。不要只出标题然后沉默。**

**什么算"apply 执行不到位"（反例）：**
- precheck 发现技能缺失但继续执行——"先跑着，后面可能用不到"——后面会静默丢失 TDD 或 code review
- 验证失败后直接改代码跳回验证，不经过 SDD——丢失了 TDD 安全网
- retrospective 在没有 verify.md 的情况下生成——复盘建立在不可靠的基础上

## 前置检查

1. 确认 `plan.md` 存在于 change 目录，不存在则报错
2. 通过 alloy-guard.sh 确认 change 的 phase 为 `planned`：
   ```bash
   bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> applied
   ```
   若 guard 报错说明 phase 转换不合法——检查当前 phase 是否符合前置条件

```
---
## Alloy · 执行阶段 · precheck + 隔离 + 实现 + 双层验证 + 复盘

前置检查通过：plan.md ✓  phase=planned ✓

### Step 0/5：技能可用性预检（precheck）

检查以下 5 个 Superpowers 技能是否可用（缺一 STOP，不静默降级）：
- [ ] superpowers:using-git-worktrees
- [ ] superpowers:subagent-driven-development
- [ ] superpowers:test-driven-development
- [ ] superpowers:requesting-code-review
- [ ] superpowers:verification-before-completion

任一缺失 → 输出缺失列表 → 引导 `alloy init` 重新安装 → STOP

全部通过后：
---
precheck 通过：5/5 技能可用 ✓
共 5 个步骤：隔离 → SDD → 代码验证 → 制品验证 → 复盘
---
```

---

## 执行步骤

### Step 1/5：创建隔离环境

确定基础分支：运行 `git branch --list` 列出本地分支，默认使用当前分支。若用户想选择其他分支，在此步骤确认。

确保仓库有 commit（worktree 的前置条件）。如果仓库无任何 commit（全新项目），先做一次初始提交。

```
---
### Step 1/5：隔离环境 · superpowers:using-git-worktrees
---

创建隔离开发环境：

  基础分支：   <branch> @ <sha>
  新分支：     <change-name>
  工作目录：   .worktrees/<change-name>/

基于 <branch> 的 HEAD (<sha>) 创建新分支和独立工作目录...
正在调用 superpowers:using-git-worktrees...
```

使用 Skill 工具加载 `superpowers:using-git-worktrees` 技能：
- 基于基础分支 HEAD 创建新分支 `<change-name>`
- 在新目录 `.worktrees/<change-name>/` 检出代码
- 不会影响当前分支和当前目录

创建完成后确认：
```
✓ worktree 已创建
  分支：   <change-name>（基于 <branch> @ <sha>）
  目录：   .worktrees/<change-name>/
  状态：   已切换到新目录，后续所有操作在此目录中进行
```

### Step 2/5：任务实现

```
---
### Step 2/5：任务实现
---

按 plan.md 微步骤执行实现...
```

使用 Skill 工具加载执行技能。**首选 `superpowers:subagent-driven-development`**：
- 主 agent 读取 plan.md，按微步骤依次分派子 agent
- 每个子 agent 内部遵循 TDD（RED-GREEN-REFACTOR）+ spec/code review
- 子 agent 失败 → 主 agent 分析原因 → 修复或重试

**如果当前平台不支持 subagent，降级使用 `superpowers:executing-plans`**：
- 当前 session 直接执行，每步有审查检查点
- 同样内部遵循 TDD

### Step 3/5：代码层验证

```
---
### Step 3/5：代码层验证 · superpowers:verification-before-completion
---

正在验证代码行为——测试通过、功能正确...
```

使用 Skill 工具加载 `superpowers:verification-before-completion` 技能 —— 代码行为验证。

验证失败 → 修复代码 → 回到 Step 2/5（SDD），确保修复也有 TDD + code review 安全网。

### Step 4/5：制品层验证

```
---
### Step 4/5：制品层验证 · /opsx:verify
---

正在验证制品结构——7 项结构化检查 → verify.md...
```

调用 `/opsx:verify`（openspec-verify-change）产出 `verify.md`。

7 项检查：结构校验 → 任务完成 → Delta Spec 同步 → Design/Specs 一致性 → 实现信号 → 路由泄漏检测 → 延期任务对照。

验证失败 → 修复 → 回到 Step 2/5（SDD）。verify 不通过不结束 apply。

### Step 5/5：复盘

```
---
### Step 5/5：复盘 · retrospective
---

正在生成证据驱动复盘报告（§0-§6）...
```

读取 `instructions/retrospective.md`，按模板 `templates/retrospective.md` 生成 `openspec/changes/<name>/retrospective.md`：

**PRECHECK：** verify.md 存在且 Overall Decision 不是 FAIL，否则 STOP。

**§0 Evidence：** 收集量化证据（git log、diff stat、任务完成比、提交链等）。
**§1 Wins：** `[evidence: ...]` 格式，聚焦可复现的成功模式。
**§2 Misses：** 🔴 blocking / 🟡 painful / 📌 nit 三级严重度。
**§3 Plan Deviations：** 计划 vs 实际变更表格。
**§4 Skill Compliance：** 技能清单 ✓/✗，跳过的技能填三问（跳过什么/为什么/如何防复发）。
**§5 Surprises：** 被推翻的假设。
**§6 Promote Candidates：** `- [ ]` checklist + Why/How to apply，跨周期 carry-forward。

复盘是证据驱动的——每条结论都引用具体 commit 或文件。
跳过策略：单 commit 小修可跳过，写 "Skipped: single-commit fix, no insights"。

---

### 完成

```
---
### Alloy Apply 完成
---

✓ verify.md         已生成
✓ retrospective.md  已生成
```

**通过 alloy-guard.sh 校验并更新 phase：**
```bash
bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> applied --apply
```

```
💡 建议：可以执行 QA 测试或浏览器测试等质量检查，确认后再进入 finish。

准备好后，运行 `/alloy-archive` 进入归档与收尾阶段。
```

---

## 闸门规则

- **precheck 不过不执行** —— 5 个技能任一缺失即 STOP，不静默降级
- **verify 不通过不结束 apply** —— 两层验证（代码层 + 制品层），任意 FAIL 回到 SDD
- **retrospective PRECHECK** —— verify.md 不存在或 Overall Decision 是 FAIL 时 STOP
- **apply 完成后不要自动进入 archive** —— archive 是人工闸门，留给用户空间做 QA
