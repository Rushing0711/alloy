# Alloy 项目结构重组 实现计划

> **For agentic workers:** 使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按 task 逐步实现。步骤使用 checkbox (`- [ ]`) 语法追踪。

**Goal:** 重组项目目录结构：技能文件从 `.claude/skills/` 迁移到 `skills/`，拆分 `utils/deploy.ts` God file 为 6 个 core 模块，`alloy init` 支持交互式 scope 选择。

**Architecture:** 三层改动——文件移动（skills/ 迁移）→ 模块拆分（core/ 新建 + utils/ 精简）→ 入口改造（commands import 更新 + init 交互式 scope）。

**Tech Stack:** TypeScript, Node.js ≥ 22, `@inquirer/prompts`, vitest

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `skills/alloy*/` | 新建（移动） | Alloy 技能源文件（9 个目录） |
| `src/core/types.ts` | 新建 | 共享类型定义 |
| `src/core/detect.ts` | 新建 | 环境检测 |
| `src/core/openspec.ts` | 新建 | OpenSpec CLI 安装 + 项目初始化 |
| `src/core/superpowers.ts` | 新建 | Superpowers 安装 + 离线兜底 |
| `src/core/skills.ts` | 新建 | 技能 + schema 部署 |
| `src/core/compat.ts` | 新建 | 兼容性检查 |
| `src/core/claude-md.ts` | 新建 | CLAUDE.md 注入 |
| `src/utils/fs.ts` | 新建 | 文件系统工具 |
| `src/cli/commands/init.ts` | 修改 | import 更新 + selectScope() |
| `src/cli/index.ts` | 修改 | init case 改为 async |
| `src/cli/commands/doctor.ts` | 修改 | import 路径 |
| `src/cli/commands/update.ts` | 修改 | 路径引用更新 |
| `src/cli/utils/deploy.ts` | 删除 | 拆入 core/ |
| `src/cli/utils/env.ts` | 删除 | 移到 core/detect.ts |
| `src/cli/utils/compat.ts` | 删除 | 移到 core/compat.ts |
| `package.json` | 修改 | 加依赖 + files 字段 |
| `.claude/skills/alloy*/` | 删除 | 迁到 skills/ |

---

### Task 1: 安装新依赖 + 移动技能文件

**Files:**
- Modify: `package.json`
- Move: `.claude/skills/alloy*/` → `skills/alloy*/`

- [ ] **Step 1: 安装 @inquirer/prompts**

```bash
npm install @inquirer/prompts
```

Expected: 依赖加到 `package.json` 的 `dependencies` 中。

- [ ] **Step 2: 更新 package.json files 字段**

将 `package.json` 中的 `"files"` 数组改为：

```json
"files": [
  "dist/",
  "compat.yaml",
  "skills/",
  "vendor/",
  "openspec/schemas/alloy/"
]
```

- [ ] **Step 3: 移动技能文件到 skills/**

```bash
mkdir -p skills
cp -r .claude/skills/alloy skills/
cp -r .claude/skills/alloy-start skills/
cp -r .claude/skills/alloy-plan skills/
cp -r .claude/skills/alloy-apply skills/
cp -r .claude/skills/alloy-archive skills/
cp -r .claude/skills/alloy-finish skills/
cp -r .claude/skills/alloy-fix skills/
cp -r .claude/skills/alloy-discard skills/
cp -r .claude/skills/alloy-status skills/
```

- [ ] **Step 4: 验证新目录**

```bash
ls -d skills/alloy*/SKILL.md | wc -l
```

Expected: `9`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json skills/
git commit -m "chore: 技能文件从 .claude/skills/ 迁移到 skills/

- 安装 @inquirer/prompts 依赖
- skills/ 作为 Alloy 技能源文件目录
- package.json files 字段替换 .claude/ 为 skills/

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 创建 src/core/types.ts

**Files:**
- Create: `src/core/types.ts`

- [ ] **Step 1: 创建类型文件**

将以下内容写入 `src/core/types.ts`：

```typescript
export interface DeployOptions {
  scope: "global" | "project";
  injectClaudeMd: boolean;
  projectPath: string;
}

