# plan 制品指令

**定位：** 将 tasks.md 的粗粒度 checkbox 拆为可执行的 TDD 微步骤。plan.md 是 apply 阶段的直接输入——每个微步骤对应一个 RED-GREEN-REFACTOR 循环。

产出: `plan.md`（TDD 微步骤）
依赖: tasks

## 生成指令

PRECHECK — 技能可用性：
在调用前确认 `superpowers:writing-plans` 在你的可用技能列表中。若不可用，STOP 并告知用户需要安装 Superpowers（或用户可明确选择用下方模板手动写 plan.md）。不要静默降级。

使用 Skill 工具调用 **superpowers:writing-plans**。

IMPORTANT — 输出重定向：
- 不要写入 `docs/superpowers/plans/`。将 plan 直接写入当前 change 目录的 `plan.md`
- 将 tasks.md 的内容作为分解输入传给 writing-plans 技能

writing-plans 技能将：
1. 读取 tasks.md 和 design.md 获取上下文
2. 将每个 task 拆为 2-5 分钟的 TDD 微步骤
3. 每步包含：目标、文件路径、TDD 步骤（RED → GREEN → REFACTOR）、测试命令、预期输出
4. 在每个 task 后添加 commit 点

## plan.md 结构

每个微步骤应包含：
- **目标：** 这一步要达成什么
- **文件路径：** 涉及的文件
- **TDD 步骤：** RED（写失败测试）→ GREEN（最小实现）→ REFACTOR（重构）
- **测试命令：** 验证该步骤的具体命令
- **预期输出：** 测试通过后的预期结果

## IMPORTANT

- tasks.md 已经完成了粗粒度拆分——plan 的工作是细化，不是重做
- plan 的微步骤粒度 = 一个子 agent 可以在 2-5 分钟内完成的单元
- 每一步都应该是可独立验证的——写完就能跑测试确认

## 约束

- 不跳过 TDD 循环——每步必须有 RED → GREEN → REFACTOR
- 不提供一键生成——始终分步，每步可审查
- plan 完成后不自动进入 apply——给用户空间审视完整计划
