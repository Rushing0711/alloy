<!--
  Delta spec 模板 — 跟踪对 capability spec 的变更。
  路径：openspec/changes/<change-name>/specs/<capability>/spec.md

  硬校验规则（OpenSpec 严格校验）：
  - Requirement 描述 MUST 含 SHALL 或 MUST
  - 每个 Requirement MUST 至少有一个 #### Scenario:
  - Scenario MUST 用 level-4 (####)，level-3 或 bullet 会导致静默解析失败
-->

## ADDED Requirements
<!-- 新增的行为能力 -->

### Requirement: <requirement name>
<requirement text — 须含 SHALL 或 MUST>

#### Scenario: <scenario name>
- **WHEN** <condition>
- **THEN** <expected outcome>

---

## MODIFIED Requirements
<!--
  修改的现有行为。MUST 包含完整更新后的内容（不只是 diff）。
  使用与 openspec/specs/<capability>/spec.md 完全相同的 header。
-->

### Requirement: <requirement name>
<完整更新后的内容 — 须含 SHALL 或 MUST>

#### Scenario: <scenario name>
- **WHEN** <condition>
- **THEN** <expected outcome>

---

## REMOVED Requirements
<!-- 每个条目 MUST 包含 Reason 和 Migration 说明 -->

### Requirement: <exact header to delete>
**Reason**: <why removed>
**Migration**: <how existing consumers should adapt>

---

## RENAMED Requirements
<!--
  Archive 时的 apply 顺序：RENAMED → REMOVED → MODIFIED → ADDED
  如果内容也有变化，在此列出 rename，完整内容放到 MODIFIED（使用新 header）。
-->

- FROM: `### Requirement: <Old Name>`
- TO: `### Requirement: <New Name>`
