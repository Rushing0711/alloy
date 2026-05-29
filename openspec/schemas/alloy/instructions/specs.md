# specs 制品指令

**定位：** 定义系统"应该做什么"的行为规格。specs 是行为契约——描述外部可观察行为，不描述内部实现。每个 Capability 一个 spec 文件。

产出: `specs/**/*.md`（按 Capability 拆分）
依赖: proposal

## 生成指令

1. 读取 proposal.md 的 Capabilities 列表
2. 为每个 Capability 创建一个 spec 文件：
   - **New Capabilities：** 使用 proposal 中确切的 kebab-case 名称 → `specs/<capability>/spec.md`
   - **Modified Capabilities：** 使用 `openspec/specs/<capability>/` 下的现有目录名
3. 使用以下 Delta 操作区段（## 二级标题）：

   **## ADDED Requirements**
   新增的能力。每个需求：`### Requirement: <名称>`，跟一段描述。

   **## MODIFIED Requirements**
   修改的现有行为。**必须包含完整更新后的内容**，不只是 diff。

   **## REMOVED Requirements**
   废弃的功能。**必须包含 Reason**（为什么移除）和 **Migration**（迁移方案）。

   **## RENAMED Requirements**
   仅名称变更。使用 `FROM: <旧名> TO: <新名>` 格式。

## 格式要求

- 需求使用 SHALL/MUST 表达规范性要求（避免 should/may）
- 每个需求：`### Requirement: <名称>` 后跟描述
- 每个需求必须至少有一个场景。场景格式：
  ```
  #### Scenario: <场景名>
  - **WHEN** <条件>
  - **THEN** <预期行为>
  ```
- **CRITICAL：场景必须使用恰好 4 个井号（`####`）。使用 3 个井号或 bullet 会导致静默解析失败。**
- 每个场景都是潜在的测试用例——规格应该可测试

## CRITICAL 约束

- **故意不读 draft.md** —— 只读 proposal 的 Capabilities 列表。这防止行为规格被 draft.md 中的技术实现细节污染。specs 描述"系统应该做什么"，不应该知道"打算用 Redis 还是 Postgres"
- 规格是行为契约，不写类名、库选型、目录结构
- 仅描述外部可观察行为

## 格式校验

生成完成后，必须运行 `openspec validate --all` 验证 Delta Spec 格式。常见问题：
- header 格式：`## ADDED` → 应为 `## ADDED Requirements`（OpenSpec 要求完整 section 名）
- 场景层级：`#### Scenario:` 必须恰好 4 个 `#`，多用或少用会导致静默解析失败

若 validate 失败，根据错误提示修正格式，重新验证直到通过。
