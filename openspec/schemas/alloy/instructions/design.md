# design 制品指令

**定位：** 解释"怎么做"的技术方案。将 draft.md 中的技术决策重组为结构化设计文档。design 是 tasks 的输入——tasks 依赖它来确定实现步骤。

产出: `design.md`
依赖: proposal + draft（由 instruction 读取）

## 生成指令

读取 draft.md 作为输入。draft.md 是 brainstorming 的原始捕获（通常是决策日志，含 Q1-Qn 决策、取舍和上下文）。你的工作是**重组（reorganize）**这些内容到以下结构化章节中——不是复制，是转换：

**## Context**
背景、当前状态、约束条件、利益相关者。给读者理解"为什么需要这个设计"的上下文。

**## Goals / Non-Goals**
- Goals: 本次设计达成的目标
- Non-Goals: 明确排除的内容——防止范围蔓延

**## Decisions**
关键技术选择。每个决策包含：
- 选择什么
- 为什么选 X 而非 Y（列出考虑过的替代方案及排除理由）
- 取舍是什么（性能 vs 复杂度、灵活性 vs 简单性）

从 draft.md 中提取：决策（Q1-Qn）→ design.md §Decisions；背景/上下文 → design.md §Context；取舍 → design.md §Risks / Trade-offs。补充 Goals/Non-Goals 和 Migration Plan（可能需要根据 draft.md 内容推断）。

**## Risks / Trade-offs**
已知限制和可能出错的地方。格式：`[风险] → 缓解措施`

**## Migration Plan**
部署步骤、回滚策略（如适用）。涉及数据迁移时必须写。

**## Open Questions**
待解决的决策或未知项。

## IMPORTANT

- 这是重组，不是复制。draft.md 中分散的决策要重新组织到对应的结构化章节中
- 技术方案受 proposal Capabilities 范围约束——不要设计超出范围的东西
- 好的 design doc 解释"为什么选 X 而非 Y"——列出替代方案及排除理由
- 聚焦架构和方案，不写逐行实现细节

## 约束

- 与 draft.md 中的决策保持一致，不可自行偏离
- design 读 draft.md，但不在草案之外引入新的需求假设
