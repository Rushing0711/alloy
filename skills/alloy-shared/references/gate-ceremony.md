# USER_GATE 设置/clear/reset 标准流程

Alloy 用 `alloy _guard user-gate require/pass/reset` + hook-guard 实现硬交互约束。本文件是 SKILL.md 里"设 USER_GATE pending"流程的单一来源。

## 标准流程

### 1. 设置 pending gate

agent 在 SKILL.md 里调:

```bash
alloy _guard user-gate require <change-dir> <gate-name>
```

效果:
- `.alloy.yaml` 写入 `pending_gate: <gate-name>` + 加入 `gate_history`
- hook-guard 拦截非白名单写入(Write/Edit)
- 问答工具调用(AskUserQuestion/question/alloy-question)时 hook-guard 自动 clear pending_gate

### 2. clear pending gate(自动)

问答工具调用即自动 clear。**无需 agent 手动操作**。agent 调问答工具 -> hook-guard 检测到 -> clear pending_gate -> 后续 Write/Edit 不再被拦。

### 3. reset pending gate(用户选 N 后必做)

用户选 N(否决)后,agent 必须调:

```bash
alloy _guard user-gate reset <change-dir> <gate-name>
```

效果:
- 把 gate 从 `gate_history` 移除
- 重新设为 `pending_gate`(继续拦截下次写入)

**原因:** hook-guard 检测到问答工具调用时无条件 clear pending_gate,不管用户选 Y 还是 N。如果用户选 N,需要重新设 pending 才能继续拦下个写入,防止 agent 在用户否决后直接推进。

### 4. pass pending gate(降级路径,慎用)

```bash
alloy _guard user-gate pass <change-dir>
```

效果:gate 标记为 passed,不再拦写入。**仅在用户已经明确决策(不是问答工具调用)的场景使用**,例如用户在文本里说"继续合并"。

## SKILL.md 标准措辞

SKILL.md 里设 USER_GATE 时,引用本文件代替内联说明(避免 16 处复制):

```markdown
设 USER_GATE pending(流程见 alloy-shared/references/gate-ceremony.md):
- hook-guard 拦截非白名单写入,直到问答工具(AskUserQuestion/question/alloy-question)调用自动 clear
- 用户选 N 后必须先调 `alloy _guard user-gate reset <change-dir> <gate-name>`,再继续后续步骤
```

## 反例

- ❌ 不调 `require` 就直接文本问用户--hook-guard 无法拦截,用户没物理选择
- ❌ 用户选 N 后不调 `reset`--下个写入会被 hook 拦但 pending_gate 已 clear,逻辑断裂
- ❌ 调 `pass` 跳过用户决策--`pass` 是降级路径,仅在用户已明确文本决策时用,不是默认推进方式

## 与 hook-guard 的协同

hook-guard 在 PreToolUse 事件里:
1. 读 `.alloy.yaml` 的 `pending_gate` 字段
2. 如果有 pending_gate 且当前工具是 Write/Edit(非白名单),exit 2 拦截
3. 如果当前工具是问答工具(AskUserQuestion/question/alloy-question),调 `clearAllPendingGates` 内部函数自动 clear(扫描主仓 + 所有 git worktree,`setPendingGate(null)` + `addClearedGate(gate)`,不调 `_guard user-gate pass` CLI 命令--那是 agent 手动降级用的)

详见 `alloy-shared/references/cli-reference.md` `_guard user-gate` 章节。
