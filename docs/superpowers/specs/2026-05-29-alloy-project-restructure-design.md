# Alloy 项目结构重组设计

> 从专业角度重新规划项目目录结构，分离源文件与部署产物，建立清晰的 `core/` 业务逻辑层。

## 背景

当前项目存在两个结构问题：

1. **技能文件在 `.claude/` 下** — `.claude/` 是 Claude Code 的配置目录，技能文件是 Alloy 的核心资产（编排逻辑），不是 Claude Code 的配置。源文件应该独立存放，`alloy init` 时部署到用户项目
2. **`utils/deploy.ts` 是 God file** — 282 行，包含了 OpenSpec 安装、Superpowers 安装、技能部署、schema 部署、CLAUDE.md 注入，没有模块边界

## 设计目标

- 根目录干净，一眼可见项目组成部分
- `core/` 层：每个模块单一职责，可独立测试
- `utils/` 层：纯工具函数，无业务逻辑
- 技能文件位置自文档化

## 第 1 节：根目录结构

```
alloy/
├── skills/                    # Alloy 技能源文件
│   ├── alloy/SKILL.md + scripts/
│   ├── alloy-start/SKILL.md
│   ├── alloy-plan/SKILL.md
│   ├── alloy-apply/SKILL.md
│   ├── alloy-archive/SKILL.md
│   ├── alloy-finish/SKILL.md
│   ├── alloy-fix/SKILL.md
│   ├── alloy-discard/SKILL.md
│   └── alloy-status/SKILL.md
├── src/
│   ├── cli/index.ts
│   ├── commands/
│   ├── core/
│   └── utils/
├── test/
├── docs/
├── openspec/schemas/alloy/
├── vendor/superpowers/
├── package.json
└── compat.yaml
```

| 目录 | 变化 | 说明 |
|------|------|------|
| `skills/` | 新增 | 从 `.claude/skills/alloy*/` 迁移 |
| `src/core/` | 新增 | 从 `src/cli/utils/` 拆出核心业务逻辑 |
| `openspec/` | 不动 | OpenSpec 规范路径，源=部署目标，移动零收益 |
| `vendor/` | 不动 | Node.js 生态通用惯例 |
| `.claude/skills/alloy*/` | 删除 | 源文件迁到 `skills/` |
| `.claude/settings.json` | 保留 | Claude Code 项目配置文件 |

## 第 2 节：`src/core/` 模块划分

**原则：** `core/` = 有 Alloy 领域知识的业务逻辑，`utils/` = 纯工具函数。

```
src/
├── cli/index.ts
├── commands/
│   ├── init.ts
│   ├── status.ts
│   ├── doctor.ts
│   └── update.ts
├── core/
│   ├── types.ts          # DeployOptions, EnvInfo, CompatConfig, CompatResult
│   ├── detect.ts         # detectEnv() ← 来自 utils/env.ts
│   ├── openspec.ts       # installOpenSpecCli + initOpenSpecProject + createCustomProfile
│   ├── superpowers.ts    # installSuperpowers + installSuperpowersFromVendor
│   ├── skills.ts         # deploySkills + deploySchema
│   ├── compat.ts         # loadCompat + checkCompat ← 来自 utils/compat.ts
│   └── claude-md.ts      # injectClaudeMd + CLAUDE_MD_MARKER
└── utils/
    ├── state.ts          # AlloyState 读写（不变）
    └── fs.ts             # getPackageRoot ← 从 deploy.ts 提取
```

### 各模块职责

| 模块 | 来源 | 导出 |
|------|------|------|
| `core/types.ts` | 新建，从各文件收集 | `DeployOptions`, `EnvInfo`, `CompatConfig`, `CompatResult` |
| `core/detect.ts` | `utils/env.ts` | `detectEnv()` |
| `core/openspec.ts` | `utils/deploy.ts` | `installOpenSpecCli()`, `initOpenSpecProject()`, `createOpenSpecCustomProfile()` |
| `core/superpowers.ts` | `utils/deploy.ts` | `installSuperpowers()`, `installSuperpowersFromVendor()` |
| `core/skills.ts` | `utils/deploy.ts` | `deploySkills()`, `deploySchema()` |
| `core/compat.ts` | `utils/compat.ts` | `loadCompat()`, `checkCompat()` |
| `core/claude-md.ts` | `utils/deploy.ts` | `injectClaudeMd()`, `CLAUDE_MD_MARKER_START/END` |
| `utils/state.ts` | 不变 | `AlloyState`, `readState()`, `writeState()`, `findActiveChanges()` |
| `utils/fs.ts` | 新建，从 `deploy.ts` 提取 | `getPackageRoot()` |

### Commands import 变化

**init.ts：**

```typescript
// 之前
import { detectEnv } from "../utils/env.js";
import { deploySkills, deploySchema, injectClaudeMd, installOpenSpecCli,
         initOpenSpecProject, installSuperpowers } from "../utils/deploy.js";
import { loadCompat, checkCompat } from "../utils/compat.js";

// 之后
import { detectEnv } from "../core/detect.js";
import { installOpenSpecCli, initOpenSpecProject } from "../core/openspec.js";
import { installSuperpowers } from "../core/superpowers.js";
import { deploySkills, deploySchema } from "../core/skills.js";
import { injectClaudeMd } from "../core/claude-md.js";
import { loadCompat, checkCompat } from "../core/compat.js";
```

