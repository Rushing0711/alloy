# Alloy 核心机制修复实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 7 项核心机制修复：命令文件去重、writing-plans 集成、hash 交接、plans 命名、SDD 决策传递、change 创建前移、commit 粒度。

**Architecture:** 变更跨越 CLI 控制层（TypeScript：types、state、guard、skills）和编排层（command 文件：start/plan/apply/archive/finish）。CLI 新增 `_record` 命令和 hash 校验，command 文件重构 start/plan 阶段边界并集成 writing-plans 技能。

**Tech Stack:** TypeScript + Node.js、vitest、YAML (AlloyState)、OpenSpec schema.yaml

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `src/core/types.ts` | AlloyState + ArtifactRecord 类型定义 | 修改 |
| `src/cli/utils/state.ts` | .alloy.yaml 读写，createInitialState 含 records | 修改 |
| `src/cli/commands/internal/state.ts` | alloy _state 命令（新增 _record 路由） | 修改 |
| `src/cli/commands/internal/guard.ts` | phase 转换 + hash 一致性校验 | 修改 |
| `src/cli/index.ts` | CLI 入口，新增 _record 命令路由 | 修改 |
| `src/core/skills.ts` | deployCommands() 横线版自动生成 | 修改 |
| `commands/alloy/start.md` | change 创建前移 + draft commit | 修改 |
| `commands/alloy/plan.md` | writing-plans 集成 + 每制品 commit | 修改 |
| `commands/alloy/apply.md` | SDD 推荐 + commit 粒度 + plan→plans | 修改 |
| `commands/alloy/archive.md` | plan→plans 引用 | 修改 |
| `commands/alloy/finish.md` | plan→plans 引用 | 修改 |
| `commands/alloy/status.md` | plan→plans 引用 | 修改 |
| `commands/alloy/discard.md` | plan→plans 引用 | 修改 |
| `commands/alloy/fix.md` | plan→plans 引用 | 修改 |
| `commands/alloy-*.md` (8 个) | 横线版源文件——删除 | 删除 |
| `openspec/schemas/alloy/schema.yaml` | artifact plan→plans | 修改 |
| `openspec/schemas/alloy/templates/plan.md` → `plans.md` | 模板重命名 | 重命名 |
| `openspec/schemas/alloy/instructions/plan.md` → `plans.md` | 指令重命名 | 重命名 |
| `docs/alloy-design.md` | 全文 plan→plans + 流程更新 | 修改 |
| `test/cli/internal/guard.test.ts` | hash 校验 + plans 命名覆盖 | 修改 |
| `test/cli/internal/state.test.ts` | _record 命令覆盖 | 修改 |
| `test/cli/state.test.ts` | records 字段覆盖 | 修改 |
| `test/core/health.test.ts` | 无变更 | — |
| `test/cli/detect.test.ts` | 无变更 | — |
| `test/cli/completion.test.ts` | 无变更 | — |
| `test/cli/doctor.test.ts` | 无变更 | — |
| `test/cli/internal/archive.test.ts` | 无变更 | — |

---

### Task 1: AlloyState 新增 records 字段

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/cli/utils/state.ts`
- Modify: `test/cli/state.test.ts`

- [ ] **Step 1: 新增 ArtifactRecord 接口**

在 `src/core/types.ts` 的 `AlloyState` 之前插入：

```typescript
export interface ArtifactRecord {
  artifact: string;
  hash: string;
  approved_at: string;
  approver: string;
}
```

- [ ] **Step 2: AlloyState 新增 records 字段**

修改 `src/core/types.ts` 的 `AlloyState`：

```typescript
export interface AlloyState {
  phase: "started" | "planned" | "applied" | "archived" | "finished";
  worktree: string | null;
  schema_version: number;
  created_at: string;
  updated_at: string;
  records: ArtifactRecord[];
}
```

- [ ] **Step 3: createInitialState 初始化 records**

修改 `src/cli/utils/state.ts` 的 `createInitialState()`：

```typescript
export function createInitialState(): AlloyState {
  const now = formatTimestamp();
  return {
    phase: "started",
    worktree: null,
    schema_version: 1,
    created_at: now,
    updated_at: now,
    records: [],
  };
}
```

- [ ] **Step 4: 运行现有测试确认不破坏**

```bash
npx vitest run test/cli/state.test.ts
```
Expected: 全部 PASS

- [ ] **Step 5: 新增 records 往返测试**

在 `test/cli/state.test.ts` 追加：

```typescript
it("writeState 和 readState records 往返一致", async () => {
  const changeDir = join(tmpDir, "test-change-records");
  await mkdir(changeDir, { recursive: true });
  const state = createInitialState();
  state.records = [
    { artifact: "proposal", hash: "abc123", approved_at: "2026-05-30T10:00:00Z", approver: "test-user" },
  ];
  await writeState(changeDir, state);
  const loaded = await readState(changeDir);
  expect(loaded.records).toHaveLength(1);
  expect(loaded.records[0].artifact).toBe("proposal");
  expect(loaded.records[0].hash).toBe("abc123");
  expect(loaded.records[0].approver).toBe("test-user");
});

