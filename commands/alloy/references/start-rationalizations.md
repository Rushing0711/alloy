# start Red Flags 完整表（第三层防御——任一借口出现即 STOP）

主文件保留 5 条核心，完整 12 条在此。

| 借口 | 现实 |
|------|------|
| "不用建分支了，就在 main 上干吧" | ⛔ HARD_STOP：主分支污染不可逆。建分支只需 2 秒。违反字面 = 违反精神：哪怕"只是先建个目录后面再切"也算（Iron Law 第一层）。 |
| "分支创建是可选步骤" / "用户没提分支" | 分支创建是硬性闸门——没有验证，后续步骤全部禁止。闸门默认生效，不需要用户主动请求。 |
| "项目简单/一个人开发，不需要分支" | 分支保护的是 discard 安全性，不是团队协作。简单项目一样需要——否则 discard 丢失主分支无关变更。 |
| "不用 brainstorming，直接写代码" | brainstorming 不可跳过。跳过需求设计 = 规格和代码分叉的起点。 |
| "brainstorming 完成了，写 spec 文件吧" | Alloy start 的产出是 draft.md，不是 docs/superpowers/specs/。brainstorming 完成后直接输出方案，由 Alloy 流程生成 draft.md。 |
| "start 完成了，直接进 plan" / "用户没回复，我先继续" | ⛔ HARD_STOP：start 完成后绝不自动进入 plan。沉默 ≠ 授权（Iron Law 第二层）。替用户做阶段转换 = 剥夺审查机会。 |
| "draft.md 讨论过了，直接 commit" | brainstorming 讨论的是概念，draft.md 是最终文本。必须展示完整内容，等用户 USER_GATE 确认。 |
| "openspec/changes/<name>/ 已经有了，直接复用" | ⛔ PRECONDITION_FAIL：目录已存在 = #12 冲突。USER_GATE 让用户决策（改名 / 接续 / 中止），禁 agent 自动复用——可能覆盖用户既有工作。 |
| "/opsx:new 失败了，git mkdir 凑合一下" | ⛔ PRECONDITION_FAIL：opsx:new 是 schema 闸门，手工 mkdir 绕过制品 DAG 验证——退出 skill 引导用户排查。 |
| "change name 还没确认，先把分支建了" | ⛔ HARD_STOP：change name 未确认前禁继续步骤 2-9。违反字面 = 违反精神：哪怕"反正 name 大概就这个"。 |
| "git init 后 reset --hard 一下，把环境清干净" | ⛔ HARD_STOP：git 初始化失败禁 reset --hard / clean -fd / checkout .（§3.5.1 git 自救禁令）。退出 skill 让用户处理。 |
| "用户没明确选 (a) 但意思就是进 plan，加载吧" | 沉默 ≠ 授权。USER_GATE 必须明确选择 (a)，不接受推断（Iron Law 第二层）。 |