**doctor.ts：**

```typescript
// 之前
import { loadCompat, checkCompat } from "../utils/compat.js";
// 之后
import { loadCompat, checkCompat } from "../core/compat.js";
```

**status.ts** — 不变（仅依赖 `utils/state.js`）。

**update.ts** — 自身逻辑为主，不依赖被拆分的模块。

### 删除的文件

| 文件 | 原因 |
|------|------|
| `src/cli/utils/deploy.ts` | 拆入 5 个 core 模块 |
| `src/cli/utils/env.ts` | 移到 `core/detect.ts` |
| `src/cli/utils/compat.ts` | 移到 `core/compat.ts` |

## 第 3 节：`skills/` 迁移 + 路径更新

### 文件移动

```
.claude/skills/alloy/        → skills/alloy/
.claude/skills/alloy-start/  → skills/alloy-start/
.claude/skills/alloy-plan/   → skills/alloy-plan/
.claude/skills/alloy-apply/  → skills/alloy-apply/
.claude/skills/alloy-finish/ → skills/alloy-finish/
.claude/skills/alloy-archive/→ skills/alloy-archive/
.claude/skills/alloy-fix/    → skills/alloy-fix/
.claude/skills/alloy-discard/→ skills/alloy-discard/
.claude/skills/alloy-status/ → skills/alloy-status/
```

### `deploySkills()` 源路径变更

```typescript
// 之前
const skillsSourceDir = join(packageRoot, ".claude", "skills");

// 之后
const skillsSourceDir = join(packageRoot, "skills");
```

### `package.json` files 字段更新

```json
"files": [
  "dist/",
  "compat.yaml",
  "skills/",
  "vendor/",
  "openspec/schemas/alloy/"
]
```

去掉 `.claude/`，加入 `skills/`。

## 第 4 节：`alloy init` 交互式 scope 选择

参考 Comet 的 `@inquirer/prompts`，不传 `--scope` 时交互选择：

```
$ alloy init

  🔍 检测环境...
     Node.js v22 ✓  git ✓  Claude Code ✓

  ? Install scope:  (use arrow keys)
  ❯ Project (current directory)
    Global (home directory)
```

**`selectScope()` 逻辑：**

```typescript
import { select } from "@inquirer/prompts";

async function selectScope(passedScope?: string): Promise<"global" | "project"> {
  if (passedScope) return passedScope as "global" | "project";
  return select({
    message: "Install scope:",
    choices: [
      { name: "Project (current directory)", value: "project" },
      { name: "Global (home directory)", value: "global" },
    ],
  });
}
```

**`init.ts` 入口调整：**

```typescript
// 之前: --scope 必须传，默认 global
const { values } = parseArgs({
  args: restArgs,
  options: {
    scope: { type: "string", default: "project" },
    "inject-claude-md": { type: "boolean", default: false },
  },
});

// 之后: --scope 可选，不传则交互选择
const { values } = parseArgs({
  args: restArgs,
  options: {
    scope: { type: "string" },                              // 去掉 default
    "inject-claude-md": { type: "boolean", default: false },
  },
  strict: false,
});
const scope = await selectScope(values.scope);
```

**CLI 入口（`src/cli/index.ts`）改为 async：**

```typescript
case "init": {
  const { values } = parseArgs({ ... });
  const scope = await selectScope(values.scope as string | undefined);
  await initCommand({
    scope,
    injectClaudeMd: (values["inject-claude-md"] as boolean) || false,
    projectPath: process.cwd(),
  });
  break;
}
```

### 初始化流程（调整后）

```
1. detectEnv()        → 环境检测（不变）
2. selectScope()      → 交互选择（新增，有 --scope 则跳过）
3. installOpenSpecCli → 安装 OpenSpec CLI（不变）
4. initOpenSpecProject→ 初始化 OpenSpec 项目结构（不变）
5. installSuperpowers → 安装 Superpowers（不变）
6. deploySkills       → 部署 Alloy 技能文件（不变）
7. deploySchema       → 部署 schema（不变）
8. injectClaudeMd     → 注入 CLAUDE.md（不变）
9. checkCompat        → 兼容性检查（不变）
```

## 文件变更清单

| 操作 | 文件 |
|------|------|
| 移动 | `.claude/skills/alloy*/` → `skills/alloy*/`（9 个目录） |
| 新建 | `src/core/types.ts` |
| 新建 | `src/core/detect.ts` |
| 新建 | `src/core/openspec.ts` |
| 新建 | `src/core/superpowers.ts` |
| 新建 | `src/core/skills.ts` |
| 新建 | `src/core/compat.ts` |
| 新建 | `src/core/claude-md.ts` |
| 新建 | `src/utils/fs.ts` |
| 修改 | `src/cli/commands/init.ts`（import 路径 + `selectScope()`） |
| 修改 | `src/cli/index.ts`（init case 改为 async，加 selectScope） |
| 修改 | `src/cli/commands/doctor.ts`（import 路径） |
| 修改 | `src/cli/commands/update.ts`（如有引用） |
| 删除 | `src/cli/utils/deploy.ts` |
| 删除 | `src/cli/utils/env.ts` |
| 删除 | `src/cli/utils/compat.ts` |
| 修改 | `package.json`（加 `@inquirer/prompts` 依赖 + files 字段） |
