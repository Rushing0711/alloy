# Alloy CLI 跨平台兼容——Shell 脚本 TypeScript 化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 3 个 shell 脚本（alloy-state.sh / alloy-guard.sh / alloy-archive.sh）移植为 TypeScript CLI 内部命令，删除 `skills/alloy/scripts/` 和 `test/shell/`，实现 macOS/Linux/Windows Git Bash/PowerShell 全平台一等支持

**Architecture:** 新增 `src/cli/commands/internal/` 目录存放三个内部命令（`_state`/`_guard`/`_archive`），复用 `src/cli/utils/state.ts` 已有的 `readState`/`writeState` YAML 操作函数。CLI 入口 `index.ts` 将 `_` 前缀命令路由到 internal 模块。8 个 SKILL.md 文件中的 `bash ... script.sh` 调用全部替换为 `alloy _command`。

**Tech Stack:** TypeScript + Node.js ≥ 18 + yaml (npm) + vitest

---

### Task 1: 创建 `_state` 内部命令 + 测试

**Files:**
- Create: `src/cli/commands/internal/state.ts`
- Create: `test/cli/internal/state.test.ts`

`_state` 命令复用 `src/cli/utils/state.ts` 中的 `readState`/`writeState` 函数，提供 CLI 接口。

- [ ] **Step 1: 创建 state.ts 内部命令**

```typescript
// src/cli/commands/internal/state.ts
import { readState, writeState } from "../../utils/state.js";
import type { AlloyState } from "../../../core/types.js";

export async function stateCommand(args: string[]): Promise<void> {
  const action = args[0];
  const changeDir = args[1];
  const field = args[2];
  const value = args[3];

  if (!action || !changeDir) {
    console.error("用法: alloy _state <read|write|check> <change-dir> [field] [value]");
    process.exit(1);
  }

  switch (action) {
    case "read": {
      if (!field) {
        console.error("用法: alloy _state read <change-dir> <field>");
        process.exit(1);
      }
      const state = await readState(changeDir);
      const val = (state as Record<string, unknown>)[field];
      if (val === undefined || val === null) {
        console.log("null");
      } else {
        console.log(String(val));
      }
      break;
    }
    case "write": {
      if (!field || value === undefined) {
        console.error("用法: alloy _state write <change-dir> <field> <value>");
        process.exit(1);
      }
      const state = await readState(changeDir);
      (state as Record<string, unknown>)[field] = value;
      await writeState(changeDir, state);
      break;
    }
    case "check": {
      if (!field) {
        console.error("用法: alloy _state check <change-dir> <phase>");
        process.exit(1);
      }
      const state = await readState(changeDir);
      if (state.phase !== field) {
        console.log(`phase 不匹配: 当前=${state.phase}, 期望=${field}`);
        process.exit(1);
      }
      break;
    }
    default:
      console.error(`未知操作: ${action} (支持: read, write, check)`);
      process.exit(1);
  }
}
```

- [ ] **Step 2: 在 index.ts 中添加 `_state` 路由**

```typescript
// src/cli/index.ts — 在现有 import 之后添加:
import { stateCommand } from "./commands/internal/state.js";

// 在 switch(command) 中添加 case:
case "_state": {
  await stateCommand(restArgs);
  break;
}
```

- [ ] **Step 3: 编写 state.test.ts**

