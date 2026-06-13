# plan-rollback.md

plan 阶段的制品回溯清理——轻量修正和需求变更两条路径。

## 轻量修正（措辞/格式，不改变功能边界）

**判断规则：** 只有用户明确说"措辞/格式调整"才走此路径。用户主动提出"加入/删除/修改功能"= 需求变更，**禁止使用 `alloy _artifact reset`**，必须走下面的回溯路径。不确定时默认需求变更。

使用 `alloy _artifact reset` 一步完成 hash 清除 + 文件删除：

```bash
alloy _artifact reset openspec/changes/<name> <artifact>
```

该命令自动：
1. 清除 `.alloy.yaml` 中该制品的 hash 记录
2. 删除制品文件（specs 目录递归删除）

然后调用 `/opsx:continue` 重新生成 → 审查 → 重新锁定。下游已锁定制品保持不变。

```bash
git add openspec/changes/<name>/
git commit -m "chore(<name>): 轻量修正——清除 <artifact>，准备重新生成"
```

## 需求变更回溯清理（功能增删、行为变更）

删除所有 plan 制品（保留 draft.md），重置 records 和 phase_timings：

```bash
# 1. 打 snapshot tag（task #15）——回溯前留恢复入口
# 不可逆删除前必须留 git tag，事后用户可 git checkout <tag> 完整恢复 plan 制品
TS=$(date +%Y%m%d-%H%M%S)
SNAPSHOT_TAG="rollback-<name>-${TS}"
git tag "$SNAPSHOT_TAG"
echo "已打 snapshot tag: $SNAPSHOT_TAG（事后恢复：git checkout $SNAPSHOT_TAG -- openspec/changes/<name>/）"

# 2. 删除 plan 制品文件（保留 draft.md）
rm -f openspec/changes/<name>/proposal.md
rm -f openspec/changes/<name>/design.md
rm -f openspec/changes/<name>/tasks.md
rm -f openspec/changes/<name>/plans.md
rm -rf openspec/changes/<name>/specs/

# 3. 清理 records（只保留 draft）
DRAFT_RECORD=$(alloy _state read openspec/changes/<name> records | python3 -c "
import sys,json
content = sys.stdin.read().strip()
records = json.loads(content) if content and content != 'null' else []
draft = [r for r in records if r.get('artifact') == 'draft']
print(json.dumps(draft))
")
alloy _state write openspec/changes/<name> records "$DRAFT_RECORD"

# 4. 清理 phase_timings
# ⚠️ 此处是 phase_timings 唯一允许 _state write 的场景：回溯需要删除 key + 覆盖值，merge 语义不支持
TIMINGS=$(alloy _state read openspec/changes/<name> phase_timings 2>/dev/null || echo "{}")
echo "$TIMINGS" | python3 -c "
import sys,json
content = sys.stdin.read().strip()
d = json.loads(content) if content and content != 'null' else {}
for k in ['plan','apply','archive','finish']:
    d.pop(k, None)
if 'start' in d:
    d['start']['completed_at'] = None
print(json.dumps(d))
" | while read -r val; do alloy _state write openspec/changes/<name> phase_timings "$val"; done

git add openspec/changes/<name>/
git commit -m "chore(<name>): 回溯——清理 plan 制品，回到 brainstorming"
```

```
→ 制品已清理（仅保留 draft），records/phase_timings 已重置
→ 请运行 /alloy:start <name> 重新走需求确认流程
```

## apply 阶段的需求变更

apply 阶段的需求变更闸门见 apply.md——以 tasks.md checkbox 状态判断：
- 未编码（全部 unchecked）→ 清理 plan 制品 → 回到 brainstorming（使用上面的回溯清理步骤）
- 已编码（有 [x]）→ 拒绝回溯，开新 change

apply 的 verify/retrospective 验证"代码是否匹配规格"，发现问题修正代码，不改变需求/设计。
