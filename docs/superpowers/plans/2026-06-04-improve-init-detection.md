# alloy init 检测逻辑改进 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建统一检测模块，改进 alloy init 的安装流程，在每个安装步骤前检测已有安装并提示用户决策。

**Architecture:** 新建 `detect-installations.ts` 提供 `detectCommand()` 和 `detectSkill()` 纯函数，按 agent 类型参数化检测路径。`openspec.ts`、`superpowers.ts`、`skills.ts` 各自调用检测函数获取结果，`init.ts` 根据检测结果展示信息并提示用户决策。

**Tech Stack:** TypeScript, Vitest, semver

---

## File Structure

| 文件 | 职责 | 操作 |
|------|------|------|
| `src/core/detect-installations.ts` | 统一检测模块 | **新建** |
| `test/core/detect-installations.test.ts` | 检测模块单元测试 | **新建** |
| `src/core/openspec.ts` | OpenSpec 安装，集成检测 | 修改 |
| `src/core/superpowers.ts` | Superpowers 安装，集成检测 | 修改 |
| `src/core/skills.ts` | Alloy commands 部署，集成检测 | 修改 |
| `src/cli/commands/init.ts` | init 入口，集成检测结果展示 | 修改 |

---

### Task 1: 创建 detect-installations.ts 类型和基础函数

**Files:**
- Create: `src/core/detect-installations.ts`

- [ ] **Step 1: 创建文件，定义类型和 detectCommand 函数**

```typescript
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AgentInfo } from "./types.js";

export type InstallLocation = "project-command" | "project-skill" | "user-command" | "user-skill" | "user-plugin";

export interface InstallationInfo {
  found: boolean;
  location: InstallLocation | null;
  path: string | null;
  version: string | null;
}

const NOT_FOUND: InstallationInfo = { found: false, location: null, path: null, version: null };

/**
 * 检测某 agent 的命令是否存在。
 * 优先级：项目级 command → 用户级 command
 */
export function detectCommand(name: string, agent: AgentInfo, projectPath: string): InstallationInfo {
  // name 格式: "opsx/continue" 或 "alloy/start"
  const cmdFile = `${name}.md`;

  // 项目级 command
  const projectCmd = join(projectPath, agent.commandsDir, cmdFile);
  if (existsSync(projectCmd)) {
    return { found: true, location: "project-command", path: projectCmd, version: null };
  }

  // 用户级 command
  const home = homedir();
  const userCmd = join(home, agent.commandsDir, cmdFile);
  if (existsSync(userCmd)) {
    return { found: true, location: "user-command", path: userCmd, version: null };
  }

  return NOT_FOUND;
}
```

- [ ] **Step 2: 添加 detectSkill 函数**

在文件末尾追加：

```typescript
/**
 * 检测某 agent 的技能是否存在。
 * 优先级：项目级 skill → 用户级 skill → 用户级 plugin
 * 注意：只有 Claude Code 有 skills/plugins，其他 agent 直接返回 NOT_FOUND。
 */
export function detectSkill(name: string, agent: AgentInfo, projectPath: string): InstallationInfo {
  // skills 只对 Claude Code 有意义（.claude/skills/）
  if (!agent.commandsDir.startsWith(".claude/")) {
    return NOT_FOUND;
  }

  const home = homedir();

  // 项目级 skill
  const projectSkill = join(projectPath, ".claude", "skills", name);
  if (existsSync(projectSkill)) {
    return { found: true, location: "project-skill", path: projectSkill, version: null };
  }

  // 用户级 skill
  const userSkill = join(home, ".claude", "skills", name);
  if (existsSync(userSkill)) {
    return { found: true, location: "user-skill", path: userSkill, version: null };
  }

  // 用户级 plugin（superpowers 插件）
  const pluginPattern = join(home, ".claude", "plugins", "cache", "superpowers-marketplace", "superpowers");
  if (existsSync(pluginPattern)) {
    // 遍历版本目录查找技能
    const { readdirSync } = require("node:fs");
    try {
      const versions = readdirSync(pluginPattern, { withFileTypes: true });
      for (const v of versions) {
        if (!v.isDirectory()) continue;
        const skillPath = join(pluginPattern, v.name, "skills", name);
        if (existsSync(skillPath)) {
          return { found: true, location: "user-plugin", path: skillPath, version: v.name };
        }
      }
    } catch {
      // 目录不存在或无法读取
    }
  }

  return NOT_FOUND;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/core/detect-installations.ts
git commit -m "feat: 新建 detect-installations.ts 检测模块"
```

---

### Task 2: detect-installations.ts 单元测试

**Files:**
- Create: `test/core/detect-installations.test.ts`

- [ ] **Step 1: 创建测试文件，测试 detectCommand**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

import { existsSync } from "node:fs";
import { detectCommand, detectSkill } from "../../src/core/detect-installations.js";
import type { AgentInfo } from "../../src/core/types.js";

const claudeAgent: AgentInfo = {
  id: "claude-code",
  label: "Claude Code",
  supportsColonCommands: true,
  commandsDir: ".claude/commands/",
};