it("createInitialState 默认 records 为空数组", () => {
  const state = createInitialState();
  expect(state.records).toEqual([]);
});
```

- [ ] **Step 6: 运行测试确认通过**

```bash
npx vitest run test/cli/state.test.ts
```
Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/cli/utils/state.ts test/cli/state.test.ts
git commit -m "feat: AlloyState 新增 records 字段 (ArtifactRecord[])"
```

---

### Task 2: 新增 alloy _record 命令

**Files:**
- Create: `src/cli/commands/internal/record.ts`
- Modify: `src/cli/index.ts`
- Modify: `test/cli/internal/state.test.ts` (追加 _record 测试)

- [ ] **Step 1: 创建 record.ts**

创建 `src/cli/commands/internal/record.ts`：

```typescript
import { createHash } from "node:crypto";
import { readFile, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readState, writeState } from "../../utils/state.js";
import type { ArtifactRecord } from "../../../core/types.js";

function computeHash(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex").substring(0, 12);
}

const ARTIFACT_FILES: Record<string, string> = {
  draft: "draft.md",
  proposal: "proposal.md",
  design: "design.md",
  specs: "specs",
  tasks: "tasks.md",
  plans: "plans.md",
  verify: "verify.md",
  retrospective: "retrospective.md",
};

async function computeArtifactHash(changeDir: string, artifactId: string): Promise<string | null> {
  const fileName = ARTIFACT_FILES[artifactId];
  if (!fileName) return null;

  const fullPath = join(changeDir, fileName);
  try {
    const st = await stat(fullPath);
    if (st.isDirectory()) {
      // specs/: 收集所有文件，排序后拼接计算 hash
      const entries = await readdir(fullPath, { withFileTypes: true });
      const files = entries.filter(e => e.isFile()).map(e => e.name).sort();
      const contents: Buffer[] = [];
      for (const f of files) {
        contents.push(await readFile(join(fullPath, f)));
      }
      return computeHash(Buffer.concat(contents));
    } else {
      const content = await readFile(fullPath);
      return computeHash(content);
    }
  } catch {
    return null;
  }
}

export async function recordCommand(args: string[]): Promise<void> {
  const action = args[0]; // write | check
  const changeDir = args[1];

  if (!action || !changeDir) {
    console.error("用法: alloy _record <write|check> <change-dir> [artifact] [hash] [approved_at] [approver]");
    process.exit(1);
  }

  switch (action) {
    case "write": {
      const artifact = args[2];
      const hash = args[3];
      const approvedAt = args[4];
      const approver = args[5];

      if (!artifact || !hash || !approvedAt || !approver) {
        console.error("用法: alloy _record write <change-dir> <artifact> <hash> <approved_at> <approver>");
        process.exit(1);
      }

      const state = await readState(changeDir);
      const existing = state.records.findIndex(r => r.artifact === artifact);
      const record: ArtifactRecord = { artifact, hash, approved_at: approvedAt, approver };

      if (existing >= 0) {
        state.records[existing] = record;
      } else {
        state.records.push(record);
      }

      await writeState(changeDir, state);
      console.log(`✓ record: ${artifact} → ${hash}`);
      break;
    }
    case "check": {
      const artifact = args[2];
      const state = await readState(changeDir);

      const targets = artifact
        ? state.records.filter(r => r.artifact === artifact)
        : state.records;

      if (targets.length === 0) {
        if (artifact) {
          console.log(`[WARN] 未找到制品 '${artifact}' 的 record`);
          process.exit(1);
        }
        console.log("[WARN] 无 records 可校验");
        process.exit(0);
      }

      let allMatch = true;
      for (const record of targets) {
        const currentHash = await computeArtifactHash(changeDir, record.artifact);
        if (currentHash === null) {
          console.log(`[FAIL] ${record.artifact}: 文件不存在`);
          allMatch = false;
        } else if (currentHash !== record.hash) {
          console.log(`[FAIL] ${record.artifact}: hash 不匹配 (recorded=${record.hash}, current=${currentHash})`);
          allMatch = false;
        } else {
          console.log(`[PASS] ${record.artifact}: ${currentHash}`);
        }
      }

      if (!allMatch) {
        process.exit(1);
      }
      break;
    }
    case "compute": {
      const artifact = args[2];
      if (!artifact) {
        console.error("用法: alloy _record compute <change-dir> <artifact>");
        process.exit(1);
      }
      const hash = await computeArtifactHash(changeDir, artifact);
      if (hash === null) {
        console.error(`[FAIL] 无法计算 ${artifact} 的 hash`);
        process.exit(1);
      }
      console.log(hash);
      break;
    }
    default:
      console.error(`未知操作: ${action} (支持: write, check, compute)`);
      process.exit(1);
  }
}
```