```typescript
// test/cli/internal/state.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

describe("alloy _state", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-state-test-${Date.now()}`);
    changeDir = join(tmpDir, "test-change");
    await mkdir(changeDir, { recursive: true });
    // 写入初始 .alloy.yaml
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: started",
      'updated_at: "2020-01-01T00:00:00"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function alloy(args: string): string {
    return execSync(`node dist/cli/index.js ${args}`, {
      cwd: tmpDir,
      stdio: "pipe",
    }).toString().trim();
  }

  it("read phase 返回 started", () => {
    const out = alloy(`_state read ${changeDir} phase`);
    expect(out).toBe("started");
  });

  it("read worktree 返回 null", () => {
    const out = alloy(`_state read ${changeDir} worktree`);
    expect(out).toBe("null");
  });

  it("read schema_version 返回 1", () => {
    const out = alloy(`_state read ${changeDir} schema_version`);
    expect(out).toBe("1");
  });

  it("write 更新 phase 字段", async () => {
    alloy(`_state write ${changeDir} phase planned`);
    const { readState } = await import("../../src/cli/utils/state.js");
    const state = await readState(changeDir);
    expect(state.phase).toBe("planned");
  });

  it("write 自动更新 updated_at", async () => {
    alloy(`_state write ${changeDir} phase applied`);
    const { readState } = await import("../../src/cli/utils/state.js");
    const state = await readState(changeDir);
    expect(state.updated_at).not.toBe("2020-01-01T00:00:00");
    expect(state.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it("write 支持含斜杠的路径值", async () => {
    alloy(`_state write ${changeDir} worktree .worktrees/test-change`);
    const { readState } = await import("../../src/cli/utils/state.js");
    const state = await readState(changeDir);
    expect(state.worktree).toBe(".worktrees/test-change");
  });

  it("check phase 匹配时 exit 0", () => {
    expect(() => alloy(`_state check ${changeDir} started`)).not.toThrow();
  });

  it("check phase 不匹配时 exit 1", () => {
    expect(() => alloy(`_state check ${changeDir} planned`)).toThrow();
  });
});
```

- [ ] **Step 4: 构建并运行测试验证通过**

```bash
npm run build && npx vitest run test/cli/internal/state.test.ts
```
Expected: 8 tests PASS

- [ ] **Step 5: 提交**

```bash
git add src/cli/commands/internal/state.ts src/cli/index.ts test/cli/internal/state.test.ts
git commit -m "feat: 新增 alloy _state 内部命令——替代 alloy-state.sh"
```

---

### Task 2: 创建 `_guard` 内部命令 + 测试

**Files:**
- Create: `src/cli/commands/internal/guard.ts`
- Create: `test/cli/internal/guard.test.ts`

`_guard` 使用 `readState`/`writeState` 操作状态，`fs.existsSync` 检查制品文件，`execSync` 执行 git 命令。

- [ ] **Step 1: 创建 guard.ts 内部命令**

```typescript
// src/cli/commands/internal/guard.ts
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";
import { readState, writeState } from "../../utils/state.js";

const VALID_TRANSITIONS: Record<string, string[]> = {
  started: ["planned"],
  planned: ["applied"],
  applied: ["archived"],
  archived: ["finished"],
};

const ARTIFACT_CHECKS: Record<string, string[]> = {
  "started->planned": ["proposal.md", "design.md", "specs", "tasks.md", "plan.md"],
  "planned->applied": ["plan.md"],
  "applied->archived": ["verify.md"],
};

export async function guardCommand(args: string[]): Promise<void> {
  const changeDir = args[0];
  const targetPhase = args[1];
  const apply = args.includes("--apply");

  if (!changeDir || !targetPhase) {
    console.error("用法: alloy _guard <change-dir> <target-phase> [--apply]");
    process.exit(1);
  }

  const state = await readState(changeDir);
  const currentPhase = state.phase;

  // 1. 校验 phase 转换合法性
  const allowed = VALID_TRANSITIONS[currentPhase];
  if (!allowed || !allowed.includes(targetPhase)) {
    console.error(`[HARD STOP] 不允许的 phase 转换: ${currentPhase} → ${targetPhase}`);
    console.error("  允许的转换: started→planned, planned→applied, applied→archived, archived→finished");
    process.exit(1);
  }

  // 2. 制品完整性检查
  const transition = `${currentPhase}->${targetPhase}`;
  const checks = ARTIFACT_CHECKS[transition];
  if (checks) {
    const missing: string[] = [];
    for (const c of checks) {
      const p = join(changeDir, c);
      if (!existsSync(p)) missing.push(`  ${c}`);
    }
    if (missing.length > 0) {
      console.error(`[HARD STOP] 以下制品缺失，无法进入 ${targetPhase} 阶段:`);
      console.error(missing.join("\n"));
      process.exit(1);
    }
  }

  // started→planned 额外检查：change 目录必须已提交
  if (transition === "started->planned") {
    try {
      execSync("git rev-parse --git-dir", { stdio: "pipe" });
      const relPath = `openspec/changes/${basename(changeDir)}`;
      const status = execSync(`git status --porcelain "${relPath}"`, {
        stdio: "pipe",
        cwd: process.cwd(),
      }).toString();
      if (status.trim()) {
        console.error("[HARD STOP] Change 目录有未提交的变更，请先执行 git add + git commit:");
        console.error(status);
        process.exit(1);
      }
    } catch {
      // 不在 git 仓库中，跳过 git 检查
    }
  }

  // 3. --apply: 更新 phase
  if (apply) {
    state.phase = targetPhase as typeof state.phase;
    await writeState(changeDir, state);
    console.log(`✓ phase: ${currentPhase} → ${targetPhase}`);
  }
}
```

- [ ] **Step 2: 在 index.ts 添加路由**

```typescript
import { guardCommand } from "./commands/internal/guard.js";

// 在 switch 中添加:
case "_guard": {
  await guardCommand(restArgs);
  break;
}
```

- [ ] **Step 3: 编写 guard.test.ts**

```typescript
// test/cli/internal/guard.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

describe("alloy _guard", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-guard-test-${Date.now()}`);
    changeDir = join(tmpDir, "test-change");
    await mkdir(changeDir, { recursive: true });
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: started",
      'updated_at: "2020-01-01T00:00:00"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function alloy(args: string): { stdout: string; stderr: string; status: number } {
    try {
      const stdout = execSync(`node dist/cli/index.js ${args}`, {
        cwd: tmpDir,
        stdio: "pipe",
      }).toString();
      return { stdout: stdout.trim(), stderr: "", status: 0 };
    } catch (e: any) {
      return {
        stdout: e.stdout?.toString() || "",
        stderr: e.stderr?.toString() || "",
        status: e.status || 1,
      };
    }
  }

  // valid transitions
  it("started→planned 所有制品齐全时通过", async () => {
    await writeFile(join(changeDir, "proposal.md"), "");
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plan.md"), "");
    await mkdir(join(changeDir, "specs"));
    const r = alloy(`_guard ${changeDir} planned --apply`);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("started → planned");
  });

  it("planned→applied plan.md 存在时通过", async () => {
    await writeFile(join(changeDir, "plan.md"), "");
    // 手动设置 phase=planned
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: planned",
      'updated_at: "2020-01-01T00:00:00"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    const r = alloy(`_guard ${changeDir} applied --apply`);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("planned → applied");
  });

  it("applied→archived verify.md 存在时通过", async () => {
    await writeFile(join(changeDir, "verify.md"), "");
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: applied",
      'updated_at: "2020-01-01T00:00:00"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    const r = alloy(`_guard ${changeDir} archived --apply`);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("applied → archived");
  });

  it("archived→finished 无条件通过", async () => {
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: archived",
      'updated_at: "2020-01-01T00:00:00"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    const r = alloy(`_guard ${changeDir} finished --apply`);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("archived → finished");
  });

  // invalid transitions
  it("started→applied 越级转换被拒绝", () => {
    const r = alloy(`_guard ${changeDir} applied`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("HARD STOP");
  });

  it("started→archived 跳多级被拒绝", () => {
    const r = alloy(`_guard ${changeDir} archived`);
    expect(r.status).toBe(1);
  });

  it("planned→finished 被拒绝", async () => {
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: planned",
      'updated_at: "2020-01-01T00:00:00"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    const r = alloy(`_guard ${changeDir} finished`);
    expect(r.status).toBe(1);
  });

  // missing artifacts
  it("started→planned proposal.md 缺失被阻断", async () => {
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plan.md"), "");
    await mkdir(join(changeDir, "specs"));
    const r = alloy(`_guard ${changeDir} planned`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("proposal.md");
  });

  it("started→planned specs/ 缺失被阻断", async () => {
    await writeFile(join(changeDir, "proposal.md"), "");
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plan.md"), "");
    const r = alloy(`_guard ${changeDir} planned`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("specs");
  });

  it("planned→applied plan.md 缺失被阻断", async () => {
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: planned",
      'updated_at: "2020-01-01T00:00:00"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    const r = alloy(`_guard ${changeDir} applied`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("plan.md");
  });

  it("applied→archived verify.md 缺失被阻断", async () => {
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: applied",
      'updated_at: "2020-01-01T00:00:00"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    const r = alloy(`_guard ${changeDir} archived`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("verify.md");
  });

  // --apply flag behavior
  it("无 --apply 时不修改 phase", async () => {
    await writeFile(join(changeDir, "proposal.md"), "");
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plan.md"), "");
    await mkdir(join(changeDir, "specs"));
    const r = alloy(`_guard ${changeDir} planned`);
    expect(r.status).toBe(0);
    const { readState } = await import("../../src/cli/utils/state.js");
    const state = await readState(changeDir);
    expect(state.phase).toBe("started"); // unchanged
  });
});
```

- [ ] **Step 4: 构建并运行测试**

```bash
npm run build && npx vitest run test/cli/internal/guard.test.ts
```
Expected: 11 tests PASS

- [ ] **Step 5: 提交**

```bash
git add src/cli/commands/internal/guard.ts src/cli/index.ts test/cli/internal/guard.test.ts
git commit -m "feat: 新增 alloy _guard 内部命令——替代 alloy-guard.sh"
```

---

### Task 3: 创建 `_archive` 内部命令 + 测试

**Files:**
- Create: `src/cli/commands/internal/archive.ts`
- Create: `test/cli/internal/archive.test.ts`

- [ ] **Step 1: 创建 archive.ts 内部命令**

```typescript
// src/cli/commands/internal/archive.ts
import { join } from "node:path";
import { execSync } from "node:child_process";
import { readState, writeState } from "../../utils/state.js";

export async function archiveCommand(args: string[]): Promise<void> {
  const projectDir = args[0];
  const changeName = args[1];
  const dryRun = args.includes("--dry-run");

  if (!projectDir || !changeName) {
    console.error("用法: alloy _archive <project-dir> <change-name> [--dry-run]");
    process.exit(1);
  }

  const changeDir = join(projectDir, "openspec", "changes", changeName);

  // 1. 验证 phase = applied
  const state = await readState(changeDir);
  if (state.phase !== "applied") {
    console.error(`[HARD STOP] phase 必须为 applied，当前为 ${state.phase}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(`[DRY RUN] 将归档 change '${changeName}' (phase=${state.phase})`);
    console.log(`[DRY RUN] openspec archive -y ${changeName}`);
    return;
  }

  // 2. 执行 openspec archive
  try {
    execSync(`openspec archive -y "${changeName}"`, {
      stdio: "pipe",
      cwd: projectDir,
    });
    console.log("✓ delta spec 已同步，change 已归档");
  } catch (e: any) {
    const msg = e.stderr?.toString() || e.message || "";
    console.log(`⚠️  openspec archive 失败，继续更新 phase（错误: ${msg.trim()}）`);
  }

  // 3. 更新 phase → archived
  state.phase = "archived";
  await writeState(changeDir, state);
  console.log("✓ phase → archived");

  // 4. 提交归档变更
  try {
    execSync("git diff --quiet && git diff --cached --quiet", {
      stdio: "pipe",
      cwd: projectDir,
    });
    console.log("⚠️  没有需要提交的变更");
  } catch {
    try {
      execSync(
        "git add openspec/specs/ openspec/changes/ archive/ 2>/dev/null; " +
          `git commit -m "archive: ${changeName} 归档——Delta Spec 已同步" 2>/dev/null`,
        { stdio: "pipe", cwd: projectDir }
      );
    } catch {
      console.log("⚠️  git commit 失败（可能不是 git 仓库）");
    }
  }
}
```

- [ ] **Step 2: 在 index.ts 添加路由**

```typescript
import { archiveCommand } from "./commands/internal/archive.js";

