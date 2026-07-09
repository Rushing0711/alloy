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
