# Alloy 退出接续设计

## 问题

用户退出后回来，需要精确从断点继续，不依赖记忆。

当前两个缺陷：
- `/alloy:start` 接续时只指路（"下一步 /alloy:apply"），不带路
- 每个命令的 precheck 不满足时 HARD STOP，而不是自动路由到正确命令

## 方案

### 原则 1：precheck 不满足 → 自动路由，不 STOP

每个命令的 precheck 仍然做完整校验，但 **不满足时不再 HARD STOP**，而是自动转发到正确的命令：

```
/alloy:finish → precheck phase=archived? ✗ 实际 planned
  → "归档尚未完成，自动进入 /alloy:apply"
  → 加载 alloy-apply 指令

/alloy:archive → precheck phase=applied? ✗ 实际 planned
  → "尚未 apply，自动进入 /alloy:apply"
  → 加载 alloy-apply 指令

/alloy:apply → precheck phase=planned? ✗ 实际 started
  → "plan 尚未完成，自动进入 /alloy:plan"
  → 加载 alloy-plan 指令

/alloy:plan → precheck phase=started? ✗ 实际 planned
  → "plan 已完成，自动进入 /alloy:apply"
  → 加载 alloy-apply 指令
```

只在一种情况 HARD STOP：**前序阶段完全没做**（如无活跃 change、无 draft.md、openspec 未初始化）。

用户随便打哪个命令，precheck 链自然导向正确位置。

### 原则 2：步骤自身幂等，不设进度扫描

每个步骤自己判断自己做没做过：

```
Step 1 worktree:  路径存在 → 跳过
Step 2 任务实现:  TDD — 测试通过的任务天然跳过
Step 3 代码验证:  跑测试 — 天然幂等
Step 4 制品验证:  verify.md 存在且 hash 有效 → 跳过
Step 5 复盘:      retrospective.md 存在且 hash 有效 → 跳过
```

不需要命令开头加进度扫描段落。步骤内部做判断比跨步骤推断更可靠。

### `/alloy:start` — 接续时自动带路

有 1 个活跃 change 时，直接加载对应阶段命令：

| phase | 加载命令 |
|-------|---------|
| started | alloy-plan |
| planned | alloy-apply |
| applied | alloy-archive |
| archived | alloy-finish |

多 change 时，用户选择后同上。

---

## 不变的部分

- `alloy _guard` 阶段闸门保留（推进 phase 时仍做硬校验）
- `.alloy.yaml` 字段不增加
- 前置检查内容不变（只改不满足时的行为：路由替代 STOP）
