# Spec 拆分 + 对账机制 设计文档

## 背景

`docs/specification/01-product-spec.md`（831 行）声明为 Alloy 的"唯一真相源"，但实际开发节奏是代码/Skill 文件先行、规格后补。漂移正在从隐性积累为显性破坏。

**根因：** 单一大文件导致更新摩擦高——改 archive 行为需要翻 831 行找到对应段落，开发者（含 Agent）倾向跳过规格更新。

## 设计目标

1. 降低规格更新摩擦——改动粒度和代码改动粒度一致
2. 保留人类全局可读性——仍有一篇文档能看懂 Alloy 全貌
3. 提供稳定的漂移检测——结构化要素可程序化校验
4. 开发者主动对齐，Agent 仅提醒不自动执行

## 一、规格拆分结构

### 目录

```
docs/specification/
├── 01-product-spec/
│   ├── 00-overview.md          # 全局概览
│   ├── 01-start-spec.md        # start 阶段
│   ├── 02-plan-spec.md         # plan 阶段
│   ├── 03-apply-spec.md        # apply 阶段
│   ├── 04-archive-spec.md      # archive 阶段
│   ├── 05-finish-spec.md       # finish 阶段
│   ├── 06-fix-spec.md          # fix 辅助命令
│   ├── 07-discard-spec.md      # discard 辅助命令
│   └── 08-cli-spec.md          # init/update/doctor/version/status + 内部命令
└── 02-visual-spec.md           # 视觉规范（保持不变）
```

### 00-overview.md 内容

从 01-product-spec.md 提取以下章节（原样保留，不重写）：

- 一、命令参考（全部命令表格）
- 三、终端输出视觉规范（引用 02-visual-spec.md）
- 四、状态文件（.alloy.yaml 字段表 + 项目级配置）
- 五、制品依赖 DAG
- 六、架构
- 七、安装与初始化
- 八、关键设计决策（32 条）
- 九、开发可行性评估

**原则：概览不重复阶段细节。** 概览说"plan 阶段按 DAG 顺序逐一产出制品，每步有审查闸门"，具体 5 个制品、审查窗口格式、回溯路径在 02-plan-spec.md 中。

### 各阶段 spec 内容

从 01-product-spec.md 的"二、命令行为"中按阶段拆出对应段落。每个 spec 文件是独立可读的——包含该阶段完整的行为规范，不需要回看 overview。

spec 文件与 skill 文件 1:1 对应：

| spec | skill / src |
|------|------------|
| 00-overview.md | — |
| 01-start-spec.md | commands/alloy/start.md |
| 02-plan-spec.md | commands/alloy/plan.md |
| 03-apply-spec.md | commands/alloy/apply.md |
| 04-archive-spec.md | commands/alloy/archive.md |
| 05-finish-spec.md | commands/alloy/finish.md |
| 06-fix-spec.md | commands/alloy/fix.md |
| 07-discard-spec.md | commands/alloy/discard.md |
| 08-cli-spec.md | src/cli/commands/ |

### 原文件处理

`01-product-spec.md` 删除，被 `01-product-spec/` 目录替代。迁移通过一次性拆分完成（见迁移计划）。

## 二、Behaviors Frontmatter

每个 skill 文件和 spec 文件在 frontmatter 中声明可校验的行为摘要，供对账工具比对。

### Skill 文件格式

```yaml
---
name: "Alloy: Archive"
spec: 01-product-spec/04-archive-spec.md
behaviors:
  stops: 4
  hard_stops: 2
  artifacts: [verify, retrospective, memory]
  transitions_to: finished
  external_calls: [opsx:archive, opsx:verify]
---
```

### Spec 文件格式

```yaml
---
behaviors:
  stops: 4
  hard_stops: 2
  artifacts: [verify, retrospective, memory]
  transitions_to: finished
  external_calls: [opsx:archive, opsx:verify]
---
```

### 字段定义

| 字段 | 类型 | 说明 |
|------|------|------|
| `stops` | number | 🔴 STOP 硬交互确认点数量 |
| `hard_stops` | number | HARD STOP 数量 |
| `artifacts` | string[] | 本阶段产出/涉及的制品名称 |
| `transitions_to` | string | 下一阶段 phase 值 |
| `external_calls` | string[] | 调用的外部命令/技能 |

