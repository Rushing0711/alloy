# 技能编写指南重写 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从零重写 `docs/reference/skill-writing-guide.md`，统一 writing-skills + skill-creator 方法论，让 Agent 参照指南开发 skill 的效果优秀。

**Architecture:** 单文件文档重写，9 章结构。核心创新在第五章——统一开发流程。信息源：Claude 官方规范（平台基础）→ Superpowers writing-skills（TDD + 抗合理化）→ Claude skill-creator（解释 WHY + 泛化 + 迭代优化）。

**Tech Stack:** Markdown 文档。参考源：`superpowers:writing-skills` 技能文件、`skill-creator` 技能文件、Claude 官方 skills 文档。

**Spec:** `docs/superpowers/specs/2026-06-12-skill-writing-guide-improvement-design.md`

---

## 参考源文件清单

实施者需要在编写时参考以下源文件获取详细内容：

| 源文件 | 用途 |
|--------|------|
| `/Users/wenqiu/.claude/plugins/cache/superpowers-marketplace/superpowers/5.1.0/skills/writing-skills/SKILL.md` | TDD 方法论、CSO、技能类型、铁律 |
| `/Users/wenqiu/.claude/plugins/cache/superpowers-marketplace/superpowers/5.1.0/skills/writing-skills/anthropic-best-practices.md` | 官方最佳实践、自由度校准、渐进式披露模式 |
| `/Users/wenqiu/.claude/plugins/cache/superpowers-marketplace/superpowers/5.1.0/skills/writing-skills/testing-skills-with-subagents.md` | 压力场景设计、TDD RED/GREEN/REFACTOR 详细流程 |
| `/Users/wenqiu/.claude/plugins/cache/superpowers-marketplace/superpowers/5.1.0/skills/writing-skills/persuasion-principles.md` | 说服科学心理学基础、按类型原则组合 |
| `/Users/wenqiu/.claude/plugins/cache/superpowers-marketplace/superpowers/5.1.0/skills/writing-skills/graphviz-conventions.dot` | 流程图形状约定 |
| `/Users/wenqiu/.claude/plugins/cache/claude-plugins-official/skill-creator/1d5ba6426aa2/skills/skill-creator/SKILL.md` | 迭代开发流程、解释 WHY、Description 优化 |

---

### Task 1: 文件初始化 + 第一章 技能类型与质量标准

**Files:**
- Create: `docs/reference/skill-writing-guide-new.md`

- [ ] **Step 1: 创建新文件，写入文档头部和第一章**

内容见 spec 第一章。包含：四种技能类型表（闸门/路径/参考/心智）、说服策略按类型分治表、质量标准定义。

- [ ] **Step 2: 检查行数**

Run: `wc -l docs/reference/skill-writing-guide-new.md`
Expected: ~50-60 行

- [ ] **Step 3: Commit**

```bash
git add docs/reference/skill-writing-guide-new.md
git commit -m "docs: 重写技能编写指南——第一章 技能类型与质量标准"
```

---

### Task 2: 第二章 平台规范

**Files:**
- Modify: `docs/reference/skill-writing-guide-new.md`

参考源：Claude 官方 skills 文档 + skill-creator SKILL.md + anthropic-best-practices.md

- [ ] **Step 1: 在文件末尾追加第二章**

内容见 spec 第二章，6 个子节：2.1 Frontmatter 字段（必需/常用/特殊/高级分层 + 调用控制矩阵 + 按类型推荐）、2.2 目录结构与作用域、2.3 渐进式披露（三阶段 + 三种模式 + 引用只深一层）、2.4 动态上下文注入、2.5 字符串替换变量、2.6 技能内容生命周期。

- [ ] **Step 2: 检查行数**

Run: `wc -l docs/reference/skill-writing-guide-new.md`
Expected: ~180-200 行（累计）

- [ ] **Step 3: Commit**

```bash
git add docs/reference/skill-writing-guide-new.md
git commit -m "docs: 重写技能编写指南——第二章 平台规范"
```

