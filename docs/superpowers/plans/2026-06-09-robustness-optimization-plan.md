# Alloy 鲁棒性优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复全部已知代码 bug，优化 Skill 文件使弱模型能正确执行，统一跨文件规则对齐 skill-writing-guide。

**Architecture:** 三波分层递进——第一波修代码层 bug（TypeScript 源码 + 测试），第二波优化 Skill 文件（commands/alloy/*.md），第三波同步文档和一致性对齐。每波独立可验证，不改功能逻辑。

**Tech Stack:** TypeScript 5.8+, Node.js ≥18, Vitest 3.1+, YAML

**分支策略:** 在 `main` 上创建 `refactor/robustness-optimization` 分支，所有工作在此分支进行。

---

## 第一波：代码 bug 全修

### Task 1: 创建特性分支 + 指导文档骨架

**Files:**
- 分支: `refactor/robustness-optimization`
- Create: `docs/reference/robustness-guide.md`

- [ ] **Step 1: 创建特性分支**

```bash
git checkout -b refactor/robustness-optimization
```

- [ ] **Step 2: 创建指导文档骨架**

```markdown
# Alloy 鲁棒性指导文档

> 本文档沉淀 Alloy 开发中的优化方案和注意点，指导后续开发避免重复踩坑。

## 一、代码层注意事项

### 1.1 状态文件写入：必须原子化

直接 `writeFileSync` 写文件存在进程中断损坏风险。应使用"先写临时文件再 rename"的原子写入模式。

### 1.2 并发访问：需要文件锁

（补充中...）

## 二、Skill 文件注意事项

### 2.1 内联脚本：禁止

（补充中...）

## 三、跨文件一致性

### 3.1 git add 规则

（补充中...）
```

- [ ] **Step 3: 提交骨架**

```bash
git add docs/reference/robustness-guide.md
git commit -m "docs: 鲁棒性指导文档骨架"
```

---

### Task 2: H1 — 非原子状态文件写入修复

**Files:**
- Modify: `src/cli/utils/state.ts:43-51`

- [ ] **Step 1: 写测试验证原子写入行为**

完整的测试代码：

```typescript
// 追加到 test/cli/utils/state.test.ts
import { writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("writeState atomic write", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "alloy-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("should write via temp file then rename (no .tmp leftover)", async () => {
    const state = createInitialState();
    await writeState(tmpDir, state);

    // 验证 .alloy.yaml 存在
    const yamlPath = join(tmpDir, ".alloy.yaml");
    const content = await readFile(yamlPath, "utf-8");
    expect(content).toContain("phase: started");

    // 验证 .alloy.yaml.tmp 不存在（原子替换后清理）
    const tmpPath = join(tmpDir, ".alloy.yaml.tmp");
    await expect(readFile(tmpPath, "utf-8")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run test/cli/utils/state.test.ts -t "writeState atomic write"
```

- [ ] **Step 3: 修改 `writeState` 实现原子写入**

```typescript
// src/cli/utils/state.ts — 修改 writeState 函数
export async function writeState(
  changePath: string,
  state: AlloyState
): Promise<void> {
  const yamlPath = join(changePath, ".alloy.yaml");
  const tmpPath = join(changePath, ".alloy.yaml.tmp");
  state.updated_at = formatTimestamp();
  const content = stringifyYaml(state);
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, yamlPath);
}
```

需要在文件头部增加 `rename` 导入：
```typescript
import { readFile, writeFile, readdir, mkdir, rename } from "node:fs/promises";
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run test/cli/utils/state.test.ts -t "writeState atomic write"
npx vitest run  # 全量回归
```

- [ ] **Step 5: commit**

```bash
git add src/cli/utils/state.ts test/cli/utils/state.test.ts
git commit -m "fix: writeState 改为原子写入（临时文件+rename），防进程中断损坏 .alloy.yaml"
```

---

### Task 3: H2 — 并发状态文件访问修复（文件锁）

**Files:**
- Modify: `src/cli/utils/state.ts` — `writeState` 函数

- [ ] **Step 1: 写测试验证锁行为**

在 `test/cli/utils/state.test.ts` 中追加：

```typescript
import { mkdirSync, existsSync } from "node:fs";

describe("writeState file lock", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "alloy-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("should create and release lock file during write", async () => {
    const state = createInitialState();
    const lockPath = join(tmpDir, ".alloy.yaml.lock");

    // 写入前锁文件不应存在
    expect(existsSync(lockPath)).toBe(false);

    await writeState(tmpDir, state);

    // 写入后锁文件应已释放
    expect(existsSync(lockPath)).toBe(false);
  });

  it("should throw if lock is held for more than timeout", async () => {
    const lockPath = join(tmpDir, ".alloy.yaml.lock");
    mkdirSync(lockPath); // 模拟竞争进程持有锁

    const state = createInitialState();
    await expect(writeState(tmpDir, state)).rejects.toThrow("locked");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run test/cli/utils/state.test.ts -t "writeState file lock"
```

- [ ] **Step 3: 修改 `writeState` 加文件锁到原子写入中**

```typescript
import { existsSync, mkdirSync, rmdirSync } from "node:fs";

const LOCK_TIMEOUT_MS = 5000;
const LOCK_POLL_MS = 50;

function acquireLock(changePath: string): void {
  const lockPath = join(changePath, ".alloy.yaml.lock");
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      mkdirSync(lockPath);
      return; // 获取锁成功
    } catch {
      // 锁被占用，等待后重试
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
    }
  }
  throw new AlloyStateError(`无法获取 .alloy.yaml 文件锁，超时 ${LOCK_TIMEOUT_MS}ms`);
}

function releaseLock(changePath: string): void {
  const lockPath = join(changePath, ".alloy.yaml.lock");
  try {
    rmdirSync(lockPath);
  } catch {
    // 锁目录可能已被清理
  }
}
```

- [ ] **Step 4: 修改 `writeState` 使用锁包裹原子写入**

```typescript
export async function writeState(
  changePath: string,
  state: AlloyState
): Promise<void> {
  acquireLock(changePath);
  try {
    const yamlPath = join(changePath, ".alloy.yaml");
    const tmpPath = join(changePath, ".alloy.yaml.tmp");
    state.updated_at = formatTimestamp();
    const content = stringifyYaml(state);
    await writeFile(tmpPath, content, "utf-8");
    await rename(tmpPath, yamlPath);
  } finally {
    releaseLock(changePath);
  }
}
```

- [ ] **Step 5: 运行全量测试，更新指导文档**

```bash
npx vitest run
```

更新 `docs/reference/robustness-guide.md` 中 1.2 节：文件锁的使用方式。

- [ ] **Step 6: commit**

```bash
git add src/cli/utils/state.ts test/cli/utils/state.test.ts docs/reference/robustness-guide.md
git commit -m "fix: writeState 加文件锁，防并发场景丢失更新"
```

---

### Task 4: H3+H4+H5+H6 — 剩余高严重度 bug 批量修复

**Files:**
- Modify: `src/core/health.ts` — H3 空数组保护
- Modify: `src/cli/utils/state.ts` — H4 状态验证
- Modify: `src/core/agents.ts` — H5 `os.homedir()`
- Modify: `src/cli/commands/init.ts` — H6 try-catch
- Modify: 其他使用 `process.env.HOME` 的文件

- [ ] **Step 1: 修复 H3 — `checkSuperpowers` 空数组保护**

在 `src/core/health.ts` 第 47 行后，确认空数组检查已是 `sp && sp.length > 0`（目前代码已有此检查！）——检查结果代码第 48 行：`if (sp && sp.length > 0)`。

检查结果：**H3 不可复现**——代码第 48 行已有 `sp && sp.length > 0` 保护。无需修改。

- [ ] **Step 2: 修复 H4 — `validateState` 函数**

在 `src/cli/utils/state.ts` 末尾追加：

```typescript
const VALID_PHASES = new Set(["started", "planned", "applied", "archived", "finished"]);

class AlloyStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlloyStateError";
  }
}

function validateState(state: unknown, changePath: string): AlloyState {
  const s = state as Record<string, unknown>;
  if (!s || typeof s !== "object") {
    throw new AlloyStateError(`.alloy.yaml 格式无效: ${changePath}`);
  }
  if (typeof s.phase !== "string" || !VALID_PHASES.has(s.phase)) {
    throw new AlloyStateError(
      `.alloy.yaml phase 非法: ${JSON.stringify(s.phase)} (${changePath})`
    );
  }
  if (typeof s.created_at !== "string") {
    throw new AlloyStateError(`.alloy.yaml 缺少 created_at: ${changePath}`);
  }
  if (typeof s.schema_version !== "number") {
    throw new AlloyStateError(`.alloy.yaml 缺少 schema_version: ${changePath}`);
  }
  // records 字段：缺失时补空数组，不报错（向后兼容旧 state）
  if (!Array.isArray(s.records)) {
    s.records = [];
  }
  return s as unknown as AlloyState;
}
```

修改 `readState` 使用 `validateState`：
```typescript
export async function readState(changePath: string): Promise<AlloyState> {
  const yamlPath = join(changePath, ".alloy.yaml");
  let content: string;
  try {
    content = await readFile(yamlPath, "utf-8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(`缺少 .alloy.yaml: ${changePath}`);
    }
    throw err;
  }
  const parsed = parseYaml(content);
  return validateState(parsed, changePath);
}
```

- [ ] **Step 3: 修复 H5 — `os.homedir()` 替代 `"~"` 回退**

搜索所有使用 `process.env.HOME || process.env.USERPROFILE || "~"` 的位置：

位置：
1. `src/core/agents.ts:64`
2. `src/core/health.ts:43` — `checkSuperpowers`
3. `src/core/health.ts:177` — `runHealthCheck`
4. `src/cli/commands/init.ts:144`
5. `src/cli/index.ts:107` — `installCompletion`
6. `src/core/superpowers.ts:3` — 已使用 `homedir` ✓
7. `src/core/openspec.ts:75` — `initOpenSpecProject`
8. `src/cli/commands/update.ts:29` — `detectScope`

统一替换策略：所有 `process.env.HOME || process.env.USERPROFILE || "~"` → `homedir()`。

逐一修复：
- `src/core/agents.ts:64`：改为 `homedir()`
- `src/core/health.ts:43`：改为 `homedir()`
- `src/core/health.ts:177`：改为 `homedir()`
- `src/cli/commands/init.ts:144`：改为 `homedir()`
- `src/cli/index.ts:107`：改为 `homedir()`
- `src/core/openspec.ts:75`：改为 `homedir()`
- `src/cli/commands/update.ts:29`：改为 `homedir()`

需要的改动：在未导入 `homedir` 的文件中增加 `import { homedir } from "node:os";`

- [ ] **Step 4: 修复 H6 — `deploySchema` try-catch**

在 `src/cli/commands/init.ts` 第 121-122 行，包裹 `deploySchema`：

```typescript
try {
  const schemaPath = await deploySchema(opts);
  success(`项目 schema → ${schemaPath}`);
} catch (e) {
  error(`项目 schema 部署失败: ${(e as Error).message}。请稍后运行 alloy update 重试。`);
}
```

- [ ] **Step 5: 运行全量测试**

```bash
npx vitest run
```

- [ ] **Step 6: 在指导文档中补充 H4-H6 的注意点**

```bash
# 手动编辑 docs/reference/robustness-guide.md，补充：
# - 状态读取必须验证字段
# - 路径操作使用 os.homedir() 而非字符串拼接
# - 部署函数必须 try-catch
```

- [ ] **Step 7: commit**

```bash
git add src/cli/utils/state.ts src/core/agents.ts src/core/health.ts src/core/openspec.ts src/cli/commands/init.ts src/cli/commands/update.ts src/cli/index.ts docs/reference/robustness-guide.md
git commit -m "fix: 高严重度 bug 修复——状态验证、homedir 替代、deploySchema 异常捕获"
```

---

### Task 5: M1+M2+M3 — 中严重度（兼容性+marker+硬编码）

**Files:**
- Modify: `src/core/compat.ts`
- Modify: `src/core/claude-md.ts`
- Modify: `src/cli/commands/update.ts`
- Modify: `src/core/openspec.ts`
- Modify: `src/core/superpowers.ts`

- [ ] **Step 1: M1 — `loadCompat` 字段验证**

修改 `src/core/compat.ts`：

```typescript
export class CompatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompatError";
  }
}

export async function loadCompat(packageDir: string): Promise<CompatConfig> {
  const content = await readFile(join(packageDir, "compat.yaml"), "utf-8");
  const parsed = parseYaml(content) as CompatConfig;

  if (!parsed?.compatible || typeof parsed.compatible !== "object") {
    throw new CompatError("compat.yaml 缺少 compatible 字段");
  }
  if (!parsed?.install || typeof parsed.install !== "object") {
    throw new CompatError("compat.yaml 缺少 install 字段");
  }
  return parsed;
}
```

- [ ] **Step 2: M2 — `injectClaudeMd` end marker 缺失保护**

修改 `src/core/claude-md.ts`，第 39-47 行：

```typescript
if (existing.includes(CLAUDE_MD_MARKER_START)) {
  const startIdx = existing.indexOf(CLAUDE_MD_MARKER_START);
  const endIdx = existing.indexOf(CLAUDE_MD_MARKER_END);
  if (endIdx > startIdx) {
    existing =
      existing.slice(0, startIdx) +
      existing.slice(endIdx + CLAUDE_MD_MARKER_END.length);
  }
  // 找不到 end marker → 跳过删除，直接追加（防文件损坏）
}
```

实际上当前代码逻辑已正确处理（`endIdx <= startIdx` 时不进入删除逻辑）。只需加注释说明。

- [ ] **Step 3: M3 — 包名/安装命令从 compat.yaml 读取**

修改 `src/cli/commands/update.ts`：
```typescript
import { loadCompat } from "../../core/compat.js";
import { getPackageRoot } from "../../utils/fs.js";

async function checkLatestVersion(): Promise<string | null> {
  try {
    const pkg = JSON.parse(
      readFileSync(join(getPackageRoot(), "package.json"), "utf-8")
    );
    return execSync(`npm view ${pkg.name} version`, { stdio: "pipe" })
      .toString()
      .trim();
  } catch {
    return null;
  }
}
```

同理修改升级命令：
```typescript
const pkg = JSON.parse(
  readFileSync(join(getPackageRoot(), "package.json"), "utf-8")
);
execSync(`npm update -g ${pkg.name}`, { stdio: "pipe" });
```

修改 `src/core/openspec.ts` — 从 compat.yaml 读取安装命令：
```typescript
export async function installOpenSpecCli(): Promise<"installed" | "skipped" | "failed"> {
  const packageDir = getPackageRoot();
  const config = await loadCompat(packageDir);
  const dep = checkOpenSpec(config.compatible.openspec);
  // ... 已有检查 ...

  try {
    const installCmd = config.install?.openspec ?? "@fission-ai/openspec@1";
    execSync(`npm install -g ${installCmd}`, { stdio: "pipe" });
    return "installed";
  } catch {
    return "failed";
  }
}
```

修改 `src/core/superpowers.ts` — 从 compat.yaml 读取安装命令：
```typescript
// 第 66 行，改为：
const spPkg = config.install?.superpowers ?? "obra/superpowers@5";
execSync(`npx skills add ${spPkg} ${flags}`, { stdio: "pipe" });
```

- [ ] **Step 4: 运行全量测试**

```bash
npx vitest run
```

- [ ] **Step 5: commit**

```bash
git add src/core/compat.ts src/core/claude-md.ts src/cli/commands/update.ts src/core/openspec.ts src/core/superpowers.ts
git commit -m "fix: 中严重度修复——Compat 验证、ClaudeMd marker 保护、硬编码改配置引用"
```

---

### Task 6: M4+M5+M6 — 输入验证、静默失败、错误处理统一

**Files:**
- Modify: `src/cli/commands/internal/state.ts`
- Modify: `src/cli/commands/internal/config.ts`
- Modify: `src/cli/commands/init.ts`
- Modify: `src/core/superpowers.ts`
- Modify: `src/cli/commands/internal/guard.ts`

- [ ] **Step 1: M4 — `_state write` 字段白名单**

在 `src/cli/commands/internal/state.ts` 中定义允许写入的字段白名单，在 `case "write":` 块中校验：

```typescript
const WRITABLE_FIELDS = new Set([
  "phase", "worktree", "worktree_branch", "worktree_created_at",
  "worktree_merged_at", "feature_branch",
  "phase_timings", "records", "schema_version",
]);

// 在 "write" case 中，coerceValue 之前：
if (!WRITABLE_FIELDS.has(field)) {
  console.error(`字段 '${field}' 不允许直接写入`);
  process.exit(1);
}
```

- [ ] **Step 2: M4 — `init --scope` 枚举校验**

修改 `src/cli/commands/init.ts` 第 16-17 行：

```typescript
const VALID_SCOPES = new Set(["global", "project"]);

export async function selectScope(passedScope?: string): Promise<"global" | "project"> {
  if (passedScope) {
    if (!VALID_SCOPES.has(passedScope)) {
      throw new Error(`无效 scope: ${passedScope}，支持 global 或 project`);
    }
    return passedScope as "global" | "project";
  }
  // ...
}
```

- [ ] **Step 3: M4 — `_config write` 已知 key 白名单**

在 `src/cli/commands/internal/config.ts` 中定义允许的 config key：

```typescript
const KNOWN_CONFIG_KEYS = new Set(["main_branch"]);

// 在 write case 中：
case "write": {
  if (!field || value === undefined) {
    console.error("用法: alloy _config write <project-root> <field> <value>");
    process.exit(1);
  }
  if (!KNOWN_CONFIG_KEYS.has(field)) {
    console.error(`未知 config key: '${field}'，已知 key: ${[...KNOWN_CONFIG_KEYS].join(", ")}`);
    process.exit(1);
  }
  // ... 原有逻辑
}
```

- [ ] **Step 4: M5 — 静默失败修复**

`src/cli/commands/init.ts` — shell completion 失败记录到 results（非空 catch）：
```typescript
} catch (e) {
  // 注册失败不阻断 init，记录到结果
  warn(`shell 补全注册失败: ${(e as Error).message}。可稍后手动运行 alloy completion --install`);
}
```

`src/core/superpowers.ts` — `fallbackInstall` 返回错误信息：
```typescript
function fallbackInstall(scope: "global" | "project"): SuperpowersInstallResult {
  try {
    const packageDir = getPackageRoot();
    const vendorSkills = join(packageDir, "vendor", "superpowers", "skills");

    if (!existsSync(vendorSkills)) {
      return { status: "failed", version: null, location: "vendor 目录缺失" };
    }
    // ...
  } catch (err) {
    return { status: "failed", version: null, location: `复制失败: ${(err as Error).message}` };
  }
}
```

`src/cli/commands/update.ts` — 升级失败后说明部署的是旧版本：
```typescript
} catch {
  results.push(`${color.yellow("⚠️")} CLI 升级失败，将使用当前版本部署 commands`);
}
```

- [ ] **Step 5: M6 — error handling 统一**

在 `src/core/types.ts` 中已有 `AlloyStateError` 通过 state.ts 定义。需要在 guard.ts 中将 `process.exit(1)` 改为 `throw new Error()`：

修改 `src/cli/commands/internal/guard.ts`，所有 `process.exit(1)` 改为 `throw new Error(...)`：

```typescript
// 第 69 行：用法错误
if (!changeDir || !targetPhase) {
  throw new Error("用法: alloy _guard <change-dir> <target-phase> [--apply]");
}

// 第 79 行：不允许的 phase 转换
if (!allowed || !allowed.includes(targetPhase)) {
  throw new Error(
    `[HARD STOP] 不允许的 phase 转换: ${currentPhase} → ${targetPhase}\n` +
    "  允许的转换: started→planned, planned→applied, applied→archived, archived→finished"
  );
}

// 同理修改其他 process.exit(1) 调用
```

检查 `src/cli/index.ts` 第 351-354 行——已有顶层 `main().catch()` 将异常转为 `process.exit(1)`。所以 guard.ts 改为 throw 后行为一致。

- [ ] **Step 6: 运行全量测试**

```bash
npx vitest run
```

- [ ] **Step 7: 更新指导文档**

补充输入验证、错误处理统一的注意点。

- [ ] **Step 8: commit**

```bash
git add src/cli/commands/internal/state.ts src/cli/commands/internal/config.ts src/cli/commands/internal/guard.ts src/cli/commands/init.ts src/core/superpowers.ts src/cli/commands/update.ts docs/reference/robustness-guide.md
git commit -m "fix: 输入验证、静默失败修复、错误处理统一为 throw"
```

---

### Task 7: L1+L2+L3+L4 — 低严重度（重复代码、测试、代码质量）

**Files:**
- Create: `src/cli/utils/hash.ts`
- Modify: `src/cli/commands/internal/guard.ts`
- Modify: `src/cli/commands/internal/record.ts`
- Modify: `src/cli/index.ts`
- Modify: `test/` — 多个测试文件

- [ ] **Step 1: L1 — 抽取 `computeHash` 到共享模块**

创建 `src/cli/utils/hash.ts`：

```typescript
import { createHash } from "node:crypto";
import { readFile, stat, readdir } from "node:fs/promises";
import { join } from "node:path";

export const ARTIFACT_FILES: Record<string, string> = {
  draft: "draft.md",
  proposal: "proposal.md",
  design: "design.md",
  specs: "specs",
  tasks: "tasks.md",
  plans: "plans.md",
  verify: "verify.md",
  retrospective: "retrospective.md",
};

export function computeHash(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex").substring(0, 12);
}

export async function computeArtifactHash(
  changeDir: string,
  artifactId: string
): Promise<string | null> {
  const fileName = ARTIFACT_FILES[artifactId];
  if (!fileName) return null;

  const fullPath = join(changeDir, fileName);
  try {
    const st = await stat(fullPath);
    if (st.isDirectory()) {
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
```

更新 `src/cli/commands/internal/guard.ts`——删除本地 `computeHash`、`computeArtifactHash`、`ARTIFACT_FILES` 定义，改为 import：

```typescript
import { computeHash, computeArtifactHash, ARTIFACT_FILES } from "../../utils/hash.js";
```

更新 `src/cli/commands/internal/record.ts`——同上。

- [ ] **Step 2: L2 — 补充测试覆盖**

补充以下测试：
1. `test/core/compat.test.ts` — 增加 `compat.yaml` 解析成功但缺 `compatible` 字段的测试
2. `test/core/claude-md.test.ts` — 增加 end marker 缺失场景
3. `test/cli/internal/guard.test.ts` — 增加 `archived->finished` transition hash 检查的测试
4. `test/cli/utils/state.test.ts` — 增加 `validateState` 非法 phase 的测试

- [ ] **Step 3: L3 — 修复 flaky test**

`Date.now()` → `mkdtempSync`：
搜索所有 test 文件中 `Date.now()` 用于创建临时目录的位置（如 `guard.test.ts`、`state.test.ts`、`skills.test.ts`），改为 `mkdtempSync`。

- [ ] **Step 4: L4 — 其它小修复**

`src/cli/index.ts:247` — 使用 `values.json`：
```typescript
const useJson = values.json as boolean;
```

`src/cli/commands/internal/state.ts:31` — `deepMerge` 返回类型改为 `AlloyState`（更精确的类型）。

- [ ] **Step 5: 运行全量测试**

```bash
npx vitest run
```

- [ ] **Step 6: commit**

```bash
git add src/cli/utils/hash.ts src/cli/commands/internal/guard.ts src/cli/commands/internal/record.ts src/cli/index.ts src/cli/commands/internal/state.ts test/
git commit -m "refactor: 低严重度修复——共享 hash 模块、测试补全、flaky 修复、代码质量"
```

---

### Task 8: 第一波完成——build 验证 + 指导文档更新

- [ ] **Step 1: Build 验证**

```bash
npm run build
```

- [ ] **Step 2: 用 aldev 手动测试**

```bash
node /Users/wenqiu/AIAgent/alloy/dist/cli/index.js --version
```

- [ ] **Step 3: 完善指导文档**

更新 `docs/reference/robustness-guide.md`，将所有第一波的注意点填充完整。

- [ ] **Step 4: commit**

```bash
git add docs/reference/robustness-guide.md
git commit -m "docs: 第一波注意点补充——原子写入、文件锁、状态验证、错误处理"
```

---

## 第二波：Skill 文件弱模型优化

### Task 9: apply.md — 删除内联脚本，简化逻辑

**Files:**
- Modify: `commands/alloy/apply.md`

- [ ] **Step 1: worktree 双写 bash 脚本 → `_state write` 命令**

将第 178-227 行的复杂 bash 脚本替换为分步 `alloy _state write` 命令。

优化后的 Step 1/5 简化版（关键变更）：

```markdown
[Step 1/5] 隔离环境设置
──────────────────────────────────────

**进入条件：**
| 检查项 | 要求 | 验证方式 |
|--------|------|---------|
| phase | planned | `alloy _state check openspec/changes/<name> planned` |
| plans.md | 存在 | 文件系统检查 |
| git repo | 可用 | `git rev-parse --git-dir` |

**自检：** 以上 3 项全部 ✓ 才继续。

...（保留 skill 预检和 using-git-worktrees 调用逻辑）

**Worktree 检测（幂等）：**

```bash
WORKTREE=$(alloy _state read openspec/changes/<name> worktree)
```

> **自检决策表：**
>
> | worktree 值 | 行为 |
> |------------|------|
> | null | 尚未决定 → 加载 using-git-worktrees |
> | skipped | 用户选择不创建 → 跳过 |
> | 路径存在 | ✓ 已完成 → 跳过 |
> | 路径不存在 | ⚠️ 残留记录 → 重新处理 |

**Worktree 创建后记录（使用 _state write，非手写 bash）：**

```bash
# 在 worktree 中执行（如已在 worktree 内）
alloy _state write openspec/changes/<name> worktree "$(git rev-parse --show-toplevel)"
alloy _state write openspec/changes/<name> worktree_branch "$(git branch --show-current)"
alloy _state write openspec/changes/<name> worktree_created_at "$(date '+%Y-%m-%d %H:%M:%S')"
```

> **自检：** worktree 已记录？worktree_branch 已记录？worktree_created_at 已记录？全部 ✓ 才继续。
```

- [ ] **Step 2: 策略选择 → 决策表**

将第 260-302 行的策略选择改为简洁决策表：

```markdown
**策略决策表：**

| 任务数 | SDD 可用 | 策略 | 加载顺序 |
|--------|---------|------|---------|
| ≤2 | 是 | executing-plans | TDD → executing-plans → spec 自审 → code-review |
| ≤2 | 否 | executing-plans | executing-plans → spec 自审 → code-review |
| ≥3 | 是 | SDD | 加载 subagent-driven-development |
| ≥3 | 否 | executing-plans | TDD → executing-plans → spec 自审 → code-review |

> **自检：** 策略已选择？用户已确认？按决策表加载技能即可。
```

- [ ] **Step 3: 幂等检查 → 统一进入条件表**

每个 Step 开头加统一格式的进入条件表。

- [ ] **Step 4: 删除内联 Python 脚本**（apply.md 中没有 Python 脚本，但有复杂 bash 和 sed）

将第 467 行 `sed` 替换为 `_state merge` 命令：
```bash
alloy _state merge openspec/changes/<name> phase_timings "{\"apply\":{\"completed_at\":\"$(date '+%Y-%m-%d %H:%M:%S')\"}}"
```

- [ ] **Step 5: 加自检点**

在每个 Step 末尾加：
```markdown
> **自检：** 本步骤所有操作已完成？状态文件已更新？全部 ✓ 才进入下一步。
```

- [ ] **Step 6: 运行全量测试 + commit**

```bash
npx vitest run
git add commands/alloy/apply.md docs/reference/robustness-guide.md
git commit -m "refactor: apply.md 弱模型优化——删除内联脚本、策略改决策表、统一自检点"
```

---

### Task 10: plan.md — DAG 表 + 回退脚本简化

**Files:**
- Modify: `commands/alloy/plan.md`

- [ ] **Step 1: DAG 依赖表 → 纵向生成顺序表**

```markdown
**制品生成顺序（DAG 依赖从上到下）：**

| 序号 | 制品 | 上游依赖（需预审） | 生成方式 | 审查前校验 |
|------|------|-------------------|---------|-----------|
| 1 | proposal | draft.md | /opsx:continue | — |
| 2 | design | proposal | /opsx:continue | proposal hash |
| 3 | specs | proposal | /opsx:continue | proposal hash |
| 4 | tasks | specs, design | /opsx:continue | specs hash, design hash |
| 5 | plans | tasks | writing-plans | tasks hash |

> **自检：** 当前制品是什么？上游 hash 已校验？全部 ✓ 才继续生成。
```

- [ ] **Step 2: hash 检查 → 简化为单命令**

将第 224-227 行的 hash 校验改为简洁格式：

```markdown
**生成 `<current-artifact>` 前，校验上游 hash：**
```bash
alloy _record check openspec/changes/<name> <upstream-artifact>
```
若返回非零 → HARD STOP。
```

- [ ] **Step 3: 回退清理脚本 → 删除内联 Python**

将第 274-308 行的回退清理 bash 块简化：
- 删除 `_state read records | python3 -c ...` 改为 `alloy _state write records "[]"` 后补写 draft record
- 删除 `_state read phase_timings | python3 -c ... | while read` 改为逐个 `alloy _state write phase_timings <key> null`

优化后：
```bash
# 1. 删除 plan 制品文件（保留 draft.md）
rm -f openspec/changes/<name>/proposal.md
rm -f openspec/changes/<name>/design.md
rm -f openspec/changes/<name>/tasks.md
rm -f openspec/changes/<name>/plans.md
rm -rf openspec/changes/<name>/specs/

# 2. 清理 records：保留 draft record（用 --artifact draft 筛选），其余丢弃
DRAFT_RECORD=$(alloy _state read openspec/changes/<name> records 2>/dev/null || echo "[]")
# 重建 records：如果 draft record 存在则写入它，否则置空
if echo "$DRAFT_RECORD" | grep -q '"artifact":"draft"'; then
  DRAFT_HASH=$(alloy _record compute openspec/changes/<name> draft)
  DRAFT_TIME=$(alloy _state read openspec/changes/<name> records | grep -o '"committed_at":"[^"]*"' | head -1 | cut -d'"' -f4)
  APPROVER=$(alloy _record approver openspec/changes/<name>)
  alloy _record write openspec/changes/<name> draft "$DRAFT_HASH" "${DRAFT_TIME:-$(date '+%Y-%m-%d %H:%M:%S')}" "$APPROVER"
else
  alloy _state write openspec/changes/<name> records "[]"
fi

# 3. 重置 phase_timings：清空后只恢复 start（completed_at 重置为 null）
alloy _state write openspec/changes/<name> phase_timings "{\"start\":{\"completed_at\":null}}"

git add openspec/changes/<name>/
git commit -m "chore(<name>): 回溯——清理 plan 制品，回到 brainstorming"
```

- [ ] **Step 4: 运行全量测试 + commit**

```bash
npx vitest run
git add commands/alloy/plan.md
git commit -m "refactor: plan.md 弱模型优化——DAG 纵向表、删除内联 Python、hash 简化"
```

---

### Task 11: archive.md + start.md + finish.md — 弱模型优化

**Files:**
- Modify: `commands/alloy/archive.md`
- Modify: `commands/alloy/start.md`
- Modify: `commands/alloy/finish.md`

- [ ] **Step 1: archive.md 优化**

**worktree 清理 → 决策表（仅给模型看，不打乱现有逻辑）：**

```markdown
**Worktree 清理决策表：**

| worktree 状态 | feature_branch | worktree_branch | 操作 |
|-------------|---------------|----------------|------|
| 路径存在 | 有 | 有 | 直接 merge + remove |
| 路径存在 | 有 | 无（旧 change） | git worktree list 检测 → merge + remove |
| 路径存在 | 无（旧 change） | 有 | 用 feature/<name> 作为 feature branch |
| skipped | — | — | 跳过 |
| null | — | — | 跳过 |
```

**`git add -A` → 去掉 `-A`：**

第 107 行改为：
```bash
git add openspec/specs/ openspec/changes/
```

第 201 行改为：
```bash
git add openspec/specs/ openspec/changes/
```

**ARCHIVE_DIR 存在性验证：**

在第 117 行后加：
```markdown
**验证归档路径存在：**
```bash
ls -d "$ARCHIVE_DIR" || { echo "归档路径 $ARCHIVE_DIR 不存在"; exit 1; }
```
```

- [ ] **Step 2: start.md 优化**

**分支选择 → 决策表：**

```markdown
**分支选择决策表：**

| 当前位置 | 条件 | 操作 |
|---------|------|------|
| 主分支上 | — | HARD STOP → 仅展示"新建分支"选项 |
| feature/<name> 分支 | 名称匹配 | 提示直接继续 [Y/n] |
| 非主分支 | 有其他本地分支 | 展示：①切换已有 ②新建 |
| 非主分支 | 无其他本地分支 | 直接新建分支 |
```

**时间戳处理自检点（加在 Step 1/2 末尾）：**

```markdown
> **自检 (时间戳)：** 是否用 `date "+%Y-%m-%d %H:%M:%S"` 直接获取？是否尝试存到 bash 变量？后者会跨调用丢失——只捕获命令输出文本。
```

- [ ] **Step 3: finish.md 优化**

**内联 receiving-code-review → Skill 工具调用：**

删除第 181-186 行内联的 receiving-code-review 行为规范。在 Step 2 选项 2 后改为：

```markdown
- 当用户收到 PR 审查反馈并在对话中讨论时，使用 Skill 工具加载 `superpowers:receiving-code-review` 技能处理审查反馈。
```

**ARCHIVE_DIR 精确匹配：**

第 149 行改为：
```bash
ARCHIVE_DIR=$(ls -d openspec/changes/archive/*-<name> 2>/dev/null | while read d; do test "$(basename "$d")" = "$(ls -d openspec/changes/archive/*-<name> | head -1 | xargs basename)" && echo "$d" && break; done)
# verify:
if [ -z "$ARCHIVE_DIR" ]; then
  # 回退到未归档路径
  ARCHIVE_DIR="openspec/changes/<name>"
fi
```

简化方案：用 `find` 精确匹配：
```bash
ARCHIVE_DIR=$(find openspec/changes/archive -maxdepth 1 -type d -name "*-<name>" | head -1)
```

**选项 3 next step 提示：**

```markdown
**选项 3：保持分支**
- 提示："分支已保留，phase 保持 archived。后续需要时再次运行 `/alloy:finish <name>` 继续收尾。"
```

- [ ] **Step 4: 运行全量测试 + commit**

```bash
npx vitest run
git add commands/alloy/archive.md commands/alloy/start.md commands/alloy/finish.md docs/reference/robustness-guide.md
git commit -m "refactor: archive/start/finish.md 弱模型优化——决策表、自检点、Skill 工具调用"
```

---

### Task 12: status.md + discard.md + fix.md — 小幅优化 + 跨文件统一

**Files:**
- Modify: `commands/alloy/status.md`
- Modify: `commands/alloy/discard.md`
- Modify: `commands/alloy/fix.md`
- Modify: 所有 `commands/alloy/*.md` — 统一 section 标题和格式

- [ ] **Step 1: status.md — 加 .alloy.yaml 不存在提示**

```markdown
**若 `openspec/changes/` 目录不存在：** 显示"暂无活跃 change，运行 `/alloy:start <topic>` 开始"。

**若 `.alloy.yaml` 不存在于 change 目录：** 显示"⚠️ 状态文件缺失，change 可能已损坏"。
```

- [ ] **Step 2: discard.md — 加 uncommitted changes 检查**

在确认提示前加：
```bash
# 检查是否有未提交变更
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "⚠️ 当前有未提交的变更，discard 会丢失这些变更。"
  echo "请先提交或 stash 后再 discard。"
  exit 1
fi
```

- [ ] **Step 3: fix.md — 加 `alloy status --json` 失败回退**

```markdown
**若 `alloy status --json` 失败：**
- 手动检测：`git branch --show-current`、`alloy _state read`、worktree 检测
- 不阻断，仅提示"自动检测部分信息不可用，已使用手动检测结果"
```

- [ ] **Step 4: 跨文件统一格式**

对全部 8 个 skill 文件执行以下统一：

1. **section 标题格式统一为：** `## Alloy · <阶段> · <描述>`
2. **子步骤统一为：** `### Step N/M：<描述>`
3. **自检点统一为：** `> **自检：** 条件1？条件2？全部 ✓ 才继续。`
4. **闸门规则统一为：** `> **闸门：** <描述>。不满足则 HARD STOP。`
5. **git add 规则统一：** 全部精确路径，注释说明"禁止 -A/-a/."

具体改动（每个文件）：

**start.md:**
- `## 状态检测` → `## Alloy · Start · 状态检测`
- `### [Step 1/2] 上下文探查` → `### Step 1/2：上下文探查`
- `## 闸门规则` → 加统一格式

**plan.md:**
- 前置检查后的 `## Step 1/3` → `### Step 1/3：确认 Change`
- 同理所有 Step

**apply.md:**
- `## 前置检查` 保留
- `[Step 1/5] 隔离环境设置` → `### Step 1/5：隔离环境设置`

**archive.md:**
- `### [Step 1/3] 前置检查` → `### Step 1/3：前置检查`

**finish.md:**
- `### [Step 1/3] 前置检查` → `### Step 1/3：前置检查`

**fix.md:**
- `## Step 1/3` → `### Step 1/3：环境感知`

**status.md:**
- `## 无参数：总览模式` → `### 总览模式`

**discard.md:**
- 已有简单格式，微调

- [ ] **Step 5: commit**

```bash
git add commands/alloy/*.md docs/reference/robustness-guide.md
git commit -m "refactor: skill 文件全量弱模型优化 + 跨文件格式统一"
```

---

## 第三波：跨文件一致性对齐

### Task 13: Skill → Skill Writing Guide 对齐

**Files:**
- Modify: `commands/alloy/start.md` — description 措辞
- Modify: `commands/alloy/finish.md` — Skill 工具调用确认
- Modify: 全部 8 个 skill 文件 — 反例补充

- [ ] **Step 1: start.md description 微调**

```yaml
description: 新功能构思或接续已有工作时调用——自动检测状态并路由到正确流程
```

- [ ] **Step 2: 每个闸门补反例**

为每个闸门补至少 1 个"什么不算通过"的反例：

- **start.md** — draft.md 闸门已有反例 ✓
- **plan.md** — 审查闸门已有反例 ✓
- **apply.md** — 闸门规则下加 `git add -A（无路径限定）` 反例
- **archive.md** — verify.md 闸门已有反例 ✓
- **finish.md** — 分支已 merge 的 finish 已有反例 ✓
- **fix.md** — 已有详细反例 ✓
- **discard.md** — 确认提示已有反例 ✓
- **status.md** — 只读命令，不需要闸门

- [ ] **Step 3: 确认 finish.md 不再内联其他 skill 行为**

Task 11 已处理。在此步骤做最终检查。

- [ ] **Step 4: commit**

```bash
git add commands/alloy/*.md
git commit -m "docs: skill 文件对齐 skill-writing-guide——description/闸门/反例"
```

---

### Task 14: 产品规格和视觉规格同步

**Files:**
- Modify: `docs/specification/01-product-spec.md`
- Modify: `docs/specification/02-visual-spec.md`

- [ ] **Step 1: 检查 01-product-spec.md 中受影响的描述**

逐节比对齐 skill 文件变更：
- git add 规则统一（archive 不再用 `-A`）
- section 标题格式统一
- 错误处理改为 throw 模式

对应更新 spec 文字。

- [ ] **Step 2: 检查 02-visual-spec.md 中受影响的格式**

- section 标题格式变更
- 自检点新增格式
- 决策表新增格式

- [ ] **Step 3: commit**

```bash
git add docs/specification/
git commit -m "docs: 产品规格和视觉规格同步——对齐 skill 优化后的规则和格式"
```

---

### Task 15: Handbook 同步

**Files:**
- Modify: `docs/handbook.md`

- [ ] **Step 1: 扫描 handbook 中引用命令行为描述的位置**

检查以下方面是否需要同步：
- 错误处理方式变更（`process.exit` → `throw`）
- `_state write` 字段白名单
- `_config write` key 白名单
- skill 文件 section 标题格式变更

- [ ] **Step 2: 更新 handbook**

- [ ] **Step 3: commit**

```bash
git add docs/handbook.md
git commit -m "docs: handbook 同步——对齐代码修复和 skill 优化后的行为描述"
```

---

### Task 16: 指导文档最终完善

**Files:**
- Modify: `docs/reference/robustness-guide.md`

- [ ] **Step 1: 整理三波的所有注意点**

汇总指导文档各章节内容。

- [ ] **Step 2: 补充"Skill 文件编写检查清单"**

在指导文档中加一节：从 skill-writing-guide 派生的实操检查清单。

- [ ] **Step 3: commit**

```bash
git add docs/reference/robustness-guide.md
git commit -m "docs: 鲁棒性指导文档最终版——三波注意点完整沉淀"
```

---

### Task 17: 最终验证 + 构建

- [ ] **Step 1: 全量测试**

```bash
npx vitest run
```

- [ ] **Step 2: Build**

```bash
npm run build
```

- [ ] **Step 3: aldev 手动验证**

```bash
node /Users/wenqiu/AIAgent/alloy/dist/cli/index.js --version
```

- [ ] **Step 4: commit 最终调整**

如有任何问题，在此修复并提交。

---

## 合并回 main

所有 task 完成后：

```bash
git checkout main
git merge --squash refactor/robustness-optimization
git commit -m "feat: Alloy 鲁棒性全面优化——代码 bug 全修 + skill 弱模型优化 + 一致性对齐"
```
