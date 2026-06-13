# fix-precommit-check.md

fix 场景 1/2/3 在 commit / merge 前的 TDD + verification 校验门。**目的：阻止"跳诊后跳验证"——commit 前必须证明已加载 test-driven-development + verification-before-completion 两个 skill。**

## 场景 1/2（有归属 change）：skill_usage[] 校验

调用方在 commit 前嵌入。校验对象：`.alloy.yaml` 的 `skill_usage[]`，匹配 `stage=fix` 且 `skill ∈ {test-driven-development, verification-before-completion}`，`action=log`（不是 skip）。

```bash
# 输入：$NAME（change name），$CHANGE_DIR=openspec/changes/$NAME

REQUIRED_SKILLS="test-driven-development verification-before-completion"
MISSING=""

for SKILL in $REQUIRED_SKILLS; do
  COUNT=$(alloy _state read "$CHANGE_DIR" skill_usage 2>/dev/null \
    | python3 -c "
import sys, json
data = json.load(sys.stdin) if sys.stdin.readable() else []
hits = [e for e in (data or []) if e.get('stage')=='fix' and e.get('skill')=='$SKILL' and e.get('action')=='log']
print(len(hits))
" 2>/dev/null || echo 0)
  if [ "${COUNT:-0}" -eq 0 ]; then
    MISSING="$MISSING $SKILL"
  fi
done

if [ -n "$MISSING" ]; then
  echo "⛔ [HARD_STOP] commit 前缺失必需 skill 调用记录："
  echo "  缺失:$MISSING"
  echo "  原因：fix 场景 1/2 commit 前必须先加载 test-driven-development + verification-before-completion"
  echo "        并通过 alloy _skill log <change-dir> fix <skill> 记录调用。"
  echo ""
  echo "  禁止：agent 自动补 _skill log 后继续——记录必须反映真实加载。"
  echo "  违反字面 = 违反精神：哪怕\"测试已经写过了\"或\"diff 看起来明显是修复\"，"
  echo "  也算违反——跳过验证 = 跳过修复闸门。"
  exit 1
fi

echo "✓ pre-commit 校验通过：$REQUIRED_SKILLS 均已加载"
```

## 场景 3（无归属 change）：USER_GATE 物理确认

热修无 change 上下文，无法读 skill_usage。改用 🔴 USER_GATE 在 merge 精确字符串确认前追加：

> 已加载 superpowers:test-driven-development（写失败测试 → 修代码）？
> 已加载 superpowers:verification-before-completion（独立验证修复结果）？
>
> 选项：
> (a) 已加载两个 skill，继续 merge 确认
> (b) 未加载——返回 Step 3 重做

**[HARD_STOP]** agent 不得基于"diff 包含测试代码"或"自己已经测过"自动选 (a)——必须用户物理选择。否则违反 interaction-style.md "沉默 ≠ 授权"通用禁令。

## Why

systematic-debugging（已在 Step 2 强制）只解决"修对位置"——TDD 解决"修法正确"，verification 解决"修完没回归"。三者缺一就把 bug 搬家而不是修复。L4 漏洞场景：用户压力下 agent 直接 `git diff` + `git commit` 跳过 Step 3 子步骤 1-2，闸门必须在 commit 前物理拦截。
