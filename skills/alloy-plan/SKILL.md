---
name: alloy-plan
description: Alloy 规划阶段——将 draft.md 转化为结构化制品，始终分步，每步可审查
---

# alloy-plan

你是 Alloy 的规划阶段编排器。你的职责是按 OpenSpec schema DAG 依赖顺序，制品生成设计文档，每步生成后提供审查窗口。

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。不要只出标题然后沉默。**

## 前置检查

1. 确认 `draft.md` 存在于项目根目录，不存在则报错："未找到 draft.md，请先运行 `/alloy-start <topic>` 生成设计草案"
2. 若指定 `[name]` 参数但未匹配到活跃 change：
   - "未找到 change '<name>'，将创建新 change。确认？"

---

## Step 1/6：创建 Change 目录

```
---
## Alloy · 规划阶段 · 制品生成

前置检查通过：draft.md ✓

### Step 1/6：创建 Change · /opsx:new
---
```

若 change 目录不存在：
1. 根据 draft.md 内容建议 change name（kebab-case），用户确认
2. **调用 `/opsx:new <name>` 创建 change 目录** —— OpenSpec 自动创建目录结构、移入 draft.md、写入初始状态
3. `/opsx:new` 完成后，通过 alloy-state.sh 补充写入 Alloy 特有字段：
   ```bash
   bash .claude/skills/alloy/scripts/alloy-state.sh write openspec/changes/<name> worktree null
   bash .claude/skills/alloy/scripts/alloy-state.sh write openspec/changes/<name> schema_version 1
   ```
   脚本会自动设置 `updated_at`。

如果 `/opsx:new` 不可用，说明 OpenSpec 未安装或未初始化——引导用户运行 `alloy init` 完成环境初始化。

若 change 目录已存在但有异常（如 draft.md 内容与已有制品不匹配）：
- 警告用户，让其选择：1) 继续当前 change 2) 创建新 change

---

## Step 2/6：制品生成 · /opsx:continue

**调用 `/opsx:continue`** 驱动 schema DAG 按依赖顺序依次生成制品。`/opsx:continue` 自动读取 schema 定义的 DAG，按 `proposal → design → specs → tasks → plan` 顺序依次产出。

作为编排器，你的职责是在 `/opsx:continue` 的每个制品生成后插入审查窗口。**始终分步，不提供一键生成。**

如果 `/opsx:continue` 不可用，引导用户运行 `alloy init` 完成环境初始化。

**制品 DAG 顺序：**
```
proposal → design → specs → tasks → plan
```

**每个制品的审查流程：**
1. 生成当前制品（按下方制品指令概述）
2. 将生成的完整内容展示给用户
3. 审查窗口：
   - (a) 确认，继续下一个制品
   - (b) 需要修改（请说明修改点）
   - (c) 跳过此制品
4. 仅用户选择 (a) 后才继续下一个制品

**审查期间调整上游制品：**
用户如说"把 proposal 第 3 点改一下"，你需要：
1. 修改 proposal.md
2. 自动识别 DAG 中依赖 proposal 的下游制品（design → specs → tasks → plan）
3. 标注这些制品为"已过期"，提醒用户需要重新生成

**什么算"审查不充分"（反例）：**
- 只问了一句"看起来可以吗？"没有展示实际内容
- 用户说"继续"但没有明确说"确认"
- 跳过了某个制品的审查因为"内容很简单"

---

### 各制品指令概述

以下指令作为审查每个制品时的检查清单——确认 `/opsx:continue` 生成的制品内容是否完整。

**Proposal：**
- 读 draft.md，提取 Why / What / Capabilities
- 产出 `openspec/changes/<name>/proposal.md`
- Capabilities 列表是后续 specs 的唯一输入

**Design：**
- 依赖 proposal，读 draft.md 中的技术决策
- 受 proposal 的 Capabilities 范围约束
- 产出 `openspec/changes/<name>/design.md`

**Specs：**
- 依赖 proposal，只读 Capabilities 列表
- **故意不读 draft.md**——这防止行为规格说明书被 draft.md 中的技术实现细节污染。specs 描述"系统应该做什么"，不应该知道"我们打算怎么实现"
- 按 Capabilities 列表按条目写 Delta Spec（ADDED / MODIFIED / REMOVED）
- 产出 `openspec/changes/<name>/specs/**/*.md`

**Tasks：**
- 依赖 specs + design（需要知道"做什么"和"怎么做"）
- 产出 `openspec/changes/<name>/tasks.md`（层级编号 checkbox 清单）

**Plan：**
- 依赖 tasks
- 使用 Skill 工具加载 `superpowers:writing-plans` 技能
- 将粗粒度 checkbox 拆为 TDD 微步骤（每步 2-5 分钟粒度）
- 产出 `openspec/changes/<name>/plan.md`

如果 `superpowers:writing-plans` 不可用，引导用户运行 `alloy init` 完成环境初始化。

---

## Step 7：完成

```
---
### Alloy Plan 完成
---

所有制品已生成：draft ✓  proposal ✓  design ✓  specs ✓  tasks ✓  plan ✓
```

**通过 alloy-guard.sh 校验并更新 phase：**

```bash
bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> planned --apply
```

如果 guard 返回非零，说明前置条件不满足——检查缺哪个制品，补全后重试。guard 通过后 phase 自动更新为 `planned`。

```
制品文件禁止手动修改，如需变更请通过对话驱动。

准备好后，运行 `/alloy-apply` 进入执行阶段。
```

---

## 闸门规则

- **始终分步，不提供一键生成** —— 每个制品必须单独审查确认后才能继续。跳过审查等于跳过需求验证，后期返工代价远大于审查时间
- **制品生成完成后必须通过 alloy-guard.sh 校验** —— 脚本检查 started→planned 转换的合法性
- **plan 完成后不要自动进入 apply** —— 给用户空间审视完整规划
