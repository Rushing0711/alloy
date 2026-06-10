# 文档对齐 + README 重写

## 范围

纯文档更新，无代码变更。3 个文件。

## 改动

### 1. `docs/specification/01-product-spec.md` — 补充新特性

`.alloy.yaml` 示例补 `skill_usage` 字段；补充 `_skill log` 命令说明；补充 `_state merge` / `_state timestamp ensure` 子命令；§8 关键设计决策补充最近新增的条目。

### 2. `docs/specification/02-visual-spec.md` — 修复 fix 示例

§十 fix 命令完整示例中，诊断确认和主分支确认从旧 `[Y/n]` 更新为 `AskUserQuestion` + 降级文本格式，与 `fix.md` 保持一致。

### 3. `README.md` — 重写核心特性

替换现有"核心特点"小节为 6 条精炼卖点：

1. **流程闸门，不是建议** — 5 阶段 hard gate，脚本硬校验，不可跳过
2. **OpenSpec + Superpowers，一条命令搞定** — 两个工具编成一条流水线，不用学 20+ 个技能
3. **随便打哪个命令，都能接上** — 自动路由 + 幂等检查，断点无缝恢复
4. **改需求不乱** — 按编码进度智能分流，规格和代码不分叉
5. **每次做完，下次更聪明** — retrospective 教训跨周期传递，自动写 memory
6. **每一步都可追溯** — 制品 hash 锁定 + 独立 commit，完整审计链

同时精简现有"核心特点"中偏架构描述的内容（三层防线、决策点），保留对比表（Alloy vs 裸用 Agent）和"Alloy 是什么"。

## 不改的

- `docs/handbook.md` — 开发手册，高层设计未变
- `docs/background/` — 历史参考
- `docs/reference/skill-writing-guide.md` — 最近已更新
- 代码 / Skill 文件

## 验证

纯文档改动，不涉及测试。README.md 改完后在终端 `cat` 检查排版。
