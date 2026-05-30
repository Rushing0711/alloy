# Alloy 命令兼容层设计

> **目标：** Commands-only 部署——将 skill 完整内容迁入 command 文件，取消 skills 部署。按 agent 能力适配冒号/横线格式。交互能力按 Node 版本主动选层。

**核心变化：** 不再部署 `.claude/skills/`。所有指令直接写入 command 文件（自包含），如同 OpenSpec 的做法。每个 agent 只有一套命令，用户不会看到重复。

---

## 1. 8 个 Agent 定义

来源：OpenSpec 的 `config.js`（skillsDir）和各 agent command-generation adapter（getFilePath）。

```typescript
interface AgentInfo {
  id: string;                       // 唯一标识
  label: string;                    // 展示名称
  supportsColonCommands: boolean;   // commands 是否使用冒号目录层级
  commandsDir: string;              // commands 根目录（相对于 home 或 projectPath）
  globalOnly?: boolean;             // commands 仅全局有效（如 Codex）
}
```

| Agent | commandsDir | 冒号 | 文件路径 | 调用 |
|-------|------------|:---:|------|------|
| **Claude Code** | `.claude/commands/` | ✅ | `alloy/start.md` | `/alloy:start` |
| **CodeBuddy** | `.codebuddy/commands/` | ✅ | `alloy/start.md` | `/alloy:start` |
| **Qoder** | `.qoder/commands/` | ✅ | `alloy/start.md` | `/alloy:start` |
| **Cursor** | `.cursor/commands/` | ❌ | `alloy-start.md` | `/alloy-start` |
| **OpenCode** | `.opencode/commands/` | ❌ | `alloy-start.md` | `/alloy-start` |
| **Codex** | `.codex/prompts/` | ❌ | `alloy-start.md` | `/alloy-start` |
| **Trae** | `.trae/commands/` | ❌ | `alloy-start.md` | `/alloy-start` |
| **Pi** | `.pi/prompts/` | ❌ | `alloy-start.md` | `/alloy-start` |

---

## 2. 源文件结构

```
alloy 包内：
  commands/                         ← 取代 skills/ 目录
    alloy/                          ← 冒号格式：完整指令
      start.md                      ← 原 skills/alloy-start/SKILL.md 内容
      plan.md                       ← 原 skills/alloy-plan/SKILL.md 内容
      apply.md
      finish.md
      archive.md
      fix.md
      discard.md
      status.md
      .md                           ← /alloy 帮助页（原 skills/alloy/SKILL.md）
    alloy-start.md                  ← 横线格式：同内容，不同文件名
    alloy-plan.md
    alloy-apply.md
    alloy-finish.md
    alloy-archive.md
    alloy-fix.md
    alloy-discard.md
    alloy-status.md
  openspec/schemas/alloy/           ← 不变
  src/                              ← 不变
```

**冒线版和横线版内容完全一致**，仅文件名不同。每个 `.md` 包含完整的执行指令（原 SKILL.md 内容），不依赖外部 skill。

---

## 3. 交互流程

```
alloy init [path] [--scope global|project]
    │
    ├─ ① selectScope()                         ← project / global
    │
    ├─ ② selectTargetAgents()                  ← 多选（默认全不选）
    │     展示 8 个 agent，不扫描系统
    │     至少选 1 个才能继续
    │
    └─ ③ initCommand({ scope, projectPath, targetAgents })
           ├─ detectEnv()
           ├─ installOpenSpecCli()
           ├─ initOpenSpecProject()
           ├─ installSuperpowers()
           ├─ deployCommands(opts)              ← 新：取代 deploySkills
           ├─ deploySchema(opts)
           ├─ ensureGitignore()
           ├─ injectClaudeMd()
           ├─ runHealthCheck()
           └─ 注册 shell 补全
```

### 交互示例

```
请选择要安装的 AI 工具（可多选，至少选一项）：
  ☐ Claude Code
  ☐ CodeBuddy
  ☐ Qoder
  ☐ Cursor
  ☐ OpenCode
  ☐ Codex
  ☐ Trae
  ☐ Pi
```

---

## 4. 部署实现

### 4.1 DeployOptions

```typescript
interface DeployOptions {
  scope: "global" | "project";
  injectClaudeMd: boolean;
  projectPath: string;
  targetAgents: AgentInfo[];       // 用户选中的 agent
}
```

### 4.2 deployCommands()

