# draft 制品指令

**定位：** Pre-OpenSpec 阶段的需求设计草案。draft.md 是 proposal 和 design 的唯一需求输入——先把事情想清楚，再结构化。

产出: `draft.md`（项目根目录，不在 change 目录内）
依赖: 无

## 生成指令

PRECHECK — 技能可用性：
在调用前确认 `superpowers:brainstorming` 在你的可用技能列表中。若不可用，STOP 并告知用户需要安装 Superpowers（或用户可明确选择用下方模板手动写 draft.md）。不要静默降级。

使用 Skill 工具调用 **superpowers:brainstorming**。

IMPORTANT — 输出重定向：
- 不要写入 `docs/superpowers/specs/`。将 brainstorming 输出直接写入项目根目录 `draft.md`
- draft.md 是**原始捕获**——不强制模板结构，保留 brainstorming 的自然输出。brainstorming 的典型输出是决策日志（背景 → 决策链 Q1-Qn → 设计取舍），但具体格式因对话而异。保留其自然组织方式
- 不要在此步骤预先填充 design.md。design.md 是独立制品，在后续阶段重组 draft.md 内容

brainstorming 技能将：
1. 探查项目上下文
2. 逐个询问澄清问题
3. 提出 2-3 个方案及取舍
4. 按章节展示设计并获取审批
5. 输出已验证的设计

## draft.md 内容

自由格式，通常包含：
- **Why** — 要解决的问题
- **What** — 方案概述
- **关键决策链** — Q1 → Qn 技术决策及理由
- **范围与边界** — 明确不做什么

## 约束

- 存放在项目根目录，不在 change 目录内（change 目录由 plan 阶段创建）
- 生成即完成，不自动创建 change 目录
- 完成后提示用户：可用 grill-me 深入拷问需求，确认后运行 `/alloy-plan`