export interface EnvInfo {
  nodeVersion: string;
  gitInstalled: boolean;
  claudeCodeInstalled: boolean;
}

export interface CompatConfig {
  compatible: { openspec: string; superpowers: string };
  install: { openspec: string; superpowers: string };
}

export interface CompatResult {
  name: string;
  current: string;
  required: string;
  compatible: boolean;
}

export interface AlloyState {
  phase: "started" | "planned" | "applied" | "finished";
  worktree: string | null;
  schema_version: number;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit
```

Expected: 无错误（types.ts 自身不会报错）

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(core): 新建 types.ts — 共享类型定义

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 创建 src/utils/fs.ts + src/core/detect.ts

**Files:**
- Create: `src/utils/fs.ts`
- Create: `src/core/detect.ts`

- [ ] **Step 1: 创建 src/utils/fs.ts**

```typescript
import { join } from "node:path";

export function getPackageRoot(): string {
  // 从 dist/utils/ 回到包根目录（3 级: utils → dist → root）
  return join(import.meta.dirname, "..", "..");
}
```

注意：`getPackageRoot()` 的层级取决于编译产物路径。当前 `src/cli/utils/deploy.ts` 中 `import.meta.dirname` 指向 `dist/cli/utils/`，所以 3 级回退。`src/utils/fs.ts` 编译后路径是 `dist/utils/`，所以只需 2 级回退。

- [ ] **Step 2: 创建 src/core/detect.ts**

```typescript
import { execSync } from "node:child_process";
import type { EnvInfo } from "./types.js";

export function detectEnv(): EnvInfo {
  const nodeVersion = process.version.slice(1);

  let gitInstalled = false;
  try {
    execSync("git --version", { stdio: "pipe" });
    gitInstalled = true;
  } catch {
    // git 未安装
  }

  let claudeCodeInstalled = false;
  try {
    execSync("claude --version", { stdio: "pipe" });
    claudeCodeInstalled = true;
  } catch {
    // Claude Code 未安装
  }

  return { nodeVersion, gitInstalled, claudeCodeInstalled };
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/utils/fs.ts src/core/detect.ts
git commit -m "feat(core): 新建 detect.ts + utils/fs.ts

- core/detect.ts: detectEnv() 环境检测
- utils/fs.ts: getPackageRoot() 包根路径工具

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 创建 src/core/openspec.ts

**Files:**
- Create: `src/core/openspec.ts`

- [ ] **Step 1: 创建文件**

```typescript
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

function createCustomProfile(): { env: NodeJS.ProcessEnv; cleanup: () => void } {
  const configHome = mkdtempSync(join(tmpdir(), "alloy-openspec-profile-"));
  const openspecConfigDir = join(configHome, "openspec");
  mkdirSync(openspecConfigDir, { recursive: true });

  const config = {
    featureFlags: {},
    profile: "custom",
    delivery: "both",
    workflows: [
      "propose", "explore", "new", "continue", "apply", "ff",
      "sync", "archive", "bulk-archive", "verify", "onboard",
    ],
  };
  writeFileSync(
    join(openspecConfigDir, "config.json"),
    JSON.stringify(config, null, 2) + "\n",
    "utf-8",
  );

  return {
    env: { ...process.env, XDG_CONFIG_HOME: configHome },
    cleanup: () => rmSync(configHome, { recursive: true, force: true }),
  };
}

export async function installOpenSpecCli(): Promise<"installed" | "skipped" | "failed"> {
  try {
    execSync("openspec --version", { stdio: "pipe" });
    console.log("     ✓ OpenSpec CLI 已安装，跳过");
    return "skipped";
  } catch {
    // 未安装，继续
  }

  try {
    execSync("npm install -g @fission-ai/openspec@1", {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    return "installed";
  } catch {
    return "failed";
  }
}

export async function initOpenSpecProject(
  projectPath: string,
  scope: "global" | "project"
): Promise<"initialized" | "skipped" | "failed"> {
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  const targetPath = scope === "global" ? home : projectPath;
  const label = scope === "global" ? "全局" : "项目";

  if (scope === "project") {
    const configPath = join(projectPath, "openspec", "config.yaml");
    try {
      await readFile(configPath, "utf-8");
      console.log(`     ✓ ${label}已初始化 OpenSpec，跳过`);
      return "skipped";
    } catch {
      // 文件不存在，需要初始化
    }
  }

  const profile = createCustomProfile();
  try {
    execSync(
      `openspec init ${JSON.stringify(targetPath)} --tools claude --profile custom`,
      { stdio: "pipe", timeout: 120_000, env: profile.env },
    );
    console.log(`     ✓ openspec init 完成（${label}）`);
    return "initialized";
  } catch (error) {
    console.error(`     ✗ openspec init 失败: ${(error as Error).message}`);
    return "failed";
  } finally {
    profile.cleanup();
  }
}
```

- [ ] **Step 2: 编译验证**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/core/openspec.ts
git commit -m "feat(core): 新建 openspec.ts — OpenSpec CLI 安装 + 项目初始化

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 创建 src/core/superpowers.ts

**Files:**
- Create: `src/core/superpowers.ts`

- [ ] **Step 1: 创建文件**

```typescript
import { mkdir, cp } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { getPackageRoot } from "../utils/fs.js";

export async function installSuperpowers(
  scope: "global" | "project"
): Promise<"installed" | "skipped" | "failed"> {
  try {
    const output = execSync("npx skills list", { stdio: "pipe" }).toString();
    if (output.includes("brainstorming") && output.includes("using-git-worktrees")) {
      console.log("     ✓ Superpowers 已安装，跳过");
      return "skipped";
    }
  } catch {
    // 未安装
  }

  const scopeFlag = scope === "global" ? "-g" : "";
  const flags = ["-y", scopeFlag, "--agent claude-code"].filter(Boolean).join(" ");

  try {
    execSync(`npx skills add obra/superpowers ${flags}`, {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    return "installed";
  } catch {
    console.log("     ⚠ 网络不可达，使用内置 Superpowers skill");
    return await installSuperpowersFromVendor(scope, process.cwd());
  }
}

async function installSuperpowersFromVendor(
  scope: "global" | "project",
  projectPath: string,
): Promise<"installed" | "failed"> {
  const packageRoot = getPackageRoot();
  const vendorSource = join(packageRoot, "vendor", "superpowers");

  let skillsTargetDir: string;
  if (scope === "global") {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    skillsTargetDir = join(home, ".claude", "skills");
  } else {
    skillsTargetDir = join(projectPath, ".claude", "skills");
  }

  try {
    await mkdir(skillsTargetDir, { recursive: true });
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(vendorSource, { withFileTypes: true });
    let copied = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const srcPath = join(vendorSource, entry.name);
      const destPath = join(skillsTargetDir, entry.name);
      await cp(srcPath, destPath, { recursive: true });
      copied++;
    }
    console.log(`     ✓ 已从 vendor 复制 ${copied} 个 Superpowers skill`);
    return "installed";
  } catch (error) {
    console.error(`     ✗ vendor 兜底失败: ${(error as Error).message}`);
    return "failed";
  }
}
```

- [ ] **Step 2: 编译验证**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/core/superpowers.ts
git commit -m "feat(core): 新建 superpowers.ts — Superpowers 安装 + 离线兜底

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 创建 src/core/skills.ts + src/core/claude-md.ts

**Files:**
- Create: `src/core/skills.ts`
- Create: `src/core/claude-md.ts`

- [ ] **Step 1: 创建 src/core/skills.ts**

```typescript
import { mkdir, cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPackageRoot } from "../utils/fs.js";
import type { DeployOptions } from "./types.js";

export async function deploySkills(opts: DeployOptions): Promise<string[]> {
  const deployed: string[] = [];
  const packageRoot = getPackageRoot();
  const skillsSourceDir = join(packageRoot, "skills");

  let skillsTargetDir: string;
  if (opts.scope === "global") {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    skillsTargetDir = join(home, ".claude", "skills");
  } else {
    skillsTargetDir = join(opts.projectPath, ".claude", "skills");
  }

  await mkdir(skillsTargetDir, { recursive: true });

  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(skillsSourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("alloy")) continue;
    const srcPath = join(skillsSourceDir, entry.name);
    const destPath = join(skillsTargetDir, entry.name);
    await cp(srcPath, destPath, { recursive: true });
    deployed.push(`→ ${destPath}`);
  }

  return deployed;
}

export async function deploySchema(opts: DeployOptions): Promise<string> {
  const packageRoot = getPackageRoot();
  const schemaSource = join(packageRoot, "openspec", "schemas", "alloy");
  const schemaTarget = join(opts.projectPath, "openspec", "schemas", "alloy");

  const openspecDir = join(opts.projectPath, "openspec");
  await mkdir(join(openspecDir, "specs"), { recursive: true });
  await mkdir(join(openspecDir, "changes"), { recursive: true });

  await mkdir(schemaTarget, { recursive: true });
  await cp(schemaSource, schemaTarget, { recursive: true });

  const configPath = join(openspecDir, "config.yaml");
  try {
    let existing = await readFile(configPath, "utf-8");
    if (!existing.includes("schema: alloy")) {
      existing = existing.trimEnd() + "\nschema: alloy\n";
      await writeFile(configPath, existing, "utf-8");
    }
  } catch {
    const configContent = "schema: alloy\n";
    await writeFile(configPath, configContent, "utf-8");
  }

  return schemaTarget;
}
```

- [ ] **Step 2: 创建 src/core/claude-md.ts**

```typescript
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DeployOptions } from "./types.js";

export const CLAUDE_MD_MARKER_START = "<!-- ALLOY-WORKFLOW:START -->";
export const CLAUDE_MD_MARKER_END = "<!-- ALLOY-WORKFLOW:END -->";

export async function injectClaudeMd(opts: DeployOptions): Promise<boolean> {
  if (!opts.injectClaudeMd) return false;

  const claudeMdPath = join(opts.projectPath, "CLAUDE.md");
  const fragment = [
    "",
    CLAUDE_MD_MARKER_START,
    "## Alloy 工作流",
    "",
    "本项目使用 [Alloy](https://github.com/user/alloy) 管理开发工作流。",
    "",
    "常用命令：",
    "- `/alloy-start [topic]` - 智能入口",
    "- `/alloy-plan [name]` - 制品规划",
    "- `/alloy-apply [name]` - 执行实现",
    "- `/alloy-archive [name]` - 归档与收尾",
    "- `/alloy-finish [name]` - 独立收尾",
    "- `/alloy-fix` - Bug 修复",
    "- `/alloy-status [name]` - 查看状态",
    "",
    CLAUDE_MD_MARKER_END,
    "",
  ].join("\n");

  let existing = "";
  try {
    existing = await readFile(claudeMdPath, "utf-8");
  } catch {
    // CLAUDE.md 不存在
  }

  if (existing.includes(CLAUDE_MD_MARKER_START)) {
    const startIdx = existing.indexOf(CLAUDE_MD_MARKER_START);
    const endIdx = existing.indexOf(CLAUDE_MD_MARKER_END);
    if (endIdx > startIdx) {
      existing =
        existing.slice(0, startIdx) +
        existing.slice(endIdx + CLAUDE_MD_MARKER_END.length);
    }
  }

  await writeFile(claudeMdPath, existing + fragment, "utf-8");
  return true;
}
```

- [ ] **Step 3: 编译验证**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/core/skills.ts src/core/claude-md.ts
git commit -m "feat(core): 新建 skills.ts + claude-md.ts

- core/skills.ts: deploySkills() + deploySchema()
- core/claude-md.ts: injectClaudeMd()

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: 创建 src/core/compat.ts + 更新 doctor.ts import

**Files:**
- Create: `src/core/compat.ts`
- Modify: `src/cli/commands/doctor.ts`

- [ ] **Step 1: 创建 src/core/compat.ts**

```typescript
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import semver from "semver";
import type { CompatConfig, CompatResult } from "./types.js";

export async function loadCompat(packageDir: string): Promise<CompatConfig> {
  const content = await readFile(join(packageDir, "compat.yaml"), "utf-8");
  return parseYaml(content) as CompatConfig;
}

export function checkCompat(config: CompatConfig): CompatResult[] {
  const results: CompatResult[] = [];

  try {
    const openspecVersion = execSync("openspec --version", {
      stdio: "pipe",
    })
      .toString()
      .trim();
    const isCompat = semver.satisfies(
      openspecVersion,
      config.compatible.openspec
    );
    results.push({
      name: "OpenSpec",
      current: openspecVersion,
      required: config.compatible.openspec,
      compatible: isCompat,
    });
  } catch {
    results.push({
      name: "OpenSpec",
      current: "未安装",
      required: config.compatible.openspec,
      compatible: false,
    });
  }

  try {
    execSync("npx skills list", { stdio: "pipe" });
    results.push({
      name: "Superpowers",
      current: "已安装",
      required: config.compatible.superpowers,
      compatible: true,
    });
  } catch {
    results.push({
      name: "Superpowers",
      current: "未安装",
      required: config.compatible.superpowers,
      compatible: false,
    });
  }

  return results;
}
```

注意：原 `utils/compat.ts` 中 `import semver from "semver"` 写错了包名。检查 `package.json` 中的实际包名，如果就是 `semver` 则保持不变。

- [ ] **Step 2: 更新 doctor.ts import**

将 `src/cli/commands/doctor.ts` 中的：

```typescript
import { loadCompat, checkCompat, CompatResult } from "../utils/compat.js";
```

替换为：

```typescript
import { loadCompat, checkCompat } from "../../core/compat.js";
import type { CompatResult } from "../../core/types.js";
```

- [ ] **Step 3: 编译验证**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/core/compat.ts src/cli/commands/doctor.ts
git commit -m "feat(core): 新建 compat.ts + 更新 doctor.ts import

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: 更新 init.ts（import + selectScope）+ 更新 index.ts

**Files:**
- Modify: `src/cli/commands/init.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: 更新 init.ts import**

将 `src/cli/commands/init.ts` 中的：

```typescript
import { detectEnv } from "../utils/env.js";
import { loadCompat, checkCompat } from "../utils/compat.js";
import {
  deploySkills,
  deploySchema,
  injectClaudeMd,
  installOpenSpecCli,
  initOpenSpecProject,
  installSuperpowers,
  DeployOptions,
} from "../utils/deploy.js";
```

替换为：

```typescript
import { select } from "@inquirer/prompts";
import { detectEnv } from "../../core/detect.js";
import { loadCompat, checkCompat } from "../../core/compat.js";
import { installOpenSpecCli, initOpenSpecProject } from "../../core/openspec.js";
import { installSuperpowers } from "../../core/superpowers.js";
import { deploySkills, deploySchema } from "../../core/skills.js";
import { injectClaudeMd } from "../../core/claude-md.js";
import type { DeployOptions } from "../../core/types.js";
import { getPackageRoot } from "../../utils/fs.js";
```

- [ ] **Step 2: 添加 selectScope() 函数到 init.ts 顶部（import 之后、initCommand 之前）**

```typescript
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

- [ ] **Step 3: 移除 init.ts 中的 getPackageRoot（现在从 utils/fs 导入）**

当前 `init.ts` 末尾有：

```typescript
const packageDir = join(import.meta.dirname, "..", "..", "..");
```

替换为使用 `getPackageRoot()`。

- [ ] **Step 4: 更新 index.ts 的 init case**

将 `src/cli/index.ts` 中的 init case 改为 async：

```typescript
case "init": {
  const { values } = parseArgs({
    args: restArgs,
    options: {
      scope: { type: "string" },
      "inject-claude-md": { type: "boolean", default: false },
    },
    strict: false,
  });
  const scope = await selectScope(values.scope as string | undefined);
  await initCommand({
    scope,
    injectClaudeMd: (values["inject-claude-md"] as boolean) || false,
    projectPath: process.cwd(),
  });
  break;
}
```

同时在 `index.ts` 顶部添加 import：

```typescript
import { select } from "@inquirer/prompts";
```

并添加 selectScope 函数（或从 init.ts 导入，保持简单直接在 index.ts 中定义）。

- [ ] **Step 5: 编译验证**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/init.ts src/cli/index.ts
git commit -m "feat(cli): alloy init 支持交互式 scope 选择 + import 更新

- 不传 --scope 时交互选择 project/global
- init.ts 从 core/ 导入各模块
- index.ts init case 改为 async

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: 更新 update.ts + 删除旧文件

**Files:**
- Modify: `src/cli/commands/update.ts`
- Delete: `src/cli/utils/deploy.ts`, `src/cli/utils/env.ts`, `src/cli/utils/compat.ts`
- Delete: `.claude/skills/alloy*/`（旧技能文件）

- [ ] **Step 1: 更新 update.ts**

检查 `src/cli/commands/update.ts` 中的路径引用。当前 update.ts 中 `getLatestClaudeMdFragment()` 包含旧命令名 `/alloy-finish`，需更新为新命令描述。同时检查是否有对已删除文件的引用。

update.ts 自身逻辑完整，无需大规模改动。如果引用了 `CLAUDE_MD_MARKER_START/END`，改为从 `core/claude-md.js` 导入。

- [ ] **Step 2: 删除旧文件**

```bash
rm src/cli/utils/deploy.ts
rm src/cli/utils/env.ts
rm src/cli/utils/compat.ts
```

- [ ] **Step 3: 删除 .claude/skills/alloy*/ 旧技能文件**

```bash
rm -rf .claude/skills/alloy
rm -rf .claude/skills/alloy-start
rm -rf .claude/skills/alloy-plan
rm -rf .claude/skills/alloy-apply
rm -rf .claude/skills/alloy-archive
rm -rf .claude/skills/alloy-finish
rm -rf .claude/skills/alloy-fix
rm -rf .claude/skills/alloy-discard
rm -rf .claude/skills/alloy-status
```

- [ ] **Step 4: 编译验证**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 5: 运行测试**

```bash
npx vitest run
```

Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add -u src/cli/commands/update.ts src/cli/utils/deploy.ts src/cli/utils/env.ts src/cli/utils/compat.ts .claude/skills/
git commit -m "chore: 删除旧文件 — deploy.ts/env.ts/compat.ts + .claude/skills/alloy*/

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: 运行测试 + 最终验证

**Files:**
- 全部

- [ ] **Step 1: 完整编译**

```bash
npx tsc
```

Expected: dist/ 生成成功，无错误

- [ ] **Step 2: 运行全部测试**

```bash
npx vitest run
```

Expected: 全部 PASS

- [ ] **Step 3: 检查 import 无循环依赖**

```bash
npx tsc --noEmit --traceResolution 2>&1 | grep -c "circular" || echo "0"
```

Expected: `0`

- [ ] **Step 4: 验证目录结构**

```bash
echo "=== 根目录 ===" && ls -d */ && echo "=== skills/ ===" && ls skills/ && echo "=== src/core/ ===" && ls src/core/ && echo "=== src/utils/ ===" && ls src/utils/
```

Expected:
- `skills/` 包含 9 个 `alloy*` 目录
- `src/core/` 包含 7 个 `.ts` 文件
- `src/utils/` 包含 `state.ts` 和 `fs.ts`
- `.claude/skills/` 不再包含 `alloy*` 目录

- [ ] **Step 5: 验证 package.json files 字段**

```bash
node -e "const p = require('./package.json'); console.log(p.files)"
```

Expected: 包含 `skills/`，不包含 `.claude/`

- [ ] **Step 6: Commit（如有遗留变更）**

```bash
git status
```

如有未提交变更，提交之。

---

## 执行顺序

```
Task 1 (安装依赖 + 移动文件)     ← 先行，其他任务依赖
    │
    ├── Task 2 (types.ts)        ← 先行，core 模块依赖类型
    │       │
    │       ├── Task 3 (detect.ts + fs.ts)      ← 并行
    │       ├── Task 4 (openspec.ts)            ← 并行
    │       ├── Task 5 (superpowers.ts)         ← 并行
    │       ├── Task 6 (skills.ts + claude-md.ts) ← 并行（依赖 fs.ts）
    │       └── Task 7 (compat.ts + doctor.ts)  ← 并行
    │
    └── Task 8 (init.ts + index.ts)   ← 依赖 Task 1-7 全部完成
            │
            └── Task 9 (update.ts + 删除旧文件)  ← 依赖 Task 8
                    │
                    └── Task 10 (最终验证)
```