### 对账逻辑

`alloy _spec-audit` 比较每个 skill 文件的 `behaviors` 与对应 spec 文件的 `behaviors`。不匹配项输出差异报告。

**检测粒度：** 结构化要素（闸门数量、制品清单、阶段转换方向），不做语义比对。

## 三、`alloy _spec-audit` 内部命令

### 定位

内部命令（`_` 前缀），仅供开发者使用，不对最终用户暴露。不写入 `alloy --help` 和 `alloy doctor`。

### 命令格式

```bash
alloy _spec-audit [--fix]
```

### 行为

1. 扫描 `commands/alloy/*.md`，提取每个文件的 `spec` 和 `behaviors` frontmatter
2. 读取对应 spec 文件的 `behaviors` frontmatter
3. 逐字段比对，输出差异报告

**无差异：**
```
✓ archive: spec 与 skill 一致
✓ plan: spec 与 skill 一致
```

**有差异：**
```
✗ archive: spec 与 skill 不一致
  stops: spec=3, skill=4（spec 落后 1 个 🔴 STOP）
  artifacts: spec 缺少 memory
  external_calls: spec 缺少 opsx:verify
```

**spec 锚点缺失（skill 文件无 spec 字段）：**
```
⚠ fix: 未声明 spec 锚点，跳过对账
```

**spec 文件不存在：**
```
✗ start: 对应 spec 文件 01-product-spec/01-start-spec.md 不存在
```

### `--fix` 模式

交互式引导修复——逐项展示差异，询问是否将 skill 的 behaviors 值写入 spec。仅修改 frontmatter，不修改 spec 正文内容。

### 实现位置

`src/cli/commands/internal/spec-audit.ts`，注册为内部命令。

## 四、`spec-sync.md` Reference

`commands/alloy/references/spec-sync.md` 定义开发者对齐规格的标准流程：

1. 运行 `alloy _spec-audit`，查看差异报告
2. 定位变更点——哪个 skill 文件新增/删除了闸门、制品、外部调用
3. 更新 spec 对应章节的**正文内容**（behaviors frontmatter 只是摘要，正文必须同步描述新行为）
4. 更新 spec 的 `behaviors` frontmatter
5. 同 commit 提交——skill 文件变更和 spec 变更在同一个 commit 中

## 五、Agent 提醒机制

### CLAUDE.md 修改前置检查表更新

| 要修改的文件 | 先读 | 分支规则 | 对账 |
|-------------|------|---------|------|
| `commands/alloy/*.md`（Skill 文件） | skill-writing-guide.md | 默认问分支 | 提醒同步 spec |
| `openspec/schemas/`（Schema） | — | 同上 | — |
| `src/`（TypeScript 源码） | — | 同上 | 提醒同步 08-cli-spec.md |
| `docs/specification/`（产品规格） | — | 同上 | — |

### 提醒文本

当 Agent 修改 skill 文件或 src/ 代码时，输出：

> 📋 提醒：此变更可能需要同步产品规格。完成后运行 `alloy _spec-audit` 检查，或手动更新对应 spec 文件。

仅提醒，不自动执行，不阻断。

## 六、迁移计划

1. 创建 `docs/specification/01-product-spec/` 目录
2. 将 01-product-spec.md 的"一、命令参考"+"三~九"章节移入 00-overview.md
3. 将"二、命令行为"的各命令段落拆入 01-07 spec 文件
4. 将 CLI 命令相关内容写入 08-cli-spec.md
5. 删除原 01-product-spec.md
6. 为所有 skill 文件和 spec 文件添加 behaviors frontmatter
7. 运行 `alloy _spec-audit` 确认初始状态一致
8. 更新 CLAUDE.md 修改前置检查表
9. 一次性 commit

### 迁移后的维护约定

- 改 skill 文件 → 同 commit 更新对应 spec
- 改 src/ → 同 commit 更新 08-cli-spec.md
- 改 spec → 检查 skill 文件 behaviors 是否需要同步
- 版本发布前 → 运行 `alloy _spec-audit` 全面对账
