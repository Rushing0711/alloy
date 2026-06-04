# alloy init 检测逻辑改进

## Why

当前 `alloy init` 在安装 OpenSpec 和 Superpowers 时，没有按"项目级→用户级"优先级检测现有安装。问题：

1. **无位置感知**：只检测是否全局安装，不检测项目级已有的 commands/skills
2. **无版本比较**：不比较已安装版本与要求版本、要安装版本
3. **无覆盖提示**：直接覆盖已有安装，用户无感知
4. **agent 不统一**：不同 agent 的检测逻辑不一致

## What

新建统一检测模块 `detect-installations.ts`，改进 `alloy init` 的安装流程，在每个安装步骤前检测已有安装并提示用户决策。

## 关键决策

### 1. 架构：新建统一检测模块

创建 `src/core/detect-installations.ts`，提供统一的检测函数供所有安装模块调用。检测按 agent 类型参数化，使用 `agents.ts` 中的 `KNOWN_AGENTS` 获取各 agent 的路径。

```typescript
interface InstallationInfo {
  found: boolean;
  location: "project-command" | "project-skill" | "user-command" | "user-skill" | "user-plugin" | null;
  path: string | null;
  version: string | null;
}

// 检测某 agent 的命令是否存在
function detectCommand(name: string, agent: AgentInfo, projectPath: string): InstallationInfo;

// 检测某 agent 的技能是否存在（仅 Claude Code 有 skills/plugins）
function detectSkill(name: string, agent: AgentInfo, projectPath: string): InstallationInfo;
```

### 2. 检测优先级

按 agent 类型查找正确的路径。以 Claude Code 为例：

```
项目级 command (.claude/commands/) →
项目级 skill (.claude/skills/) →
用户级 command (~/.claude/commands/) →
用户级 skill (~/.claude/skills/) →
用户级 plugin (~/.claude/plugins/cache/...)
```

其他 agent（Cursor、OpenCode 等）只检测 command 路径（它们没有 skills/plugins 概念）。

**多 agent 场景：** 用户选择 Claude Code + Cursor 时，各自独立检测：
```
Claude Code: 检测 .claude/commands/ + .claude/skills/ + plugins
Cursor: 检测 .cursor/commands/
→ 各自报告结果，各自独立决定是否覆盖
```

找到第一个匹配即返回。

### 3. 检测范围

| 组件 | 检测类型 | 版本比较 |
|------|---------|---------|
| OpenSpec CLI | npm 全局包 | 有（`openspec --version` vs compat.yaml） |
| OpenSpec commands | command 存在性 | 无 |
| OpenSpec skills | skill 存在性 | 无 |
| Superpowers plugin | plugin 存在性 | 有（installed_plugins.json vs compat.yaml + 要安装版本） |
| Superpowers skills | skill 存在性 | 无 |
| Alloy commands | command 存在性 | 无 |

**OpenSpec 原则：存在啥检测啥，不强制补全。** 用户通过 `openspec config profile` 配置安装模式（commands/skills/两者），alloy init 不改变用户的已有模式。

### 4. 版本比较策略

两个维度：
- **已安装 vs 要求版本**（compat.yaml）→ 判断兼容性
- **已安装 vs 要安装版本** → 判断升级/降级/同版本

| 场景 | 提示 | 建议 |
|------|------|------|
| 同版本 | "已安装 vX.Y.Z（位置），是否覆盖？" | 可跳过 |
| 旧版本 + 满足要求 | "已安装 vX.Y.Z，可升级到 vA.B.C" | 推荐升级 |
| 旧版本 + 不满足要求 | "已安装 vX.Y.Z，不满足要求 ≥A.B.C" | 必须升级 |
| 新版本 | "已安装 vX.Y.Z，比要装的 vA.B.C 更新" | 警告，可跳过 |

对于无版本的组件（commands/skills），只做存在性检测：存在则提示"已存在（位置），是否覆盖？"

### 5. init 流程改进

```
alloy init
│
├─ 1. 环境检测（不变）
├─ 2. 安装 OpenSpec CLI（不变）
│
├─ 3. 初始化 OpenSpec 项目（新增检测，按每个选中的 agent 独立检测）
│     for agent in selectedAgents:
│       detectCommand("opsx/continue", agent, projectPath)
│       detectSkill("openspec-explore", agent, projectPath)  // 仅 Claude Code
│     ├─ 都不存在 → 正常 openspec init --tools <agents>
│     └─ 存在 → 展示各 agent 的检测结果
│                "openspec init 可能覆盖，继续？" → 用户选择
│
├─ 4. 安装 Superpowers（新增检测，仅 Claude Code 有 skills/plugins）
│     detectSkill("brainstorming", claudeAgent, projectPath)
│     ├─ not found → 正常安装
│     └─ found → 版本比较 → 提示覆盖/跳过/升级 → 用户选择
│
├─ 5. 部署 Alloy commands（新增检测，按每个选中的 agent 独立检测）
│     for agent in selectedAgents:
│       detectCommand("alloy/start", agent, projectPath)
│     ├─ 全部 not found → 正常部署
│     └─ 部分/全部 found → 展示各 agent 的检测结果
│                           "是否覆盖？" → 用户选择（可按 agent 独立决策）
│
├─ 6-10. Schema / .gitignore / CLAUDE.md / 兼容性 / 补全（不变）
```

### 6. 测试策略

- `detect-installations.ts`：纯函数，vitest 单元测试
- 覆盖场景：5 种位置都存在、只有部分存在、都不存在
- 多 agent：Claude Code 有 skills/plugins，Cursor 只有 commands
- 版本比较：升级/降级/同版本/不满足要求/无版本
- 集成测试：mock 文件系统，验证 init 流程的检测→提示→决策

## 范围与边界

**本次修改：**
- 新建 `src/core/detect-installations.ts`
- 修改 `src/core/openspec.ts`（集成检测）
- 修改 `src/core/superpowers.ts`（集成检测）
- 修改 `src/core/skills.ts`（集成检测）
- 修改 `src/cli/commands/init.ts`（集成检测结果展示和用户选择）
- 新增 `src/core/__tests__/detect-installations.test.ts`

**不在范围内：**
- `commands/alloy/` skill 文件改动（已在 PR #7 完成）
- `alloy doctor` 改动（后续单独规划）
- 其他 agent 的特定适配（所有 agent 统一逻辑）
