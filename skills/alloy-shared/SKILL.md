---
name: alloy-shared
description: Alloy 共享 references 背景知识（分支命名/阶段路由/主分支检测等）。不直接调用，被其他 alloy skill 用 REQUIRED BACKGROUND 引用。
disable-model-invocation: true
user-invocable: false
---

# alloy-shared

Alloy 共享背景知识。本 skill 不直接执行，只被其他 alloy skill 用 `REQUIRED BACKGROUND: Understand alloy-shared` 引用。

## references 索引

| 何时用 | 读取 | 内容 |
|-------|------|------|
| 创建/校验分支 | references/branch-naming.md | 分支命名规范 |
| 判断该走哪个 phase | references/phase-routing.md | 阶段路由表 |
| 检测主分支 | references/main-branch-detection.md | 主分支检测逻辑 |
| 回退阶段 | references/phase-downgrade-path.md | 阶段降级路径 |
| 与用户交互 | references/interaction-style.md | 交互风格规范 |
| 调用 alloy skill 前自检 | references/skill-precheck.md | skill 前置检查 |
| 改 spec 后同步 | references/spec-sync.md | spec 同步规则 |
| 校验分支状态 | references/branch-validation.md | 分支校验逻辑 |
| 调用 alloy CLI 命令前查正确用法 | references/cli-reference.md | CLI 命令速查（语法/参数/选项/易错点） |
| 调用 opsx command(explore/new/continue/verify/archive)前查触发方式 | references/opsx-commands.md | opsx command 多 agent 触发规则(冒号 vs 横线) |
| 写 Iron Law 抗合理化第二层措辞 | references/iron-law-violation-pattern.md | "违反字面 = 违反精神"标准措辞模板 |
| 设 USER_GATE pending/clear/reset | references/gate-ceremony.md | _guard user-gate require/pass/reset 流程 + hook-guard 协同 |
| git 自救禁令(merge --abort / reset --hard 等) | references/git-self-rescue-ban.md | 破坏性 git 命令禁令清单 + 嵌入位置 |
| git add 限路径 + 敏感文件清单 | references/git-add-path-ban.md | 禁 git add -A / git add . 的 WHY + 已由 _pre-commit-check 拦截 |
| Phase 框 / Step 标题 视觉规范 | references/phase-frame.md | Unicode 单线框 + [Step N/M] 格式 + 状态符号映射 |
| 状态符号含义(⛔ / 🔴 / ⚠️) | references/hard-stop-meaning.md | PRECONDITION_FAIL / HARD_STOP / USER_GATE / WARN 四类节点区分 |