```typescript
export async function deployCommands(opts: DeployOptions): Promise<string[]> {
  const deployed: string[] = [];
  const packageRoot = getPackageRoot();
  const home = process.env.HOME || process.env.USERPROFILE || "~";

  for (const agent of opts.targetAgents) {
    // Codex: project 模式跳过
    if (agent.globalOnly && opts.scope === "project") {
      console.log(`     ⚠ Codex prompts 仅全局安装有效，跳过`);
      continue;
    }

    const baseDir = opts.scope === "global"
      ? join(home, agent.commandsDir)
      : join(opts.projectPath, agent.commandsDir);

    const colonSourceDir = join(packageRoot, "commands", "alloy");
    const hyphenSourceDir = packageRoot;  // commands/ 目录下的 alloy-*.md 文件

    if (agent.supportsColonCommands) {
      // 冒号格式：commands/alloy/*.md → {commandsDir}/alloy/*.md
      const targetDir = join(baseDir, "alloy");
      await mkdir(targetDir, { recursive: true });
      const { readdir } = await import("node:fs/promises");
      const entries = await readdir(colonSourceDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        await cp(join(colonSourceDir, entry.name), join(targetDir, entry.name));
        deployed.push(join(targetDir, entry.name));
      }
    } else {
      // 横线格式：commands/alloy-*.md → {commandsDir}/alloy-*.md
      const targetDir = baseDir;
      await mkdir(targetDir, { recursive: true });
      const { readdir } = await import("node:fs/promises");
      const sourceEntries = join(packageRoot, "commands");
      const entries = await readdir(sourceEntries, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.startsWith("alloy-")) continue;
        await cp(join(sourceEntries, entry.name), join(targetDir, entry.name));
        deployed.push(join(targetDir, entry.name));
      }
    }
  }

  return deployed;
}
```

### 4.3 不再部署 skills

`deploySkills()` 移除。`alloy init` 和 `alloy update` 都不再向 `.claude/skills/` 拷贝任何内容。

---

## 5. 交互能力自适应

```
Node major < 20  → stdin readline
Node major ≥ 20  → @inquirer/prompts
```

`prompt.ts` 启动时判断一次 `supportsInquirer`，对外暴露统一 API：

```typescript
export { supportsInquirer };
export async function promptSelect(opts): Promise<string>;
export async function promptMultiSelect(opts): Promise<string[]>;
export async function promptConfirm(message, default?): Promise<boolean>;
```

---

## 6. 错误处理

| 场景 | 行为 |
|------|------|
| 用户一个 agent 都不选 | 提示 "请至少选择一个 AI 工具"，重新显示 |
| 某个 agent 部署失败 | 日志错误，继续下一个 agent |
| 全部 agent 部署失败 | 阻断 init |
| Codex + project scope | 跳过，提示仅全局有效 |
| deploySchema 失败 | 阻断 init |
| shell 补全注册失败 | 静默，不阻断 |

---

## 7. update 命令

`alloy update` 反向推导已部署的目录，更新所有已有部署，无需交互：

```
遍历 KNOWN_AGENTS:
  检查是否存在 {scopeBase}/{agent.commandsDir}/alloy/ 或 alloy-*.md
  存在 → 重新部署
```

---

## 8. 文件改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/core/types.ts` | 修改 | 新增 `AgentInfo`，`DeployOptions` 调整 |
| `src/core/agents.ts` | **新建** | `KNOWN_AGENTS` 注册表 + `detectDeployedAgents()` |
| `src/utils/prompt.ts` | 重构 | `supportsInquirer` + 统一 API |
| `src/core/skills.ts` | 修改 | 移除 `deploySkills`，新增 `deployCommands` |
| `src/cli/commands/init.ts` | 修改 | agent 多选 + 调用 `deployCommands` |
| `src/cli/commands/update.ts` | 修改 | 反向推导 agent + 调用 `deployCommands` |
| `commands/alloy/*.md` | **新建** 9 个 | 冒号版完整指令（含 `/alloy` 帮助） |
| `commands/alloy-*.md` | **新建** 8 个 | 横线版完整指令 |
| `docs/alloy-design.md` | 修改 | 命令名更新 |

### 不再需要的文件

| 文件 | 处理 |
|------|------|
| `skills/alloy/SKILL.md` | 内容迁入 `commands/alloy/.md` |
| `skills/alloy-*/SKILL.md` (8个) | 内容迁入对应 command 文件 |
| `skills/alloy/scripts/` | 脚本保留在 package 内（CLI 调用），不再部署 |

---

## 9. 测试策略

| 模块 | 内容 |
|------|------|
| `agents.ts` | 8 agent 注册表 + `supportsColonCommands` 正确 + `detectDeployedAgents` |
| `prompt.ts` | `supportsInquirer` + `promptMultiSelect` 含空选择校验 |
| `skills.ts` | `deployCommands` 冒号/横线两种格式 + Codex project 跳过 |
| `init.ts` | 集成：agent 多选 → 正确格式部署到多个目录 |
| shell bats | 冒号版和横线版 command 文件内容正确 |
