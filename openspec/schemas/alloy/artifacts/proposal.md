# proposal 制品指令

产出: proposal.md
依赖: draft（由 instruction 读取，不通过 schema requires 声明）

## 生成指令

1. 读取 draft.md，提取 Why/What/Capabilities
2. 按 OpenSpec proposal 格式输出：
   - ## Why - 为什么做
   - ## What Changes - 做什么（Capabilities 列表）
   - ## Impact - 影响范围

## 约束

- Capabilities 列表必须是抽象的行为能力描述，不包含技术实现细节
- 范围不应超出 draft.md 中约定的边界