- [ ] **Step 2: CLI 入口注册 _record 命令**

修改 `src/cli/index.ts`：

在 import 区添加：
```typescript
import { recordCommand } from "./commands/internal/record.js";
```

在 switch 中添加（`_state` 之后）：
```typescript
case "_record": {
  await recordCommand(restArgs);
  break;
}
```

- [ ] **Step 3: 编写 _record 测试**

在 `test/cli/internal/` 创建 `record.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { recordCommand } from "../../../src/cli/commands/internal/record.js";
import { readState } from "../../../src/cli/utils/state.js";

describe("alloy _record", () => {
  let tmpDir: string;
  let changeDir: string;

  async function setupState() {
    const stateYaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: started",
      'updated_at: "2020-01-01T00:00:00"',
      "records: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), stateYaml, "utf-8");
  }

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-record-test-${Date.now()}`);
    changeDir = join(tmpDir, "test-change");
    await mkdir(changeDir, { recursive: true });
    await setupState();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("write 写入新 record", async () => {
    await writeFile(join(changeDir, "proposal.md"), "# Test proposal", "utf-8");
    await recordCommand(["write", changeDir, "proposal", "abc123", "2026-05-30T10:00:00Z", "test-user"]);
    const state = await readState(changeDir);
    expect(state.records).toHaveLength(1);
    expect(state.records[0].artifact).toBe("proposal");
    expect(state.records[0].hash).toBe("abc123");
    expect(state.records[0].approver).toBe("test-user");
  });

  it("write 覆盖已有 record", async () => {
    await writeFile(join(changeDir, "proposal.md"), "# V1", "utf-8");
    await recordCommand(["write", changeDir, "proposal", "abc123", "2026-05-30T10:00:00Z", "user1"]);
    await recordCommand(["write", changeDir, "proposal", "def456", "2026-05-30T10:01:00Z", "user2"]);
    const state = await readState(changeDir);
    expect(state.records).toHaveLength(1);
    expect(state.records[0].hash).toBe("def456");
  });

  it("compute 返回 12 位短 hash", async () => {
    await writeFile(join(changeDir, "proposal.md"), "# Test proposal", "utf-8");
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => logs.push(a.map(String).join(" ")));
    await recordCommand(["compute", changeDir, "proposal"]);
    spy.mockRestore();
    expect(logs[0]).toMatch(/^[a-f0-9]{12}$/);
  });

  it("check 所有 records hash 匹配", async () => {
    const content = "# Test proposal";
    await writeFile(join(changeDir, "proposal.md"), content, "utf-8");
    // 先写入通过 compute 获取真实 hash
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(content).digest("hex").substring(0, 12);
    await recordCommand(["write", changeDir, "proposal", hash, "2026-05-30T10:00:00Z", "test-user"]);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await recordCommand(["check", changeDir]);
    expect(exitSpy).not.toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("check 特定制品 hash 不匹配时 exit 1", async () => {
    await writeFile(join(changeDir, "proposal.md"), "original", "utf-8");
    await recordCommand(["write", changeDir, "proposal", "wrong-hash-1", "2026-05-30T10:00:00Z", "test-user"]);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await recordCommand(["check", changeDir, "proposal"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
```

需要补充 import `vi`：
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run test/cli/internal/record.test.ts
```
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/internal/record.ts src/cli/index.ts test/cli/internal/record.test.ts
git commit -m "feat: 新增 alloy _record 命令 (write/check/compute)"
```

---

### Task 3: alloy _guard 新增 hash 一致性校验

**Files:**
- Modify: `src/cli/commands/internal/guard.ts`
- Modify: `test/cli/internal/guard.test.ts`

- [ ] **Step 1: guard.ts 将 plan.md 替换为 plans.md**

`src/cli/commands/internal/guard.ts` 中：

```typescript
const ARTIFACT_CHECKS: Record<string, string[]> = {
  "started->planned": ["proposal.md", "design.md", "specs", "tasks.md", "plans.md"],
  "planned->applied": ["plans.md"],
  "applied->archived": ["verify.md"],
};
```

- [ ] **Step 2: guard.ts 添加 hash 校验方法**

在 `guard.ts` 的 `guardCommand` 中，制品完整性检查之后、`--apply` 之前，插入 hash 校验逻辑：

```typescript
// 3. hash 一致性校验（planned→applied 和 applied→archived）
if (transition === "planned->applied" || transition === "applied->archived") {
  // 动态导入 record 模块的 hash 计算能力
  // 直接内联校验逻辑以避免循环依赖
  const { createHash } = await import("node:crypto");
  const { readFile, readdir } = await import("node:fs/promises");

  // 收集所有已记录但 hash 不匹配的制品
  const mismatched: string[] = [];
  for (const record of (state.records || [])) {
    const filePath = join(changeDir, record.artifact === "specs" ? "specs" : `${record.artifact}.md`);
    try {
      const st = await import("node:fs").then(fs => fs.promises.stat(filePath));
      let currentHash: string;
      if (st.isDirectory()) {
        const entries = await readdir(filePath, { withFileTypes: true });
        const files = entries.filter(e => e.isFile()).map(e => e.name).sort();
        const contents: Buffer[] = [];
        for (const f of files) {
          contents.push(await readFile(join(filePath, f)));
        }
        currentHash = createHash("sha256").update(Buffer.concat(contents)).digest("hex").substring(0, 12);
      } else {
        const content = await readFile(filePath);
        currentHash = createHash("sha256").update(content).digest("hex").substring(0, 12);
      }
      if (currentHash !== record.hash) {
        mismatched.push(`  ${record.artifact}: recorded=${record.hash}, current=${currentHash}`);
      }
    } catch {
      mismatched.push(`  ${record.artifact}: 文件不可读`);
    }
  }
  if (mismatched.length > 0) {
    console.error("[HARD STOP] 以下制品 hash 不匹配，可能被篡改:");
    console.error(mismatched.join("\n"));
    process.exit(1);
  }
}
```

- [ ] **Step 3: 更新 guard 测试中所有 plan.md → plans.md**

修改 `test/cli/internal/guard.test.ts`：
- 所有 `plan.md` → `plans.md`
- 新增 hash 校验测试用例

追加测试用例：

```typescript
it("planned→applied hash 不匹配时被阻断", async () => {
  await setupState("planned");
  // 写入 plans.md 和 records
  await writeFile(join(changeDir, "plans.md"), "# plans");
  const stateYaml = [
    "worktree: null",
    "schema_version: 1",
    "phase: planned",
    'updated_at: "2020-01-01T00:00:00"',
    "records:",
    "  - artifact: plans",
    "  - hash: wrong-hash-12345",
    "  - approved_at: 2026-05-30T10:00:00Z",
    "  - approver: test-user",
  ].join("\n");
  await writeFile(join(changeDir, ".alloy.yaml"), stateYaml, "utf-8");
  await expect(
    guardCommand([changeDir, "applied"])
  ).rejects.toThrow();
});
```

- [ ] **Step 4: 运行 guard 测试**

```bash
npx vitest run test/cli/internal/guard.test.ts
```
Expected: 全部 PASS（含已更新的计划和新 hash 测试）

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/internal/guard.ts test/cli/internal/guard.test.ts
git commit -m "feat: alloy _guard 新增 hash 一致性校验 + plan→plans 引用更新"
```

---

### Task 4: deployCommands() 横线版自动生成 + 删除横线源文件

**Files:**
- Modify: `src/core/skills.ts`
- Delete: `commands/alloy-start.md` 等 8 个横线文件

- [ ] **Step 1: 改造 deployCommands()**

修改 `src/core/skills.ts`：

删除横线源文件依赖，改为从冒号源转换生成：

```typescript
export async function deployCommands(opts: DeployOptions): Promise<string[]> {
  const deployed: string[] = [];
  const packageRoot = getPackageRoot();
  const colonSourceDir = join(packageRoot, "commands", "alloy");

  for (const agent of opts.targetAgents) {
    if (agent.globalOnly && opts.scope === "project") {
      console.log(`     ⚠ Codex commands 仅全局安装有效，跳过`);
      continue;
    }

    const targetDir = getCommandTargetDir(agent, opts.scope, opts.projectPath);
    await mkdir(targetDir, { recursive: true });

    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(colonSourceDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const src = join(colonSourceDir, entry.name);

      if (agent.supportsColonCommands) {
        // 冒号 agent：直接拷贝
        const dest = join(targetDir, entry.name);
        await cp(src, dest);
        deployed.push(dest);
      } else {
        // 横线 agent：自动转换
        const content = await readFile(src, "utf-8");
        // 文件名映射: start.md → alloy-start.md
        const dashName = `alloy-${entry.name}`;
        // frontmatter name 转换: "Alloy: Start" → "Alloy-Start"
        const converted = content.replace(
          /^name:\s*"Alloy: (\w+)"/m,
          'name: "Alloy-$1"'
        );
        const dest = join(targetDir, dashName);
        await writeFile(dest, converted, "utf-8");
        deployed.push(dest);
      }
    }
  }

  return deployed;
}
```

注意：需要确认 `readFile` 和 `writeFile` 已从 `node:fs/promises` import。当前 import 仅包含 `mkdir, cp, readFile, writeFile`，需要确认 `readFile` 和 `writeFile` 可用。

- [ ] **Step 2: 删除横线源文件**

```bash
rm commands/alloy-apply.md
rm commands/alloy-archive.md
rm commands/alloy-discard.md
rm commands/alloy-finish.md
rm commands/alloy-fix.md
rm commands/alloy-plan.md
rm commands/alloy-start.md
rm commands/alloy-status.md
```

- [ ] **Step 3: 运行现有测试确认不破坏**

```bash
npx vitest run
```
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/skills.ts
git rm commands/alloy-apply.md commands/alloy-archive.md commands/alloy-discard.md commands/alloy-finish.md commands/alloy-fix.md commands/alloy-plan.md commands/alloy-start.md commands/alloy-status.md
git commit -m "feat: deployCommands 自动从冒号源生成横线版，删除重复源文件"
```

---

### Task 5: schema/templates/instructions plan→plans 重命名

**Files:**
- Modify: `openspec/schemas/alloy/schema.yaml`
- Rename: `openspec/schemas/alloy/templates/plan.md` → `plans.md`
- Rename: `openspec/schemas/alloy/instructions/plan.md` → `plans.md`

- [ ] **Step 1: schema.yaml plan→plans**

修改 `openspec/schemas/alloy/schema.yaml`：

将 artifact id `plan` 的所有出现替换为 `plans`：
- `id: plan` → `id: plans`
- `generates: plan.md` → `generates: plans.md`
- `template: plan.md` → `template: plans.md`
- `instruction: plan.md` → `instruction: plans.md`
- `requires: [plan]` → `requires: [plans]`（verify 和 apply 的 requires）

- [ ] **Step 2: 重命名模板和指令文件**

```bash
mv openspec/schemas/alloy/templates/plan.md openspec/schemas/alloy/templates/plans.md
mv openspec/schemas/alloy/instructions/plan.md openspec/schemas/alloy/instructions/plans.md
```

- [ ] **Step 3: 验证 schema**

```bash
openspec schemas
```
Expected: schema 验证通过

- [ ] **Step 4: Commit**

```bash
git add openspec/schemas/alloy/schema.yaml openspec/schemas/alloy/templates/plans.md openspec/schemas/alloy/instructions/plans.md
git rm openspec/schemas/alloy/templates/plan.md openspec/schemas/alloy/instructions/plan.md
git commit -m "refactor: artifact plan→plans (schema + templates + instructions)"
```

---

### Task 6: commands/alloy/start.md — change 创建前移

**Files:**
- Modify: `commands/alloy/start.md`

- [ ] **Step 1: 更新"全新开始"流程末尾**

将 start.md 中"全新开始"流程的末尾，替换现有的"完成"部分，加入 change 创建步骤：

在"用户明确确认方案之前，不要生成 draft.md" 之后，"### 完成"标题之前，补充新步骤：

```markdown
用户确认方案后，执行以下步骤：

1. **建议 change name**——根据 draft 内容建议 kebab-case 名称，用户确认
2. **调用 `/opsx:new <name>`** 创建 change 目录
3. **将 draft.md 移入 change 目录** `openspec/changes/<name>/`
4. **写入 state**：
   ```bash
   alloy _state write openspec/changes/<name> phase started
   alloy _state write openspec/changes/<name> worktree null
   alloy _state write openspec/changes/<name> schema_version 1
   alloy _state write openspec/changes/<name> created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   ```
5. **计算并记录 hash，然后 commit**：
   ```bash
   DRAFT_HASH=$(alloy _record compute openspec/changes/<name> draft)
   APPROVED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
   APPROVER=$(git config user.name)
   alloy _record write openspec/changes/<name> draft "$DRAFT_HASH" "$APPROVED_AT" "$APPROVER"
   git add openspec/changes/<name>/
   git commit -m "start(<name>): draft 已确认"
   ```
```

- [ ] **Step 2: 更新"完成"部分**

```markdown
### 完成

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start — DONE    │
└──────────────────────────────────────┘

→ Change: <name>
→ Phase: started
→ draft.md 已锁定（hash + commit）

准备好后，运行 `/alloy:plan` 进入规划阶段。
```

- draft.md 已在 change 目录，项目根目录不再有 draft.md
- 完成后不要自动进入 plan
```

- [ ] **Step 3: 更新 plan→plans 引用**

在 start.md 所有制品列表中将 `plan` 改为 `plans`：
- "制品状态: ... plan ✗" → "plans ✗"
- 所有提及 "plan.md" → "plans.md"

- [ ] **Step 4: 更新接续表**

接续表中 `started` → `planned` 的描述保持不变（guide → `/alloy:plan`）。

- [ ] **Step 5: Commit**

```bash
git add commands/alloy/start.md
git commit -m "refactor: start 阶段末尾创建 change 目录 + draft hash 锁定 + plan→plans"
```

---

### Task 7: commands/alloy/plan.md — writing-plans 集成 + 每制品 commit

**Files:**
- Modify: `commands/alloy/plan.md`

- [ ] **Step 1: 重写 Step 1 — 从"创建 Change"变为"确认 Change"**

```markdown
## Step 1/3：确认 Change 目录

```
┌──────────────────────────────────────┐
│ Alloy [2/5] · Phase: Plan            │
└──────────────────────────────────────┘

[Step 1/3] 确认 Change
──────────────────────────────────────
```

1. 确认 `openspec/changes/<name>/draft.md` 存在
2. 确认 `.alloy.yaml` phase 为 `started`：
   ```bash
   alloy _state check openspec/changes/<name> started
   ```
3. 确认 git 仓库可用：
   ```bash
   git rev-parse --git-dir
   ```
   若失败 → project 还不是 git 仓库，引导用户 `git init && git add -A && git commit -m "chore: 初始提交"`

前置检查通过：draft.md ✓  phase=started ✓  git ✓
```

- [ ] **Step 2: 重写 Step 2 — 制品生成止步于 tasks，由 writing-plans 收尾**

修改 Step 2 的制品 DAG 表格，`plan` → `plans`：

```markdown
| 制品 | 依赖 | 被依赖 |
|------|------|--------|
| proposal | draft.md | design, specs |
| design | proposal + draft.md | specs, tasks |
| specs | proposal（只读 Capabilities） | tasks |
| tasks | specs + design | plans |
| plans | tasks | — |
```

- [ ] **Step 3: 在 tasks 审查窗口后插入 writing-plans 步骤**

在 tasks 的审查窗口之后（"回溯修改"之前），插入：

```markdown
### tasks 审批通过后 → writing-plans 生成 plans.md

tasks 审批通过并 commit 后，**加载 `superpowers:writing-plans` 技能**生成 plans.md。

> 使用 Skill 工具加载 `superpowers:writing-plans` 技能。将 tasks + specs + design 作为上下文传入。writing-plans 会在生成前询问 SDD/串行决策，决策写入 plans.md 的 YAML frontmatter。

plans.md 的 header 格式：
```yaml
---
strategy: sdd
reason: 任务独立、可并行
---
# 执行计划
...
```

plans.md 生成后展示审查窗口，审批通过后 hash 锁定并 commit。
```

- [ ] **Step 4: 每个制品审批通过后立即 commit**

在每个制品审批窗口之后，加入通用规则说明（放在"回溯修改"之前或审查流程说明中）：

```markdown
### 每制品审批后 hash + commit

每个制品审批通过（用户选 a）后，执行：
```bash
HASH=$(alloy _record compute openspec/changes/<name> <artifact>)
APPROVED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
APPROVER=$(git config user.name)
alloy _record write openspec/changes/<name> <artifact> "$HASH" "$APPROVED_AT" "$APPROVER"
git add openspec/changes/<name>/
git commit -m "plan(<name>): <artifact> 已确认"
```

commit message 格式：`plan(<change-name>): <artifact> 已确认`
```

- [ ] **Step 5: 更新 Step 3 完成部分**

删除末尾的 `git add openspec/changes/<name>/` + `git commit` 一把提交，改为仅执行 guard：

```markdown
## Step 3/3：完成

```
┌──────────────────────────────────────┐
│ Alloy [2/5] · Phase: Plan — DONE     │
└──────────────────────────────────────┘

所有制品已生成：draft ✓  proposal ✓  design ✓  specs ✓  tasks ✓  plans ✓
```

**通过 `alloy _guard` 校验并更新 phase：**

```bash
alloy _guard openspec/changes/<name> planned --apply
```

每个制品已在审批时独立 commit，无需再次提交。guard 校验 hash 一致性后自动推进 phase。
```

- [ ] **Step 6: 更新闸门规则**

plan→plans 引用更新。

- [ ] **Step 7: Commit**

```bash
git add commands/alloy/plan.md
git commit -m "refactor: plan 阶段 writing-plans 集成 + 每制品 hash+commit + change 确认替代创建"
```

---

### Task 8: commands/alloy/apply.md — SDD 推荐 + commit 粒度 + plan→plans

**Files:**
- Modify: `commands/alloy/apply.md`

- [ ] **Step 1: plan.md → plans.md 全文替换**

将所有 `plan.md` 引用替换为 `plans.md`。

- [ ] **Step 2: 前置检查 plan.md → plans.md**

```markdown
1. 确认 `plans.md` 存在于 change 目录，不存在则报错
```

- [ ] **Step 3: Step 2/5 — SDD 决策展示为推荐项**

修改 Step 2 的策略选择逻辑，从 plans.md header 读取决策：

```markdown
### [Step 2/5] 任务实现

> 按 plans.md 微步骤执行实现...

**先分析，再展示推荐方案：**

1. 读取 `plans.md` 的 YAML frontmatter，提取 `strategy` 和 `reason`
2. 读取 `tasks.md`，分析任务特征——任务数、独立性、耦合度、并行潜力
3. 展示推荐方案（来自 plans.md header），用户可覆写：

```
[Step 2/5] 执行策略选择
──────────────────────────────────────

任务分析：<N 个任务，哪些独立/哪些耦合>

推荐方案：<SDD / 串行>（规划阶段建议）
理由：<来自 plans.md reason>

1. SDD — 派发子 agent 并行执行<推荐标记>
2. 串行执行 — 当前 session 逐步实现
```

**如果 plans.md 有 strategy header：**
- 对应选项标记为"（推荐）"
- 用户不明确选择时，默认采用推荐方案

**如果 plans.md 无 strategy header（兼容旧 change）：**
- 分析任务特征后给出推荐
- 两个选项不标记推荐，等用户明确选择
```

- [ ] **Step 4: 删除末尾的 git add -A**

删除完成步骤中的：
```bash
git add -A
git commit -m "apply: <name> 实现完成——代码 + 制品验证 + 复盘"
```

替换为每个制品（verify.md、retrospective.md）审批后独立 commit 的说明：

```markdown
### apply 阶段 commit 规则

- 代码变更：SDD 过程中每次成功验证后立即 commit
- verify.md：审批通过后 hash + commit
- retrospective.md：审批通过后 hash + commit

commit message 格式：`apply(<change-name>): <内容>`

apply 末尾不再执行 `git add -A` 一把提交——所有变更已在过程中分步 commit。
```

- [ ] **Step 5: 更新 Step 5 retrospective PRECHECK**

`verify.md` 引用保持不变（未改名）。

- [ ] **Step 6: 更新闸门规则**

plan→plans 引用更新。

- [ ] **Step 7: Commit**

```bash
git add commands/alloy/apply.md
git commit -m "refactor: apply SDD 推荐 + 删除 git add -A + 每制品独立 commit + plan→plans"
```

---

### Task 9: commands/alloy/ — 其余文件 plan→plans 引用更新

**Files:**
- Modify: `commands/alloy/archive.md`
- Modify: `commands/alloy/finish.md`
- Modify: `commands/alloy/fix.md`
- Modify: `commands/alloy/discard.md`
- Modify: `commands/alloy/status.md`

- [ ] **Step 1: 全文替换所有 plan.md → plans.md**

```bash
for f in commands/alloy/archive.md commands/alloy/finish.md commands/alloy/fix.md commands/alloy/discard.md commands/alloy/status.md; do
  sed -i '' 's/plan\.md/plans.md/g' "$f"
done
```

- [ ] **Step 2: 手动检查语义正确性**

逐个文件确认 plan→plans 替换没有引入问题（如 `explain` 这类不含 plan 的词不应受影响）。

- [ ] **Step 3: Commit**

```bash
git add commands/alloy/archive.md commands/alloy/finish.md commands/alloy/fix.md commands/alloy/discard.md commands/alloy/status.md
git commit -m "refactor: 全文 plan.md→plans.md (archive/finish/fix/discard/status)"
```

---

### Task 10: docs/alloy-design.md + docs/alloy-dev-guide.md 全文更新

**Files:**
- Modify: `docs/alloy-design.md`

- [ ] **Step 1: plan.md → plans.md 全文替换**

- [ ] **Step 2: 更新 AlloyState 结构文档**

在"制品状态"或相关章节更新 `.alloy.yaml` 结构说明，加入 `records` 字段。

- [ ] **Step 3: 更新 start 阶段行为**

反映 change 创建从 plan 前移到 start 末尾。

- [ ] **Step 4: 更新 plan 阶段行为**

反映 writing-plans 集成、/opsx:continue 止步 tasks。

- [ ] **Step 5: 更新 apply 阶段行为**

反映 SDD 推荐展示、删除 git add -A、每制品独立 commit。

- [ ] **Step 6: 更新 commit 策略章节**

新增或修改内容反映每制品一 commit 的原则。

- [ ] **Step 7: 更新制品列表**

所有表格和列表中的 plan → plans。

- [ ] **Step 8: Commit**

```bash
git add docs/alloy-design.md
git commit -m "docs: 设计文档全文 plan→plans + start/plan/apply 流程更新"
```

---

### Task 11: 全量测试 + build + link

**Files:** 无（验证任务）

- [ ] **Step 1: 运行全量 vitest**

```bash
npx vitest run
```
Expected: 全部 PASS（约 30+ 测试）

- [ ] **Step 2: 检查 .alloy.yaml 示例**

在测试环境中执行完整流程，确认 `.alloy.yaml` 输出格式：

```yaml
worktree: null
schema_version: 1
phase: started
created_at: "2026-05-30T10:00:00Z"
updated_at: "2026-05-30T10:01:00Z"
records:
  - artifact: draft
    hash: a1b2c3d4e5f6
    approved_at: "2026-05-30T10:00:00Z"
    approver: test-user
```

- [ ] **Step 3: Build + Link**

```bash
npm run build && npm link
```

- [ ] **Step 4: 验证 _record 命令可用**

```bash
alloy _record
```
Expected: 显示用法（非"未知命令"错误）

- [ ] **Step 5: Commit（如有微调）**

```bash
git add -A
git commit -m "chore: 全量测试 → build → link 验证通过"
```

---

## 执行顺序与依赖

```
Task 1 (types+records) ──→ Task 2 (_record命令) ──→ Task 3 (guard校验)
                                                    ↓
Task 4 (skills去重) ──────────────────────────────→ Task 11 (全量测试)
                                                    ↓
Task 5 (schema命名) ──→ Task 6 (start) ──→ Task 7 (plan) ──→ Task 8 (apply) ──→ Task 9 (其余commands) ──→ Task 10 (docs)
```

- Task 1-3 是基础设施（CLI 层），必须先完成
- Task 4 独立，可并行
- Task 5 是命名变更的基础，Task 6-10 依赖它
- Task 6-10 是编排层变更，按阶段顺序执行
- Task 11 收尾
