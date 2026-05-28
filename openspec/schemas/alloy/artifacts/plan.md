# plan 制品指令

产出: plan.md（TDD 微步骤）
依赖: tasks

## 生成指令

1. 调用 `superpowers:writing-plans` skill
2. 将 tasks.md 的粗粒度 checkbox 拆为 TDD 微步骤（每步 2-5 分钟粒度）
3. 每步包含：目的、文件路径、预期代码、测试命令、预期输出

## 约束

- DO NOT 使用 /opsx:ff（一键生成）
- 始终分步，每步可审查
