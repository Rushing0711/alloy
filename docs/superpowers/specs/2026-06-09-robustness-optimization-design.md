# Alloy 鲁棒性优化设计

> 日期：2026-06-09
> 范围：代码 bug 全修 + Skill 文件弱模型优化 + 跨文件一致性对齐
> 原则：纯优化，不改功能逻辑；开特性分支操作

---

## 背景与目标

Alloy 的 TypeScript 代码层存在若干 bug（非原子写入、并发访问、缺少输入验证等），Skill 文件对弱模型（Qwen3.6 27b/35b-mlx、Gemma4 26b/31b-mlx）不够鲁棒（内联脚本复杂、条件分支嵌套深、幂等检查散落），跨文件规则不一致（git add 规则、section 标题格式、Skill 工具调用原则）。

**目标：**
1. 修复全部已知 bug（高/中/低严重度）
2. 优化 Skill 文件使弱模型能正确执行
3. 统一跨文件规则，对齐 skill-writing-guide

**不变保证：** 所有修复和优化不改变功能逻辑，外部可观察行为不变。

---

## 第一波：代码 bug 全修

### 1.1 高严重度（6 项）

#### H1. 非原子状态文件写入

- **文件：** `src/cli/utils/state.ts`，`writeState` 函数
- **问题：** 直接 `writeFileSync` 写 `.alloy.yaml`，进程中断可导致文件损坏
- **修复：** 先写临时文件 `.alloy.yaml.tmp`，再 `renameSync` 原子替换
- **不变保证：** 外部行为完全不变，仅写入机制更安全

#### H2. 并发状态文件访问

- **文件：** `src/cli/utils/state.ts`
- **问题：** `_state write` 读-改-写无锁，并发调用可丢失更新
- **修复：** `writeState` 加简易文件锁——在与 `.alloy.yaml` 同目录下 `mkdirSync('.alloy.yaml.lock')` 作为锁，操作完成后 `rmdirSync` 释放；超时 5s 自动退出并报错
- **不变保证：** 单进程场景无感知，多进程不再丢失更新

#### H3. `sp[0].version` 空数组崩溃

- **文件：** `src/core/health.ts`，`checkSuperpowers` 函数
- **问题：** `sp[0].version` 未检查 `sp` 是否为空数组
- **修复：** 加 `if (!sp || sp.length === 0)` 检查，空时返回 `{ status: "not_installed" }`
- **不变保证：** 已安装时行为不变

#### H4. `readState` 未验证状态

- **文件：** `src/cli/utils/state.ts`
- **问题：** `readState` 返回的对象未校验，非法 phase 值静默通过
- **修复：** 新增 `validateState(state)` 函数，校验 `phase` 在合法枚举内、`records` 为对象、`created_at` 为字符串；非法时抛 `AlloyStateError`
- **不变保证：** 合法状态通过无变化

#### H5. `"~"` 路径回退

- **文件：** `src/core/agents.ts` 及其他 7 处
- **问题：** `process.env.HOME || "~"` 回退到字面 `"~"`，Node fs 不展开
- **修复：** 全部改用 `os.homedir()`
- **不变保证：** 有 HOME 时路径相同；无 HOME 时从"静默失败"变为"正确路径"

#### H6. `deploySchema` 未捕获异常

- **文件：** `src/cli/commands/init.ts`
- **问题：** `deploySchema` 抛异常会导致 init 整体 crash
- **修复：** 加 try-catch，失败时输出清晰错误信息，返回非零退出码
- **不变保证：** 成功路径不变

### 1.2 中严重度（6 组）

#### M1. `loadCompat` 返回未验证结构

- **文件：** `src/core/compat.ts`
- **修复：** 加 `compatible` 和 `install` 字段存在性检查，缺失时抛 `CompatError`

#### M2. `injectClaudeMd` 缺 end marker 时损坏文件

- **文件：** `src/core/claude-md.ts`
- **修复：** 找不到 `CLAUDE_MD_MARKER_END` 时跳过删除步骤，仅追加新内容

#### M3. 包名/安装命令硬编码

- **文件：** `src/cli/commands/update.ts`、`src/core/openspec.ts`、`src/core/superpowers.ts`
- **修复：** 统一从 `compat.yaml` 的 `install` 字段或 `package.json` 的 `name` 字段读取

#### M4. 内部命令缺少输入验证

- **文件：** `src/cli/commands/internal/state.ts`、`config.ts`、`guard.ts`、`src/cli/commands/init.ts`
- **修复：**
  - `_state write`：加 `phase` 字段白名单校验
  - `_config write`：加已知 config key 白名单
  - `_guard`：`targetPhase` 已有 `VALID_TRANSITIONS` 校验，无需额外修改
  - `init --scope`：加 `"global" | "project"` 枚举校验

#### M5. 静默失败

- **文件：** `update.ts`、`init.ts`、`superpowers.ts`
- **修复：**
  - `update` 升级失败后明确说明"部署的是旧版本命令"
  - `init` shell completion 失败记录到 results（非空 catch）
  - `fallbackInstall` 返回错误信息

#### M6. 错误处理不一致

