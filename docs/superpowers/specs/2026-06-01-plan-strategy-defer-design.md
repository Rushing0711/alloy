# Plan 阶段策略选择延后到 Apply 阶段

## 问题

当前 plan 阶段在 `writing-plans` 生成 plans.md 后，会询问用户选择执行策略（SDD / Inline），然后才将策略注入 plans.md frontmatter。这打断了 plan 流程——用户刚审查完 plans.md 内容，还要回答策略问题。

## 设计

**plan 阶段：不询问策略。** writing-plans 自行决定策略并写入 plans.md frontmatter，plans.md 正常走审查窗口。

**apply 阶段：读取策略并给用户确认。** apply.md 已有完整的策略确认流程（Step 2/5 执行策略选择），无需改动。

### plan.md 改动（第 208-225 行）

将 "用户选定执行策略后" 改为 writing-plans完成后直接进入审查窗口：

```
writing-plans 完成并保存 plans.md（含 strategy frontmatter）后，
进入 plans 审查窗口。策略决定由 writing-plans 在生成时自行做出，
apply 阶段再读取并给用户确认。
```

### 不改的部分

- apply.md 的 Step 2/5 策略选择流程不变
- writing-plans 的"执行交接"环节不变（策略选择是其内置行为）
- plans.md 的 YAML frontmatter 格式不变
