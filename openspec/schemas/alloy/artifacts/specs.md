# specs 制品指令

产出: specs/**/*.md（Delta Spec，按 Capability 拆分）
依赖: proposal

## 生成指令

1. 读取 proposal.md 的 Capabilities 列表
2. 按 Capability 逐项写 Delta Spec
3. 每个 Capability 一个 spec 文件
4. 使用 ADDED / MODIFIED / REMOVED 区段

## CRITICAL 约束

- **故意不读 draft.md** —— 只读 proposal 的 Capabilities 列表
- 规格是行为契约，不写类名、库选型、逐步流程
- 仅描述外部可观察行为
