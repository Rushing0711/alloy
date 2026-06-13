# apply 多 change 并行检测（前置 Step 0/5 用）

apply 单 change 串行（subagent 内部并行 OK）——同期多个 change 同时 apply 会导致 git 操作竞争（branch 切换、worktree 创建、commit 写入相互干扰）。

## 检测 bash

```bash
PARALLEL=$(find openspec/changes -maxdepth 2 -name .alloy.yaml \
  -exec grep -l "phase: apply\|phase: applied" {} \; 2>/dev/null \
  | grep -v "/<name>/" | wc -l)
if [ "$PARALLEL" -gt 0 ]; then
  echo "⚠️ [WARN] 检测到 $PARALLEL 个其他 change 处于 apply/applied 状态："
  find openspec/changes -maxdepth 2 -name .alloy.yaml \
    -exec grep -l "phase: apply\|phase: applied" {} \; 2>/dev/null | grep -v "/<name>/"
  echo ""
  echo "  apply 串行更安全——多 change 并行 apply = worktree/branch/commit 竞争。"
  echo "  继续当前 apply 前请确认其他 change 已暂停。"
fi
```

不阻断——仅提示。