- **文件：** `guard.ts` 及相关
- **修复：**
  - 内部命令用 `throw new AlloyError(message)` 替代 `process.exit(1)`
  - CLI 入口 `index.ts` catch 后 `process.exit(1)`
  - 统一返回类型：`installOpenSpecCli`/`installSuperpowers`/`deployCommands` 统一为 `{ status: "ok" | "failed", message?: string }`

### 1.3 低严重度（4 组）

#### L1. `computeHash` 重复实现

- **文件：** `guard.ts`、`record.ts`
- **修复：** 抽到 `src/cli/utils/hash.ts`，两处 import

#### L2. 测试覆盖缺口

- **修复：** 每修一个 bug 同步补对应测试（具体清单见实施计划）

#### L3. 测试 flaky

- **修复：** `Date.now()` 改 `mkdtempSync`；`callCount` 改 mock 函数匹配

#### L4. 小代码质量

- **修复：** `parseArgs` 用 `values.json`；`deepMerge` 返回类型改 `AlloyState`；路径尾部斜杠统一

---

## 第二波：Skill 文件弱模型优化

### 核心原则

- **不拆文件**，保持 8 个 skill 文件
- **不改流程**，功能逻辑不变
- **降认知负担**：删除内联脚本、条件分支改决策表、每步加自检点

### 2.1 apply.md

| 优化项 | 方案 |
|--------|------|
| worktree 双写 bash 脚本 | 改用 `alloy _state write` 命令替代手写 bash 逻辑 |
| 内联 Python 回退脚本 | 改用 `alloy _record check` + `alloy _state write` 命令组合 |
| 策略选择 4 步加载 | 改为决策表（2×2：任务数 × SDD 可用性），查表确定策略 |
| 幂等检查散落 | 每步开头加"进入条件"表格 |
| verify.md 重写指令 | 加自检点确认 |

### 2.2 plan.md

| 优化项 | 方案 |
|--------|------|
| DAG 依赖表 | 改为纵向生成顺序表 |
| hash 检查流程 | 简化为 `alloy _record check` 一条命令 |
| 回退 Python 脚本 | 改用 `_state write` + `_record` 命令 |

### 2.3 archive.md

| 优化项 | 方案 |
|--------|------|
| worktree 清理兼容逻辑 | 改为决策表（3 行：有/仅有 feature_branch/无分支信息） |
| ARCHIVE_DIR 路径构造 | 加 `ls -d` 存在性验证 |
| `git add -A` | 改为精确路径，去掉 `-A` |

### 2.4 start.md

| 优化项 | 方案 |
|--------|------|
| 分支选择 5 步嵌套 | 改为决策表（4 行条件 × 操作） |
| 时间戳处理 | 加自检点确认不存储 bash 变量 |
| 自由探索路径 | 明确提示用户执行 `/alloy:start <topic>` |

### 2.5 finish.md

| 优化项 | 方案 |
|--------|------|
| 内联 receiving-code-review | 改为 `用 Skill 工具调用 superpowers:receiving-code-review` |
| ARCHIVE_DIR glob 匹配 | 加 basename 精确匹配 |
| 选项 3 无 next step | 加提示"后续运行 /alloy:finish 继续收尾" |

### 2.6 status.md / discard.md / fix.md

- **status.md**：加 `.alloy.yaml` 不存在时的友好提示
- **discard.md**：加 uncommitted changes 检查
- **fix.md**：加 `alloy status --json` 失败回退处理

### 2.7 跨文件统一

| 统一项 | 目标格式 |
|--------|---------|
| section 标题 | `## Alloy · <阶段> · <描述>` + `### Step N/M` |
| 自检点 | `> **自检**：条件1？条件2？全部 ✓ 才继续` |
| 决策表 | markdown 表格，首列条件，后续列操作 |
| git add | 精确路径，禁止 `-A`/`-a` |
| 闸门规则 | `> **闸门**：<描述>。不满足则 HARD STOP` |

---

## 第三波：跨文件一致性对齐

### 3.1 Skill → Skill Writing Guide 对齐

| 规范项 | 目标 |
|--------|------|
| description 只写触发条件 | 微调 start.md 措辞 |
| section 标题格式 | 全部改为 `## Alloy · <阶段> · <描述>` + `### Step N/M` |
| 外部技能调用 | 统一用 Skill 工具，不内联 |
| 闸门规则格式 | 统一为 `> **闸门**：...` |
| 反例定义 | 每个闸门补至少 1 个反例 |

### 3.2 产品规格和视觉规格同步

- `docs/specification/01-product-spec.md`：步骤顺序、闸门描述
- `docs/specification/02-visual-spec.md`：section 标题格式、自检点格式

### 3.3 Handbook 同步

- `docs/handbook.md`：命令行为和步骤描述

### 3.4 验证方式

每波完成后：
1. `npm test` 全量通过
2. `npm run build` 成功
3. `aldev` 手动走完整流程验证功能不变
4. 弱模型测试 skill 执行正确率

---

## 分支策略

在 `main` 上创建 `refactor/robustness-optimization` 分支，所有工作在此分支进行。每波完成后可选择性合并回 main（squash merge）。
