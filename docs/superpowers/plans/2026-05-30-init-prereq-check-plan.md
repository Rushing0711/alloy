# init 安装复用——预检逻辑统一 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 health.ts 中 OpenSpec/Superpowers 检测逻辑提取为可导出函数，让 init 安装前检测已有依赖，满足版本要求则跳过安装

**Architecture:** 在 health.ts 中提取 `checkOpenSpec()` 和 `checkSuperpowers()` 两个导出函数；`runHealthCheck()` 内部调用它们保持不变；`openspec.ts` 和 `superpowers.ts` 的安装函数调用它们决定安装/跳过

**Tech Stack:** TypeScript (Node.js ≥ 18), vitest, yaml, semver

---

## 文件结构总览

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/core/types.ts` | 修改 | 新增 DepCheckResult 类型 |
| `src/core/health.ts` | 修改 | 提取导出 checkOpenSpec() / checkSuperpowers() |
| `src/core/openspec.ts` | 修改 | installOpenSpecCli 安装前调用 checkOpenSpec |
| `src/core/superpowers.ts` | 修改 | installSuperpowers 安装前调用 checkSuperpowers |
| `test/core/health.test.ts` | 修改 | 新增 checkOpenSpec / checkSuperpowers 单元测试 |

---

### Task 1: types.ts 新增 DepCheckResult 类型

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: 添加 DepCheckResult 接口**

在 `src/core/types.ts` 的 `HealthCheckResult` 之后（第 33 行之后）添加：

```typescript
export interface DepCheckResult {
  installed: boolean;
  version?: string;
  compatible: boolean;
}
```

位置：放在 `HealthCheckResult` 和 `AlloyState` 之间。

- [ ] **Step 2: 验证类型编译**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat: types.ts 新增 DepCheckResult 依赖检测结果类型

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: health.ts 提取 checkOpenSpec / checkSuperpowers

**Files:**
- Modify: `src/core/health.ts`

- [ ] **Step 1: 在 health.ts 中新增两个导出函数**

在 `EXPECTED_SKILLS` 常量之后、`runHealthCheck` 之前插入：

```typescript
/**
 * 检测 OpenSpec CLI 是否安装且版本兼容。
 * 供 doctor 和 init 的安装前检测复用。
 */
export function checkOpenSpec(requiredRange: string): DepCheckResult {
  try {
    const version = execSync("openspec --version", { stdio: "pipe" })
      .toString()
      .trim();
    return {
      installed: true,
      version,
      compatible: semver.satisfies(version, requiredRange),
    };
  } catch {
    return { installed: false, compatible: false };
  }
}

/**
 * 检测 Superpowers 是否安装且版本兼容。
 * 优先检查 Claude Code 插件（~/.claude/plugins/installed_plugins.json），
 * fallback 到 npx skills list。
 * 供 doctor 和 init 的安装前检测复用。
 */
export async function checkSuperpowers(requiredRange: string): Promise<DepCheckResult> {
  const KEY_SKILLS = ["brainstorming", "using-git-worktrees"];

  // 1. 检查 Claude Code 插件
  try {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    const pluginsJsonPath = join(home, ".claude", "plugins", "installed_plugins.json");
    const pluginsRaw = await readFile(pluginsJsonPath, "utf-8");
    const plugins = JSON.parse(pluginsRaw);
    const sp = plugins?.plugins?.["superpowers@claude-plugins-official"];
    if (sp && sp.length > 0) {
      return {
        installed: true,
        version: sp[0].version,
        compatible: semver.satisfies(sp[0].version, requiredRange),
      };
    }
  } catch {
    // 插件文件不存在或无 superpowers 条目，继续 fallback
  }

  // 2. fallback: npx skills list
  try {
    const output = execSync("npx skills list", { stdio: "pipe" }).toString();
    if (output.includes("brainstorming") && output.includes("using-git-worktrees")) {
      return { installed: true, compatible: true };
    }
  } catch {
    // 未安装
  }

  return { installed: false, compatible: false };
}
```

需要在顶部添加 import：
```typescript
import type { DepCheckResult, HealthCheckResult } from "./types.js";
```

- [ ] **Step 2: 重构 runHealthCheck 内部使用新函数**

将第 2 项（OpenSpec 检查，第 47-67 行）替换为调用 `checkOpenSpec`：

```typescript
  // 2. OpenSpec
  const osCheck = checkOpenSpec(config.compatible.openspec);
  if (osCheck.installed) {
    results.push({
      name: "OpenSpec",
      current: osCheck.version!,
      required: config.compatible.openspec,
      status: osCheck.compatible ? "pass" : "warn",
    });
  } else {
    results.push({
      name: "OpenSpec",
      current: "未安装",
      required: config.compatible.openspec,
      status: "fail",
    });
  }
