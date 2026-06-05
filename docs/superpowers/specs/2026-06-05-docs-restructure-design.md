# 文档结构优化设计

## Why

当前 `docs/` 下 8 份文档平铺排列，读者难以区分"哪份是给谁看的"、"哪份偏底层推导、哪份偏高层使用"。user-guide.md 和 alloy-design.md 内容严重重叠（都写 CLI 命令、5 阶段、.alloy.yaml），alloy-dev-guide.md 和 user-guide.md 的使用场景部分也交叉。

## What

将 8 份文档重组为 **1 份人类手册 + 3 个目录（5 份文档）**，每份有明确的目标读者和职责边界。

## 目标结构

```
docs/
├── handbook.md                          [人类] 高级开发手册
│
├── background/                          [理解] 设计背景
│   ├── 01-origin.md                    项目起源
│   ├── 02-tools-compared.md            OpenSpec vs Superpowers
│   └── 03-workflow-evolution.md        流程设计推导
│
├── specification/                       [定义] 产品规格
│   ├── 01-product-spec.md              产品规格
│   └── 02-visual-spec.md               视觉规范
│
└── reference/                           [参考] 操作规范
    └── skill-writing-guide.md          Skill 编写规范
```

## 目录层次语义

| 层 | 定位 | 读者 | 回答 |
|----|------|------|------|
| **handbook.md** | 从入门到精通 | 人类开发者 | "怎么用、为什么这么用" |
| **background/** | 推导过程 | 人类 + Agent 上下文 | "为什么这样设计" |
| **specification/** | 精确规格 | Agent 主要参考 | "是什么、长什么样" |
| **reference/** | 操作规范 | Agent 写 Skill 时加载 | "怎么写" |

## 各文档职责

### handbook.md（新建）

**来源：** 合并 user-guide.md + alloy-dev-guide.md + 补充设计意图

**大纲：**
- 一、Alloy 设计哲学（三层架构、5 阶段意图、三层防线）
- 二、关键决策指南（分支策略、worktree 决策、SDD vs executing-plans）
- 三、5 阶段详解（人类视角——怎么配合 Agent）
- 四、CLI 命令参考
- 五、构建与测试（aldev、alloy-dev-toggle、npm test）
- 六、配置参考（.alloy.yaml、openspec/config.yaml）
- 七、故障排除 & 踩坑

### background/01-origin.md（迁移 + 精简）

**来源：** project-background.md

**内容：** 项目起源故事——发现两个工具、为什么融合、与 Comet 的区别。浓缩叙事，去掉与 workflow-design.md 重复的场景描述。

### background/02-tools-compared.md（迁移）

**来源：** openspec-vs-superpowers.md

**内容：** OpenSpec 和 Superpowers 的优缺点对比，去掉"参考链接"章节（已在项目中无实际跳转价值）。

### background/03-workflow-evolution.md（迁移 + 修正）

**来源：** workflow-design.md

**内容：** 从原始技能编排到 Alloy 5 阶段的推导过程、DAG 分析、gap 盘点。保留历史推导的原始感，不需完全对齐当前实现。修正 `alloy-finish` 命名为 `alloy:finish`。

### specification/01-product-spec.md（迁移 + 精简）

**来源：** alloy-design.md

**内容：** 完整产品规格——CLI 命令、5 阶段行为、状态文件、架构、DAG、init 流程、关键设计决策。

**精简方向：** 移除与 handbook.md 重叠的使用场景描述、排错内容。保留 Agent 需要的全部流程细节（幂等检查、技能调用、hash 锁定规则等）。

### specification/02-visual-spec.md（迁移）

**来源：** alloy-visual-spec.md

**内容：** 终端输出格式规范，不做内容调整。

### reference/skill-writing-guide.md（保留不动）

**内容：** 不变。

## 删除的文档和去向

| 原文件 | 去向 |
|--------|------|
| user-guide.md | 合并到 handbook.md |
| alloy-dev-guide.md | 合并到 handbook.md |
| project-background.md | → background/01-origin.md |
| openspec-vs-superpowers.md | → background/02-tools-compared.md |
| workflow-design.md | → background/03-workflow-evolution.md |
| alloy-design.md | → specification/01-product-spec.md |
| alloy-visual-spec.md | → specification/02-visual-spec.md |
| skill-writing-guide.md | → reference/skill-writing-guide.md |

## 执行步骤

1. 创建 background/、specification/、reference/ 目录
2. 创建 handbook.md（从 user-guide.md + alloy-dev-guide.md 组装 + 新增设计意图章节）
3. 移动并重命名现有文件到新位置
4. 精简 specification/01-product-spec.md（去掉与 handbook 重叠的使用场景）
5. 删除旧位置文件
6. 更新 README.md 文档导航链接
7. 更新各文档内的交叉引用链接