---

### Task 3: 第三章 编写原则

**Files:**
- Modify: `docs/reference/skill-writing-guide-new.md`

这是最长的一章（10 条原则）。参考源：writing-skills SKILL.md、persuasion-principles.md、testing-skills-with-subagents.md、graphviz-conventions.dot、skill-creator SKILL.md。

- [ ] **Step 1: 在文件末尾追加第三章**

内容见 spec 第三章，10 条原则：
1. 解释 WHY 优于堆砌 MUST（共识，闸门型例外）
2. 说服科学三原则（权威/承诺/社会认同）
3. 抗合理化三层防御（显式否定 + 精神/字面阻断 + Red Flags 自检）
4. Gate Function 伪代码
5. 泛化而非过拟合
6. 保持精简
7. 流程图使用规范（何时用/何时不用 + Graphviz 形状约定 + 标签命名约定）
8. 引用强度标记（REQUIRED SUB-SKILL / BACKGROUND / Related）
9. 捆绑重复逻辑为脚本
10. 用反例定义边界

每条原则必须包含正反例代码块（❌/✅ 标记）。

- [ ] **Step 2: 检查行数**

Run: `wc -l docs/reference/skill-writing-guide-new.md`
Expected: ~370-400 行（累计）

- [ ] **Step 3: Commit**

```bash
git add docs/reference/skill-writing-guide-new.md
git commit -m "docs: 重写技能编写指南——第三章 编写原则"
```

---

### Task 4: 第四章 技能结构规范

**Files:**
- Modify: `docs/reference/skill-writing-guide-new.md`

参考源：writing-skills SKILL.md + anthropic-best-practices.md

- [ ] **Step 1: 在文件末尾追加第四章**

内容见 spec 第四章，5 个子节：4.1 Iron Law（每个技能开头一条铁律）、4.2 技能骨架（Iron Law + Steps + Rationalizations 表，约束嵌入步骤）、4.3 Frontmatter 按类型推荐、4.4 技能链设计（线性链条，终端指向唯一后继）、4.5 目录组织。

- [ ] **Step 2: 检查行数**

Run: `wc -l docs/reference/skill-writing-guide-new.md`
Expected: ~440-470 行（累计）

- [ ] **Step 3: Commit**

```bash
git add docs/reference/skill-writing-guide-new.md
git commit -m "docs: 重写技能编写指南——第四章 技能结构规范"
```

---

### Task 5: 第五章 技能开发流程（核心创新）

**Files:**
- Modify: `docs/reference/skill-writing-guide-new.md`

**核心创新章——统一 writing-skills + skill-creator 方法论。** 参考源：writing-skills SKILL.md 全文、testing-skills-with-subagents.md、skill-creator SKILL.md 全文。需要在步骤中清晰展示两个方法论的融合点和分治逻辑。

- [ ] **Step 1: 在文件末尾追加第五章**

内容见 spec 第五章，7 个子节：
5.1 捕获意图（skill-creator：做什么/何时触发/输出格式 + 确定技能类型）
5.2 基线测试（writing-skills RED：无技能观察 Agent 如何失败，逐字记录合理化借口）
5.3 编写草稿（按类型选控制风格：闸门用绝对语言+抗合理化，路径用解释WHY）
5.4 测试评估（两者融合：压力场景定性 + 基线对比定量 + 按类型差异化验证）
5.5 迭代改进（两者互补：writing-skills 堵漏洞 4 层防御 + skill-creator 泛化精简）
5.6 Description 优化（skill-creator：20 查询迭代优化流程）
5.7 检查清单验证

**关键：** 必须在 5.3 中明确展示按类型分治的控制风格选择表，在 5.5 中明确展示堵漏洞与泛化精简的互补关系。

- [ ] **Step 2: 检查行数**

Run: `wc -l docs/reference/skill-writing-guide-new.md`
Expected: ~590-630 行（累计）

- [ ] **Step 3: Commit**