```

将第 3 项（Superpowers 检查，第 69-117 行）替换为调用 `checkSuperpowers`：

```typescript
  // 3. Superpowers
  const spCheck = await checkSuperpowers(config.compatible.superpowers);
  if (spCheck.installed) {
    const versionInfo = spCheck.version ? ` v${spCheck.version}` : "";
    results.push({
      name: "Superpowers",
      current: `已安装${versionInfo}`,
      required: config.compatible.superpowers,
      status: spCheck.compatible ? "pass" : "warn",
    });
  } else {
    results.push({
      name: "Superpowers",
      current: "未安装",
      required: config.compatible.superpowers,
      status: "fail",
    });
  }
```

同时移除 `checkSuperpowers` 已被提取出去的 `KEY_SKILLS` 变量和重复逻辑。

- [ ] **Step 3: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: 运行现有测试确认无回归**

Run: `npx vitest run test/core/health.test.ts`
Expected: 9 tests PASS（现有测试不依赖实现细节，mock 了整个 runHealthCheck 外部依赖）

实际需要确认测试仍通过——因为 `checkSuperpowers` 现在是 async 导出函数，但 `runHealthCheck` 内部调用方式变了。

- [ ] **Step 5: Commit**

```bash
git add src/core/health.ts
git commit -m "refactor: health.ts 提取 checkOpenSpec/checkSuperpowers 导出函数

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: health.test.ts 新增导出函数测试

**Files:**
- Modify: `test/core/health.test.ts`

- [ ] **Step 1: 添加 checkOpenSpec 和 checkSuperpowers 测试**

在 test 文件末尾的 `});` 之前（即第 263 行之前），新增以下测试用例。注意 `checkOpenSpec` 是同步函数，`checkSuperpowers` 是异步函数。

在现有 import 中新增导入：
```typescript
import { runHealthCheck, checkOpenSpec, checkSuperpowers } from "../../src/core/health.js";
```

然后在 describe 块的闭合 `});` 之前添加：

```typescript

describe("checkOpenSpec", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("已安装且版本兼容时返回 installed=true compatible=true", () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);

    const result = checkOpenSpec(">=1.3.0 <2.0.0");
    expect(result.installed).toBe(true);
    expect(result.version).toBe("1.3.1");
    expect(result.compatible).toBe(true);
  });

  it("已安装但版本不兼容时返回 compatible=false", () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.2.0\n") as any);

    const result = checkOpenSpec(">=1.3.0 <2.0.0");
    expect(result.installed).toBe(true);
    expect(result.compatible).toBe(false);
  });

  it("未安装时返回 installed=false", () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("not found");
    });

    const result = checkOpenSpec(">=1.3.0 <2.0.0");
    expect(result.installed).toBe(false);
    expect(result.compatible).toBe(false);
  });
});

describe("checkSuperpowers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Claude 插件已安装且版本兼容时返回 installed=true", async () => {
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        plugins: {
          "superpowers@claude-plugins-official": [{ version: "5.1.0" }],
        },
      })
    );

    const result = await checkSuperpowers(">=5.0.0 <6.0.0");
    expect(result.installed).toBe(true);
    expect(result.version).toBe("5.1.0");
    expect(result.compatible).toBe(true);
  });

  it("Claude 插件版本不兼容时返回 compatible=false", async () => {
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        plugins: {
          "superpowers@claude-plugins-official": [{ version: "4.0.0" }],
        },
      })
    );

    const result = await checkSuperpowers(">=5.0.0 <6.0.0");
    expect(result.installed).toBe(true);
    expect(result.compatible).toBe(false);
  });

  it("插件文件不存在时 fallback 到 npx skills list", async () => {
    // readFile 抛异常（文件不存在）
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
    // execSync 返回含关键 skill 的输出
    vi.mocked(execSync).mockReturnValue(
      Buffer.from("brainstorming\nusing-git-worktrees\ntdd\n") as any
    );

    const result = await checkSuperpowers(">=5.0.0 <6.0.0");
    expect(result.installed).toBe(true);
    expect(result.compatible).toBe(true);
  });

  it("均未安装时返回 installed=false", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("not found");
    });

    const result = await checkSuperpowers(">=5.0.0 <6.0.0");
    expect(result.installed).toBe(false);
    expect(result.compatible).toBe(false);
  });
});
```

- [ ] **Step 2: 运行新测试确认通过**

Run: `npx vitest run test/core/health.test.ts`
Expected: 新增 7 tests + 原有 9 tests = 16 tests PASS

- [ ] **Step 3: Commit**

