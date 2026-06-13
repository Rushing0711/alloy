# artifact-hash-commit.md

制品审批后的 hash 锁定 + commit 标准序列。

## 标准流程

用户在审查窗口选 (a) 确认后执行：

```bash
HASH=$(alloy _record compute openspec/changes/<name> <artifact>)
APPROVED_AT=$(date "+%Y-%m-%d %H:%M:%S")
APPROVER=$(alloy _record approver openspec/changes/<name>)
alloy _record write openspec/changes/<name> <artifact> "$HASH" "$APPROVED_AT" "$APPROVER"
git add openspec/changes/<name>/
git commit -m "docs(<name>): <artifact> 已确认"
```

## 阶段最后一个制品

阶段最后一个制品审批时，phase_timings.completed_at + hash 锁定合并为一个 commit——禁止拆成两次提交：

```bash
COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
alloy _state merge openspec/changes/<name> phase_timings "{\"<phase>\":{\"completed_at\":\"${COMPLETED_AT:-$(date '+%Y-%m-%d %H:%M:%S')}\"}}"
HASH=$(alloy _record compute openspec/changes/<name> <artifact>)
APPROVED_AT=$(date "+%Y-%m-%d %H:%M:%S")
APPROVER=$(alloy _record approver openspec/changes/<name>)
alloy _record write openspec/changes/<name> <artifact> "$HASH" "$APPROVED_AT" "$APPROVER"
git add openspec/changes/<name>/
git commit -m "docs(<name>): <artifact> 已确认"
```

phase_timings 作为元数据附着在制品提交上，不单独 commit。

## commit message 格式

`docs(<change-name>): <artifact> 已确认`（Conventional Commits `docs` type）。

`<artifact>` 为 draft / proposal / design / specs / tasks / plans / verify / retrospective。

## 生成下一制品前

校验上游依赖制品的 hash 未被篡改：

```bash
alloy _record check openspec/changes/<name> <upstream-artifact>
```

check 返回非零 → HARD STOP，hash 不匹配意味着有未审批的篡改。
