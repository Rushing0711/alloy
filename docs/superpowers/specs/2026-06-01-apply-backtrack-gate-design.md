# Apply 阶段需求变更分流闸门

## 问题

当前 apply 阶段没有"用户想回到 plan/brainstorming 改需求"的明确处理规则。
唯一相关规则写在 plan.md 中（verify/retrospective 暴露规格缺陷应开新 change），
但未覆盖 apply 执行中途的需求变更场景。

## 设计

以"编码是否已开始"为分界线：

- **未开始编码**（tasks.md 全部 unchecked）→ 允许回溯到 brainstorming，在当前 change 内修正
- **已开始编码**（tasks.md 有任一 [x]）→ 拒绝，应开新 change

### 判断信号

`tasks.md` 的 checkbox 状态。用 grep 即可检测：

```bash
grep -c '\[x\]' openspec/changes/<name>/tasks.md
```

- 返回 0 → 未开始编码
- 返回 > 0 → 编码已开始

### 用户交互

```
用户提出需求变更
      ↓
检查 tasks.md checkbox
      ↓
┌─ 全部 unchecked
│     → (a) 确认变更，回到 brainstorming（清理 plan 制品）
│     → (b) 取消，继续 apply
│
└─ 有任一 [x]
      → "编码已开始，需求变更应开新 change: /alloy:start <建议名称>"
```

### 改动范围

| 文件 | 改动 |
|------|------|
| `commands/alloy/apply.md` | 新增"需求变更处理"段落（precheck 之后、执行步骤之前） |
| `commands/alloy/plan.md` | 更新第 241 行，apply 相关规则引用 apply.md 新闸门 |
| `docs/alloy-design.md` | 同步 apply 命令行为描述 |
