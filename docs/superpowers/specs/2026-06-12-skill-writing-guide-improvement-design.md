# 技能编写指南重写设计

> 日期：2026-06-12
> 目标：基于 Claude 官方规范 + Superpowers/skill-creator 方法论，从零重写技能编写指南
> 核心原则：让 Agent 参照指南开发 skill 的效果优秀
> 方法论：统一 writing-skills（TDD + 抗合理化）+ skill-creator（解释 WHY + 泛化 + 迭代优化）

---

## 方法论统一

### writing-skills 与 skill-creator 的分治与互补

两个方法论的控制风格看似冲突（绝对命令 vs 解释 WHY），实际按技能类型分治后完全互补：

| 维度 | writing-skills | skill-creator | 统一后 |
|------|---------------|---------------|--------|
| 起点 | 先看失败（RED first） | 先写草稿（Draft first） | 先理解意图 → 再看基线 → 再写草稿 |
| 控制风格 | 绝对命令（闸门型） | 解释 WHY（路径型） | 按类型分治：闸门用绝对语言，路径解释 WHY |
| 改进焦点 | 堵合理化漏洞 | 泛化 + 保持精简 + 解释 WHY | 互补：闸门堵漏洞，路径泛化精简 |
| 测试方式 | 压力场景（定性） | 基线对比 + 定量评分 | 融合：压力场景 + 定量评分 |
| description | CSO 四要点（原则级） | 20 查询迭代优化（工程级） | 原则 + 工程化流程 |

### 统一开发流程

```
1. 捕获意图 → 确定技能类型（闸门/路径/参考/心智）
2. 基线测试（先看失败——writing-skills RED）
3. 编写草稿（按类型选择控制风格——GREEN + skill-creator Draft）
4. 测试评估（压力场景 + 定量评分——两者融合）
5. 迭代改进（堵漏洞 + 泛化精简——两者互补）
6. Description 优化（20 查询迭代——skill-creator）
7. 检查清单验证
```

---

## 文档结构（从零重写）

### 第一章：技能类型与质量标准

四种技能类型，每种有独特的写法、说服策略和验证方法：

| 类型 | 特征 | 写法 | 说服策略 | 验证 | 例子 |
|------|------|------|---------|------|------|
| **闸门型** | 二元判断，通过/不通过 | 绝对语言，无例外条款 | 权威 + 承诺 + 社会认同 | 压力场景 | 阶段校验、hash 验证 |
| **路径型** | 需要判断力，场景多变 | 解释 WHY，给方向不给细节 | 适度权威 + 团结 | 应用场景 | 需求设计、代码审查 |
| **参考型** | 提供知识 | 检索友好，结构化，Gotchas | 仅清晰度 | 检索场景 | API 文档、语法参考 |
| **心智型** | 改变思考框架 | 模式识别 + 应用场景 | 承诺 + 社会认同 | 识别+应用 | TDD 思维、系统化调试 |

质量标准：
- 闸门型：走过场不可能
- 路径型：方向正确不僵化
- 参考型：检索即答案
- 心智型：识别即应用

### 第二章：平台规范

#### 2.1 Frontmatter 字段

**必需：** `name`（1-64 字符，匹配目录名）+ `description`（只写触发条件，≤1536 字符含 when_to_use）

**常用：** `when_to_use`、`disable-model-invocation`、`user-invocable`

**特殊：** `arguments`、`argument-hint`、`allowed-tools`、`disallowed-tools`

**高级：** `model`、`effort`、`context`、`agent`、`hooks`、`paths`、`shell`

调用控制矩阵 + 按类型推荐字段组合

#### 2.2 目录结构与作用域

三级作用域 + 辅助文件目录

#### 2.3 渐进式披露

三阶段 + 三种模式 + 引用只深一层

#### 2.4 动态上下文注入

`!`command`` 语法 + 多行围栏

#### 2.5 字符串替换变量

$ARGUMENTS、$N、$name、${CLAUDE_SKILL_DIR} 等

#### 2.6 技能内容生命周期

会话保留 + 压缩时 5000 token/技能 + 25000 token 总预算

### 第三章：编写原则

统一 writing-skills + skill-creator 的 10 条原则：

1. **解释 WHY 优于堆砌 MUST**（共识，闸门型例外）
2. **说服科学三原则**（writing-skills：权威、承诺、社会认同）
3. **抗合理化三层防御**（writing-skills：显式否定 + 精神/字面阻断 + Red Flags 自检）
4. **Gate Function 伪代码**（writing-skills：关键决策点用伪代码）
5. **泛化而非过拟合**（skill-creator：找更好的模式，不加 ad-hoc 规则）
6. **保持精简**（skill-creator：删掉不拉动的部分，提供默认值）
7. **流程图使用规范**（writing-skills：何时用/何时不用 + 形状约定）
8. **引用强度标记**（writing-skills：REQUIRED SUB-SKILL / BACKGROUND / Related）
9. **捆绑重复逻辑为脚本**（skill-creator：scripts/ 避免重新发明）
10. **用反例定义边界**（共识：给具体反例比说"做得好"有效）

### 第四章：技能结构规范

4.1 Iron Law — 每个技能开头一条铁律
4.2 技能骨架 — Iron Law + Steps + Rationalizations 表
4.3 Frontmatter 按类型推荐
4.4 技能链设计 — 线性链条，终端指向唯一后继
4.5 目录组织

### 第五章：技能开发流程

统一 writing-skills + skill-creator 的开发流程：

5.1 **捕获意图**（skill-creator）— 技能做什么、何时触发、输出格式
5.2 **基线测试**（writing-skills RED）— 无技能观察 Agent 如何失败
5.3 **编写草稿**（writing-skills GREEN + skill-creator）— 按类型选控制风格
5.4 **测试评估**（两者融合）— 压力场景 + 定量评分 + 用户审查
5.5 **迭代改进**（两者互补）— 堵漏洞 + 泛化精简
5.6 **Description 优化**（skill-creator）— 20 查询迭代
5.7 **检查清单验证**

### 第六章：Token 效率

6.1 量化目标
6.2 CSO（Claude 搜索优化）— 含"推一点"策略
6.3 Gotchas 是最高价值内容
6.4 输出格式模板
6.5 压缩技巧

### 第七章：反模式

12 条反模式（含过拟合、MUST 堆砌、空泛 description 等）

### 第八章：检查清单

结构/内容/可靠性/Token 效率/验证 五维检查

### 第九章：参考

---

## 实施策略

1. **从零重写** `docs/reference/skill-writing-guide.md`，不参考现有内容
2. 按章节顺序编写，每章完成后 `wc -l` 检查行数
3. 第五章是核心创新——统一开发流程，需要清晰展示两个方法论的融合点
4. 完成后使用 `superpowers:writing-skills` 流程验证指南质量
5. 用 `aldev` 测试 Agent 能否按指南编写技能