// 在 switch 中添加:
case "_archive": {
  await archiveCommand(restArgs);
  break;
}
```

- [ ] **Step 3: 编写 archive.test.ts**

```typescript
// test/cli/internal/archive.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

describe("alloy _archive", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-archive-test-${Date.now()}`);
    changeDir = join(tmpDir, "openspec", "changes", "test-change");
    await mkdir(changeDir, { recursive: true });
    const yaml = [
      "worktree: .worktrees/test-change",
      "schema_version: 1",
      "phase: applied",
      'updated_at: "2020-01-01T00:00:00"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    await writeFile(join(changeDir, "verify.md"), "");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function alloy(args: string): { stdout: string; stderr: string; status: number } {
    try {
      const stdout = execSync(`node dist/cli/index.js ${args}`, {
        cwd: tmpDir,
        stdio: "pipe",
      }).toString();
      return { stdout: stdout.trim(), stderr: "", status: 0 };
    } catch (e: any) {
      return {
        stdout: e.stdout?.toString() || "",
        stderr: e.stderr?.toString() || "",
        status: e.status || 1,
      };
    }
  }

  it("phase 非 applied 时 HARD STOP", async () => {
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: planned",
      'updated_at: "2020-01-01T00:00:00"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    const r = alloy(`_archive ${tmpDir} test-change`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("HARD STOP");
  });

  it("phase=applied 通过并更新为 archived", async () => {
    const r = alloy(`_archive ${tmpDir} test-change`);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("phase → archived");
    const { readState } = await import("../../src/cli/utils/state.js");
    const state = await readState(changeDir);
    expect(state.phase).toBe("archived");
  });

  it("--dry-run 不修改文件", async () => {
    const r = alloy(`_archive ${tmpDir} test-change --dry-run`);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("DRY RUN");
    const { readState } = await import("../../src/cli/utils/state.js");
    const state = await readState(changeDir);
    expect(state.phase).toBe("applied"); // unchanged
  });
});
```

- [ ] **Step 4: 构建并运行测试**

```bash
npm run build && npx vitest run test/cli/internal/archive.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 5: 提交**

```bash
git add src/cli/commands/internal/archive.ts src/cli/index.ts test/cli/internal/archive.test.ts
git commit -m "feat: 新增 alloy _archive 内部命令——替代 alloy-archive.sh"
```

---

### Task 4: completion 自动注册（init 时顺便安装）

**Files:**
- Modify: `src/cli/commands/init.ts`

- [ ] **Step 1: 在 init 流程末尾添加补全自动注册逻辑**

在 `init.ts` 的 `initCommand` 函数中，兼容性检查之后、输出 "Alloy 就绪!" 之前，添加：

```typescript
  // 9. 自动注册 shell 补全（失败不阻断）
  try {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    const shell = process.env.SHELL || "";
    const completionLine = "source <(alloy completion)";
    let rcFile: string | null = null;

    if (shell.includes("zsh")) {
      rcFile = join(home, ".zshrc");
    } else if (shell.includes("bash")) {
      rcFile = join(home, ".bashrc");
    }

    if (rcFile) {
      let rcContent = "";
      try {
        rcContent = await readFile(rcFile, "utf-8");
      } catch {
        // 文件不存在，稍后创建
      }
      if (!rcContent.includes("alloy completion")) {
        await writeFile(
          rcFile,
          rcContent.trimEnd() + "\n" + completionLine + "\n",
          "utf-8"
        );
        console.log(`     ✓ shell 补全已注册 → ${rcFile}`);
      }
    }
  } catch {
    // 注册失败不阻断 init
  }
```

- [ ] **Step 2: 在 init.ts 顶部添加缺失的 import**

```typescript
import { readFile, writeFile } from "node:fs/promises";  // 已存在
import { join } from "node:path";  // 已存在
```

确认这两个 import 已存在（它们已在 `ensureGitignore` 中使用）。

- [ ] **Step 3: 构建验证**

```bash
npm run build
```

- [ ] **Step 4: 提交**

```bash
git add src/cli/commands/init.ts
git commit -m "feat: alloy init 自动注册 shell 补全到 .zshrc/.bashrc"
```

---

### Task 5: 更新所有 SKILL.md 文件——替换 shell 脚本引用

**Files to modify:** 8 个 SKILL.md 文件

- [ ] **Step 1: 更新 `skills/alloy/SKILL.md`**

将第 31 行 `alloy-guard.sh` 引用改为 `alloy _guard`。
将第 44-46 行的脚本文档表格替换为内部命令表格：

```markdown
| `alloy _state` | 读写 .alloy.yaml（Agent 不直接编辑 YAML） |
| `alloy _guard` | 阶段转换闸门校验 + phase 更新 |
| `alloy _archive` | 归档验证 + openspec archive + phase 更新 |
```

- [ ] **Step 2: 更新 `skills/alloy-plan/SKILL.md`**

Step 1/3 中 4 行 `alloy-state.sh write` 调用替换为：
```bash
alloy _state write openspec/changes/<name> phase started
alloy _state write openspec/changes/<name> worktree null
alloy _state write openspec/changes/<name> schema_version 1
alloy _state write openspec/changes/<name> created_at "$(date +%Y-%m-%dT%H:%M:%S)"
```

Step 3/3 中 `alloy-guard.sh` 调用替换为：
```bash
alloy _guard openspec/changes/<name> planned --apply
```

第 163 行闸门规则文本中 `alloy-guard.sh` 替换为 `alloy _guard`。

- [ ] **Step 3: 更新 `skills/alloy-apply/SKILL.md`**

前置检查中的 guard 调用：
```bash
alloy _guard openspec/changes/<name> applied
```

worktree 写入（2 处）：
```bash
alloy _state write openspec/changes/<name> worktree "<path>"
alloy _state write openspec/changes/<name> worktree null
```

Step 5/5 完成时的 guard apply：
```bash
alloy _guard openspec/changes/<name> applied --apply
```

- [ ] **Step 4: 更新 `skills/alloy-archive/SKILL.md`**

guard 校验：
```bash
alloy _guard openspec/changes/<name> archived
```

archive 脚本调用：
```bash
alloy _archive <project-dir> <change-name>
```

描述文本中 `alloy-archive.sh` 替换为 `alloy _archive`。

- [ ] **Step 5: 更新 `skills/alloy-finish/SKILL.md`**

2 处 `alloy-guard.sh` 调用替换为：
```bash
alloy _guard openspec/changes/<name> finished --apply
```

- [ ] **Step 6: 更新 `skills/alloy-discard/SKILL.md`**

```bash
alloy _state read openspec/changes/<name> phase
alloy _state read openspec/changes/<name> worktree
```

- [ ] **Step 7: 更新 `skills/alloy-start/SKILL.md`**

```bash
alloy _state write openspec/changes/<name> worktree ".worktrees/<name>"
```

- [ ] **Step 8: 更新 `skills/alloy-status/SKILL.md`**

4 处 `alloy-state.sh read` 替换为：
```bash
alloy _state read openspec/changes/<name> phase
alloy _state read openspec/changes/<name> worktree
alloy _state read openspec/changes/<name> created_at
alloy _state read openspec/changes/<name> updated_at
```

描述文本中 `alloy-state.sh` 替换为 `alloy _state`。

- [ ] **Step 9: 构建验证 SKILL.md 无语法错误**

```bash
npm run build
```

- [ ] **Step 10: 提交**

```bash
git add skills/
git commit -m "refactor: SKILL.md shell 脚本引用全部替换为 alloy CLI 内部命令"
```

---

### Task 6: 清理——删除 shell 脚本和 bats 测试

**Files:**
- Delete: `skills/alloy/scripts/` (alloy-state.sh, alloy-guard.sh, alloy-archive.sh)
- Delete: `test/shell/` (alloy-state.bats, alloy-guard.bats, alloy-archive.bats, fixtures/)

- [ ] **Step 1: 删除 shell 脚本目录**

```bash
rm -rf skills/alloy/scripts/
```

- [ ] **Step 2: 删除 bats 测试目录**

```bash
rm -rf test/shell/
```

- [ ] **Step 3: 提交**

```bash
git add skills/alloy/scripts/ test/shell/
git commit -m "refactor: 删除 shell 脚本和 bats 测试——已由 TypeScript 内部命令替代"
```

---

### Task 7: 更新文档

**Files:**
- Modify: `docs/alloy-design.md`
- Modify: `docs/alloy-dev-guide.md`

- [ ] **Step 1: 更新 alloy-design.md**

在"一、命令参考"的 CLI 命令表中，用 TypeScript 实现替换 shell 脚本引用：

- 第二章"alloy plan"中的 guard 调用改为 `alloy _guard`
- 第二章"alloy apply"中的 state.sh 调用改为 `alloy _state`
- 第二章"alloy archive"中的 alloy-archive.sh 调用改为 `alloy _archive`
- 第三章"终端输出视觉规范"保持不变（无 shell 脚本引用）
- 第七章"安装与初始化"中 compat.yaml 部分保持不变
- 移除对 `skills/alloy/scripts/` 目录的引用

- [ ] **Step 2: 更新 alloy-dev-guide.md**

- 删除"Shell 脚本"表格（约第 56-64 行）中的 bats 和兼容性条目
- 更新"测试约定"章节：删除 Shell (bats) 小节（约第 79-101 行），只保留 TypeScript (vitest)
- 更新"测试覆盖优先级"：移除 Shell 脚本条目
- 更新"跨层复盘清单"：移除对脚本目录的引用

- [ ] **Step 3: 提交**

```bash
git add docs/alloy-design.md docs/alloy-dev-guide.md
git commit -m "docs: 更新设计文档和开发手册——反映 shell→TypeScript 迁移"
```

---

### Task 8: 全量验证

- [ ] **Step 1: 构建**

```bash
npm run build
```

- [ ] **Step 2: 运行全量 TypeScript 测试**

```bash
npx vitest run
```
Expected: 所有测试通过（现有 4 个测试文件 + 新增 3 个内部命令测试文件）

- [ ] **Step 3: 验证 --help 不显示内部命令**

```bash
node dist/cli/index.js --help
```
Expected: 只看到 init/status/doctor/update/completion，没有 _guard/_state/_archive

- [ ] **Step 4: 验证内部命令 --help 不展示**

```bash
node dist/cli/index.js _state 2>&1; echo "exit: $?"
```
Expected: 显示用法（因为参数不足），但 `node dist/cli/index.js --help` 不列 `_state`。

- [ ] **Step 5: 端到端验证内部命令可用**

```bash
# 创建临时项目
TEST_DIR=$(mktemp -d)
mkdir -p "$TEST_DIR/openspec/changes/test-e2e"
cat > "$TEST_DIR/openspec/changes/test-e2e/.alloy.yaml" << 'EOF'
worktree: null
schema_version: 1
phase: started
updated_at: "2020-01-01T00:00:00"
EOF

# 测试 _state read
node dist/cli/index.js _state read "$TEST_DIR/openspec/changes/test-e2e" phase
# Expected: started

# 测试 _state write
node dist/cli/index.js _state write "$TEST_DIR/openspec/changes/test-e2e" phase planned
node dist/cli/index.js _state read "$TEST_DIR/openspec/changes/test-e2e" phase
# Expected: planned

# 清理
rm -rf "$TEST_DIR"
```

- [ ] **Step 6: 提交（如有余留变更）**

```bash
git status
# 如有变更则 git add + git commit
```
