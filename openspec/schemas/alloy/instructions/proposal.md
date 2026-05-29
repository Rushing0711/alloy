# proposal 制品指令

**定位：** 基于 draft.md 的需求探索结果，提取并浓缩变更范围。proposal 是规划阶段的第一个正式制品——其 Capabilities 列表创建了 proposal 与 specs 之间的合约：specs 仅读取 Capabilities 列表，不读取 draft.md。

产出: `proposal.md`
依赖: draft（由 instruction 读取，不通过 schema requires 声明）

## 生成指令

读取 draft.md 获取已验证的设计。提取：

**## Why**
变更动机。简述问题或机会，1-2 段即可。聚焦业务价值，不写技术细节。

**## What Changes**
Capabilities 列表——这是最关键的部分。Capabilities 是抽象的行为能力描述：
- **New Capabilities：** 本次变更引入的新能力。每个使用 kebab-case 命名（如 `user-authentication`、`payment-capture`）。每个将成为 `specs/<capability>/spec.md`
- **Modified Capabilities：** 现有能力的 REQUIREMENTS 发生变化。检查 `openspec/specs/` 确认已有 spec 名称，不要编造不存在的 Capability 名
- 每个 Capability 一行简短描述，说明它做什么（而非怎么实现）

**## Impact**
受影响的范围：代码模块、API、依赖、数据迁移。1-2 段。

## IMPORTANT

- draft.md 已经完成了需求探索——proposal 是**提取和浓缩**，不是重新探索
- **Capabilities 是合约：** proposal 列出的每个 Capability，specs 阶段都必须有对应的 spec 文件。不要列出你不会实现的 Capability
- **区分新能力 vs 修改能力：** 行为规格变了但概念相同 → Modified；引入了全新概念 → New
- 保持 1-2 页。聚焦"为什么"和"做什么"，不写"怎么做"

## 约束

- Capabilities 必须是抽象的行为能力描述，不含技术实现细节（如"用 Redis 缓存" → 应写为"支持会话持久化"）
- 范围不超出 draft.md 中约定的边界