```bash
git add test/core/health.test.ts
git commit -m "test: checkOpenSpec/checkSuperpowers 导出函数——7 个测试覆盖

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: openspec.ts 安装前检测

**Files:**
- Modify: `src/core/openspec.ts`

- [ ] **Step 1: 修改 installOpenSpecCli 使用 checkOpenSpec 检测**

当前 `installOpenSpecCli` (第 33-51 行)：
- 第 1 步：`execSync("openspec --version")` → 只查存在性，不查版本
- 第 2 步：`npm install -g` 安装

改为调用 `checkOpenSpec()` + `loadCompat()` 进行完整版本检测：

```typescript
import { checkOpenSpec } from "./health.js";
import { loadCompat } from "./compat.js";
import { getPackageRoot } from "../utils/fs.js";
```

替换整个 `installOpenSpecCli` 函数：

```typescript
export async function installOpenSpecCli(): Promise<"installed" | "skipped" | "failed"> {
  const packageDir = getPackageRoot();
  const config = await loadCompat(packageDir);
  const dep = checkOpenSpec(config.compatible.openspec);

  if (dep.installed && dep.compatible) {
    console.log(`     ✓ OpenSpec CLI ${dep.version} 已安装，跳过`);
    return "skipped";
  }

  if (dep.installed && !dep.compatible) {
    console.log(
      `     ⚠ OpenSpec ${dep.version} 不满足要求 ${config.compatible.openspec}，重新安装...`
    );
  }

  try {
    execSync("npm install -g @fission-ai/openspec@1", {
      stdio: "pipe",
      cwd: process.cwd(),
    });
    return "installed";
  } catch {
    return "failed";
  }
}
```

注意：`loadCompat` 需要 `await`，所以函数已经是 `async`。原来的 `console.log("     ✓ OpenSpec CLI 已安装，跳过")` 移到新的检测逻辑中。

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/core/openspec.ts
git commit -m "feat: installOpenSpecCli 安装前版本检测——兼容则复用

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: superpowers.ts 安装前检测

**Files:**
- Modify: `src/core/superpowers.ts`

- [ ] **Step 1: 修改 installSuperpowers 使用 checkSuperpowers 检测**

当前 `installSuperpowers`：
- 第 1 步：`npx skills list` 检查是否存在
- 第 2 步：`npx skills add` 安装

改为调用 `checkSuperpowers()` + `loadCompat()` 进行完整版本检测：

```typescript
import { execSync } from "node:child_process";
import { checkSuperpowers } from "./health.js";
import { loadCompat } from "./compat.js";
import { getPackageRoot } from "../utils/fs.js";

export async function installSuperpowers(
  scope: "global" | "project"
): Promise<"installed" | "skipped" | "failed"> {
  const packageDir = getPackageRoot();
  const config = await loadCompat(packageDir);
  const dep = await checkSuperpowers(config.compatible.superpowers);

  if (dep.installed && dep.compatible) {
    const versionInfo = dep.version ? ` v${dep.version}` : "";
    console.log(`     ✓ Superpowers${versionInfo} 已安装，跳过`);
    return "skipped";
  }

  if (dep.installed && !dep.compatible) {
    const versionInfo = dep.version ? ` v${dep.version}` : "";
    console.log(
      `     ⚠ Superpowers${versionInfo} 不满足要求 ${config.compatible.superpowers}，重新安装...`
    );
  }

  const scopeFlag = scope === "global" ? "-g" : "";
  const flags = ["-y", scopeFlag, "--agent claude-code"].filter(Boolean).join(" ");

  try {
    execSync(`npx skills add obra/superpowers ${flags}`, {
      stdio: "pipe",
      cwd: process.cwd(),
    });
    return "installed";
  } catch {
    return "failed";
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/core/superpowers.ts
git commit -m "feat: installSuperpowers 安装前版本检测——兼容则复用

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 构建验证 + 端到端测试

**Files:** 无新建，验证所有改动

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: 约 62 tests PASS（原有 55 + 新增 7 = 62）

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 编译成功

- [ ] **Step 3: 端到端验证 alloy doctor**

```bash
node dist/cli/index.js doctor
```
Expected: 7 项检查全部 pass（OpenSpec 和 Superpowers 正确检测）

- [ ] **Step 4: 端到端验证 alloy init 跳过逻辑**

```bash
# 在已有完整安装的环境下运行 init
node dist/cli/index.js init --scope project
```
Expected: OpenSpec 和 Superpowers 显示"已安装，跳过"而非重新安装

- [ ] **Step 5: Commit（如有遗漏文件）**

```bash
git status
# 如有未提交的修改，add + commit
```

---

## 完成清单

- [ ] `src/core/types.ts` — 新增 DepCheckResult
- [ ] `src/core/health.ts` — 提取导出 checkOpenSpec / checkSuperpowers，重构内部
- [ ] `test/core/health.test.ts` — 新增 7 个导出函数测试
- [ ] `src/core/openspec.ts` — installOpenSpecCli 调用 checkOpenSpec
- [ ] `src/core/superpowers.ts` — installSuperpowers 调用 checkSuperpowers
- [ ] `npm run build` — 构建成功
- [ ] `npx vitest run` — 约 62 tests PASS
- [ ] 端到端：`alloy doctor` 正确检测 + `alloy init` 正确跳过
