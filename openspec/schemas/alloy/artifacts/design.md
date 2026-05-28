# design 制品指令

产出: design.md
依赖: proposal + draft（由 instruction 读取）

## 生成指令

1. 读取 draft.md 中的技术决策，重组为结构化技术方案
2. 读取 proposal.md 的 Capabilities，确保技术方案不超出范围
3. 按 OpenSpec design 格式输出架构决策、技术选型、集成点

## 约束

- 技术方案受 proposal 的 Capabilities 范围约束
- 与 draft.md 中的决策保持一致，不可自行偏离