const cursorAgent: AgentInfo = {
  id: "cursor",
  label: "Cursor",
  supportsColonCommands: false,
  commandsDir: ".cursor/commands/",
};

const PROJECT = "/test/project";

describe("detectCommand", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("找到项目级 command", () => {
    vi.mocked(existsSync).mockImplementation((p: any) =>
      String(p).includes(".claude/commands/opsx/continue.md") && String(p).startsWith(PROJECT)
    );
    const result = detectCommand("opsx/continue", claudeAgent, PROJECT);
    expect(result.found).toBe(true);
    expect(result.location).toBe("project-command");
  });

  it("找到用户级 command", () => {
    vi.mocked(existsSync).mockImplementation((p: any) =>
      String(p).includes(".claude/commands/opsx/continue.md") && !String(p).startsWith(PROJECT)
    );
    const result = detectCommand("opsx/continue", claudeAgent, PROJECT);
    expect(result.found).toBe(true);
    expect(result.location).toBe("user-command");
  });

  it("未找到返回 NOT_FOUND", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = detectCommand("opsx/continue", claudeAgent, PROJECT);
    expect(result.found).toBe(false);
    expect(result.location).toBeNull();
  });

  it("项目级优先于用户级", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const result = detectCommand("opsx/continue", claudeAgent, PROJECT);
    expect(result.location).toBe("project-command");
  });

  it("Cursor agent 使用 .cursor/commands/ 路径", () => {
    vi.mocked(existsSync).mockImplementation((p: any) =>
      String(p).includes(".cursor/commands/")
    );
    const result = detectCommand("alloy/start", cursorAgent, PROJECT);
    expect(result.found).toBe(true);
    expect(result.location).toBe("project-command");
  });
});
```

- [ ] **Step 2: 添加 detectSkill 测试**

在文件末尾追加：

```typescript
describe("detectSkill", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("找到项目级 skill", () => {
    vi.mocked(existsSync).mockImplementation((p: any) =>
      String(p).includes(".claude/skills/brainstorming") && String(p).startsWith(PROJECT)
    );
    const result = detectSkill("brainstorming", claudeAgent, PROJECT);
    expect(result.found).toBe(true);
    expect(result.location).toBe("project-skill");
  });

  it("找到用户级 skill", () => {
    vi.mocked(existsSync).mockImplementation((p: any) =>
      String(p).includes(".claude/skills/brainstorming") && !String(p).startsWith(PROJECT) && !String(p).includes("plugins")
    );
    const result = detectSkill("brainstorming", claudeAgent, PROJECT);
    expect(result.found).toBe(true);
    expect(result.location).toBe("user-skill");
  });

  it("非 Claude Code agent 直接返回 NOT_FOUND", () => {
    const result = detectSkill("brainstorming", cursorAgent, PROJECT);
    expect(result.found).toBe(false);
  });

  it("未找到返回 NOT_FOUND", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = detectSkill("brainstorming", claudeAgent, PROJECT);
    expect(result.found).toBe(false);
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run test/core/detect-installations.test.ts`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add test/core/detect-installations.test.ts
git commit -m "test: detect-installations.ts 单元测试"
```

---

### Task 3: 修改 superpowers.ts 集成检测

**Files:**
- Modify: `src/core/superpowers.ts`

- [ ] **Step 1: 添加 detectSkill 导入和提示逻辑**

在 `superpowers.ts` 顶部添加导入：

```typescript
import { detectSkill } from "./detect-installations.js";
import { promptConfirm } from "../utils/prompt.js";
import type { AgentInfo } from "./types.js";
```

修改 `installSuperpowers` 函数签名，添加 `agent` 和 `projectPath` 参数：

```typescript
export async function installSuperpowers(
  scope: "global" | "project",
  agent?: AgentInfo,
  projectPath?: string
): Promise<"installed" | "skipped" | "failed"> {
```

- [ ] **Step 2: 在安装前添加检测逻辑**

在函数开头（`const packageDir = getPackageRoot();` 之前）添加：

```typescript
  // 新增：检测已有安装（含版本比较）
  if (agent && projectPath) {
    const detected = detectSkill("brainstorming", agent, projectPath);
    if (detected.found) {
      const locationLabel = {
        "project-command": "项目级 command",
        "project-skill": "项目级 skill",
        "user-command": "用户级 command",
        "user-skill": "用户级 skill",
        "user-plugin": "用户级 plugin",
      }[detected.location!] || detected.location;

      const versionInfo = detected.version ? ` v${detected.version}` : "";
      console.log(`     ℹ Superpowers 已安装（${locationLabel}${versionInfo}）`);

      // 版本比较（如果有版本信息）
      if (detected.version) {
        const semver = (await import("semver")).default;
        const required = config.compatible.superpowers;
        const satisfies = semver.satisfies(detected.version, required);
        if (!satisfies) {
          console.log(`     ⚠ 版本 v${detected.version} 不满足要求 ${required}，需要升级`);
          // 不提示，直接继续安装
        } else {
          const overwrite = await promptConfirm("     是否覆盖安装？", false);
          if (!overwrite) {
            console.log("     ✓ 跳过 Superpowers 安装");
            return "skipped";
          }
        }
      } else {
        // 无版本信息，只做存在性提示
        const overwrite = await promptConfirm("     是否覆盖安装？", false);
        if (!overwrite) {
          console.log("     ✓ 跳过 Superpowers 安装");
          return "skipped";
        }
      }
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/core/superpowers.ts
git commit -m "feat(superpowers): 集成 detectSkill 检测，覆盖前提示用户"
```

---

### Task 4: 修改 openspec.ts 集成检测

**Files:**
- Modify: `src/core/openspec.ts`

- [ ] **Step 1: 添加导入**

在 `openspec.ts` 顶部添加：

```typescript
import { detectCommand, detectSkill } from "./detect-installations.js";
import { promptConfirm } from "../utils/prompt.js";
import type { AgentInfo } from "./types.js";
```

- [ ] **Step 2: 修改 initOpenSpecProject 函数签名**

```typescript
export async function initOpenSpecProject(
  projectPath: string,
  scope: "global" | "project",
  agents?: AgentInfo[]
): Promise<"initialized" | "skipped" | "failed"> {
```

- [ ] **Step 3: 在 openspec init 前添加检测逻辑**

在 `const profile = createCustomProfile();` 之前添加：

```typescript
  // 新增：检测已有 OpenSpec 安装
  if (agents && agents.length > 0) {
    let hasExisting = false;
    for (const agent of agents) {
      const cmdDetected = detectCommand("opsx/continue", agent, projectPath);
      const skillDetected = detectSkill("openspec-explore", agent, projectPath);
      if (cmdDetected.found || skillDetected.found) {
        hasExisting = true;
        const parts: string[] = [];
        if (cmdDetected.found) parts.push(`commands: ✓（${cmdDetected.path}）`);
        if (skillDetected.found) parts.push(`skills: ✓（${skillDetected.path}）`);
        console.log(`     ℹ OpenSpec 已安装（${agent.label}：${parts.join(", ")}）`);
      }
    }
    if (hasExisting) {
      const overwrite = await promptConfirm("     openspec init 可能覆盖现有文件，继续？", false);
      if (!overwrite) {
        console.log("     ✓ 跳过 OpenSpec 项目初始化");
        return "skipped";
      }
    }
  }
```

- [ ] **Step 4: Commit**

```bash
git add src/core/openspec.ts
git commit -m "feat(openspec): 集成 detectCommand/detectSkill 检测，覆盖前提示用户"
```

---

### Task 5: 修改 skills.ts 集成检测

**Files:**
- Modify: `src/core/skills.ts`

- [ ] **Step 1: 添加导入**

在 `skills.ts` 顶部添加：

```typescript
import { detectCommand } from "./detect-installations.js";
import { promptConfirm } from "../utils/prompt.js";
```

- [ ] **Step 2: 在 deployCommands 中添加检测逻辑**

在 `for (const agent of opts.targetAgents) {` 循环开头（`if (agent.globalOnly && opts.scope === "project")` 之前）添加：

```typescript
    // 新增：检测已有 Alloy commands
    const detected = detectCommand("alloy/start", agent, opts.projectPath);
    if (detected.found) {
      const locationLabel = {
        "project-command": "项目级",
        "user-command": "用户级",
      }[detected.location!] || detected.location;
      console.log(`     ℹ Alloy commands 已部署（${locationLabel}：${detected.path}）`);
      const overwrite = await promptConfirm(`     是否覆盖 ${agent.label} 的 Alloy commands？`, false);
      if (!overwrite) {
        console.log(`     ✓ 跳过 ${agent.label} 的 Alloy commands 部署`);
        continue;
      }
    }
```

- [ ] **Step 3: Commit**

```bash
git add src/core/skills.ts
git commit -m "feat(skills): 集成 detectCommand 检测，覆盖前提示用户"
```

---

### Task 6: 修改 init.ts 传递参数

**Files:**
- Modify: `src/cli/commands/init.ts`

- [ ] **Step 1: 修改 initOpenSpecProject 调用**

将 `init.ts` 中的：
```typescript
const initResult = await initOpenSpecProject(opts.projectPath, opts.scope);
```

改为：
```typescript
const initResult = await initOpenSpecProject(opts.projectPath, opts.scope, opts.targetAgents);
```

- [ ] **Step 2: 修改 installSuperpowers 调用**

将 `init.ts` 中的：
```typescript
const superpowersResult = await installSuperpowers(opts.scope);
```

改为：
```typescript
const claudeAgent = opts.targetAgents.find(a => a.id === "claude-code");
const superpowersResult = await installSuperpowers(opts.scope, claudeAgent, opts.projectPath);
```

- [ ] **Step 3: 运行全量测试**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/init.ts
git commit -m "feat(init): 传递 agent/projectPath 参数到检测函数"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-04-improve-init-detection.md`. Two execution options:

**1. Subagent-Driven (recommended)** - 每个 task 派发独立 subagent，task 间审查，快速迭代

**2. Inline Execution** - 当前 session 逐步执行，批量执行带检查点

Which approach?