```bash
git add docs/reference/skill-writing-guide-new.md
git commit -m "docs: 重写技能编写指南——第五章 技能开发流程（核心创新）"
```

---

### Task 6: 第六章 Token 效率 + 第七章 反模式

**Files:**
- Modify: `docs/reference/skill-writing-guide-new.md`

两章内容较短，合并为一个任务。

- [ ] **Step 1: 在文件末尾追加第六章和第七章**

第六章内容（见 spec 第六章）：6.1 量化目标、6.2 CSO 含"推一点"策略、6.3 Gotchas 是最高价值内容、6.4 输出格式模板、6.5 压缩技巧。

第七章内容（见 spec 第七章）：12 条反模式表（MUST 堆砌、description 写流程概要、全局约束与操作分离、单体内联、叙事式示例、技能网而非链、空泛 description、技能触发太频繁、压缩后失效、Gotchas 缺失、选项过多无默认、过拟合特定案例）。

- [ ] **Step 2: 检查行数**

Run: `wc -l docs/reference/skill-writing-guide-new.md`
Expected: ~720-760 行（累计）

- [ ] **Step 3: Commit**

```bash
git add docs/reference/skill-writing-guide-new.md
git commit -m "docs: 重写技能编写指南——第六章 Token 效率 + 第七章 反模式"
```

---

### Task 7: 第八章 检查清单 + 第九章 参考

**Files:**
- Modify: `docs/reference/skill-writing-guide-new.md`

- [ ] **Step 1: 在文件末尾追加第八章和第九章**

第八章：5 维检查清单（结构/内容/可靠性/Token 效率/验证），每项都是可勾选的 checkbox。

第九章：参考表（writing-skills 及其子文件、skill-creator、Claude Code Skills 文档、Agent Skills 开放标准）。

- [ ] **Step 2: 检查行数**

Run: `wc -l docs/reference/skill-writing-guide-new.md`
Expected: ~800-850 行（累计）

- [ ] **Step 3: Commit**

```bash
git add docs/reference/skill-writing-guide-new.md
git commit -m "docs: 重写技能编写指南——第八章 检查清单 + 第九章 参考"
```

---

### Task 8: 替换原文件 + 最终审查

**Files:**
- Rename: `docs/reference/skill-writing-guide-new.md` → `docs/reference/skill-writing-guide.md`

- [ ] **Step 1: 备份原文件**

```bash
cp docs/reference/skill-writing-guide.md docs/reference/skill-writing-guide.old.md
```

- [ ] **Step 2: 替换原文件**

```bash
mv docs/reference/skill-writing-guide-new.md docs/reference/skill-writing-guide.md
```

- [ ] **Step 3: 完整性检查——逐章对照 spec**

| Spec 章节 | 新文件对应 | 确认 |
|-----------|-----------|------|
| 第一章：技能类型与质量标准 | 一 | [ ] |
| 第二章：平台规范（6 个子节） | 二 | [ ] |
| 第三章：编写原则（10 条） | 三 | [ ] |
| 第四章：技能结构规范（5 个子节） | 四 | [ ] |
| 第五章：技能开发流程（7 个子节） | 五 | [ ] |
| 第六章：Token 效率（5 个子节） | 六 | [ ] |
| 第七章：反模式（12 条） | 七 | [ ] |
| 第八章：检查清单（5 维） | 八 | [ ] |
| 第九章：参考 | 九 | [ ] |

- [ ] **Step 4: 检查最终行数**

Run: `wc -l docs/reference/skill-writing-guide.md`
Expected: ~800-850 行

- [ ] **Step 5: 删除备份文件**

```bash
rm docs/reference/skill-writing-guide.old.md
```

- [ ] **Step 6: Commit**

```bash
git add docs/reference/skill-writing-guide.md
git add -u docs/reference/skill-writing-guide-new.md docs/reference/skill-writing-guide.old.md
git commit -m "docs: 技能编写指南重写完成——统一 writing-skills + skill-creator 方法论"
```
