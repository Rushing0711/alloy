# Alloy Doctor 健康检查增强 + PowerShell 补全 + CLI 规范对齐 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强 alloy doctor 诊断能力（7 项健康检查），补齐 PowerShell 补全，对齐 CLI 选项规范（`-V`→`-v`, `strict:true`）

**Architecture:** 新建 `src/core/health.ts` 集中编排 7 项健康检查；`compat.ts` 精简为纯配置加载；`doctor.ts`/`init.ts` 统一调用 `runHealthCheck()`。`completion.ts` 新增 PowerShell 补全并修正 `-v` 短选项。

**Tech Stack:** TypeScript (Node.js ≥ 18), vitest, yaml (parseYaml), semver

---

## 文件结构总览

| 文件 | 操作 | 职责 |
|------|------|------|
| `compat.yaml` | 修改 | 新增 node/alloy/schema 兼容范围 |
| `src/core/types.ts` | 修改 | 新增 HealthCheckResult，扩展 CompatConfig |
| `src/core/health.ts` | **新建** | 7 项健康检查编排 |
| `src/core/compat.ts` | 修改 | 移除 checkCompat，只保留 loadCompat |
| `src/cli/commands/doctor.ts` | 修改 | 调用 runHealthCheck，适配新类型 |
| `src/cli/commands/init.ts` | 修改 | 第 8 步兼容性检查→runHealthCheck |
| `src/cli/commands/completion.ts` | 修改 | 新增 PowerShell 补全，修正确 -v 短选项 |
| `src/cli/index.ts` | 修改 | `-V`→`-v`，`strict:false`→`strict:true` |
| `test/core/health.test.ts` | **新建** | 健康检查模块单元测试 |
| `test/cli/doctor.test.ts` | **新建** | doctor 命令集成测试 |
| `test/cli/completion.test.ts` | **新建** | 补全生成测试 |

---

### Task 1: compat.yaml + types.ts 基础配置

**Files:**
- Modify: `compat.yaml`
- Modify: `src/core/types.ts`

- [ ] **Step 1: 扩展 compat.yaml**

在 `compatible` 部分新增 `node`、`alloy`、`schema` 三个字段：

```yaml
compatible:
  node: ">=18.0.0 <22.0.0"
  openspec: ">=1.3.0 <2.0.0"
  superpowers: ">=5.0.0 <6.0.0"
  alloy: ">=0.1.0"
  schema: 1

install:
  openspec: "@fission-ai/openspec@1"
  superpowers: "obra/superpowers@5"
```

- [ ] **Step 2: 更新 types.ts**

新增 `HealthCheckResult` 接口，扩展 `CompatConfig` 接口使其与 compat.yaml 的 `compatible` 字段一一对应。保留旧的 `CompatResult` 接口（在后续 task 中移除引用后删除）。

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
  compatible: {
    node: string;
    openspec: string;
    superpowers: string;
    alloy: string;
    schema: number;
  };
  install: {
    openspec: string;
    superpowers: string;
  };
}

export interface HealthCheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  current: string;
  required: string;
  message?: string;
}

/** @deprecated 迁移到 HealthCheckResult */
export interface CompatResult {
  name: string;
  current: string;
  required: string;
  compatible: boolean;
}

export interface AlloyState {
  phase: "started" | "planned" | "applied" | "archived" | "finished";
  worktree: string | null;
  schema_version: number;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: 验证类型编译**

Run: `npx tsc --noEmit`
Expected: 无类型错误（可能有 compat.ts 中 CompatResult 引用警告，Task 3 修复）

- [ ] **Step 4: Commit**

```bash
git add compat.yaml src/core/types.ts
git commit -m "feat: compat.yaml 扩展 + HealthCheckResult 类型定义

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: health.ts 健康检查模块

**Files:**
- Create: `src/core/health.ts`
- Create: `test/core/health.test.ts`

- [ ] **Step 1: 编写测试文件 test/core/health.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// mock 外部依赖
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));
vi.mock("./compat.js", () => ({
  loadCompat: vi.fn(),
}));
vi.mock("./detect.js", () => ({
  detectEnv: vi.fn(),
}));

import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { loadCompat } from "../../src/core/compat.js";
import { detectEnv } from "../../src/core/detect.js";
import { runHealthCheck } from "../../src/core/health.js";

const MOCK_CONFIG = {
  compatible: {
    node: ">=18.0.0 <22.0.0",
    openspec: ">=1.3.0 <2.0.0",
    superpowers: ">=5.0.0 <6.0.0",
    alloy: ">=0.1.0",
    schema: 1,
  },
  install: {
    openspec: "@fission-ai/openspec@1",
    superpowers: "obra/superpowers@5",
  },
};

describe("runHealthCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 7 项检查结果", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n"));
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });

    // mock skills 目录存在
    const fs = await import("node:fs");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    // mock readdir for skills check
    const fsp = await import("node:fs/promises");
    vi.spyOn(fsp, "readdir").mockResolvedValue([
      { name: "alloy", isDirectory: () => true },
      { name: "alloy-start", isDirectory: () => true },
      { name: "alloy-plan", isDirectory: () => true },
      { name: "alloy-apply", isDirectory: () => true },
      { name: "alloy-archive", isDirectory: () => true },
      { name: "alloy-discard", isDirectory: () => true },
      { name: "alloy-finish", isDirectory: () => true },
      { name: "alloy-fix", isDirectory: () => true },
      { name: "alloy-status", isDirectory: () => true },
    ] as any);

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    expect(results).toHaveLength(7);
  });

  it("Node.js 版本不满足约束时应返回 fail", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n"));
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "16.0.0", // 低于 >=18.0.0
      gitInstalled: true,
      claudeCodeInstalled: true,
    });

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const nodeResult = results.find((r) => r.name === "Node.js");
    expect(nodeResult).toBeDefined();
    expect(nodeResult!.status).toBe("fail");
  });

  it("Node.js 版本满足约束时应返回 pass", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n"));
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const nodeResult = results.find((r) => r.name === "Node.js");
    expect(nodeResult!.status).toBe("pass");
  });

  it("OpenSpec 未安装时应返回 fail", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === "openspec --version") throw new Error("not found");
      return Buffer.from("");
    });
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const osResult = results.find((r) => r.name === "OpenSpec");
    expect(osResult!.status).toBe("fail");
    expect(osResult!.current).toBe("未安装");
  });

  it("应检查环境（git + Claude Code）", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n"));
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: false,
      claudeCodeInstalled: true,
    });

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const envResult = results.find((r) => r.name === "Environment");
    expect(envResult).toBeDefined();
    expect(envResult!.status).toBe("warn");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/core/health.test.ts`
Expected: FAIL — `runHealthCheck` 尚未存在

- [ ] **Step 3: 实现 src/core/health.ts**

```typescript
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import semver from "semver";
import type { CompatConfig, HealthCheckResult } from "./types.js";
import { loadCompat } from "./compat.js";
import { detectEnv } from "./detect.js";

const EXPECTED_SKILLS = [
  "alloy",
  "alloy-start",
  "alloy-plan",
  "alloy-apply",
  "alloy-archive",
  "alloy-discard",
  "alloy-finish",
  "alloy-fix",
  "alloy-status",
];

export async function runHealthCheck(
  packageDir: string,
  projectPath: string
): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  const config = await loadCompat(packageDir);

  // 1. Node.js 版本
  const nodeVersion = process.version.slice(1);
  results.push({
    name: "Node.js",
    current: nodeVersion,
    required: config.compatible.node,
    status: semver.satisfies(nodeVersion, config.compatible.node) ? "pass" : "fail",
  });

  // 2. OpenSpec
  try {
    const version = execSync("openspec --version", { stdio: "pipe" })
      .toString()
      .trim();
    results.push({
      name: "OpenSpec",
      current: version,
      required: config.compatible.openspec,
      status: semver.satisfies(version, config.compatible.openspec)
        ? "pass"
        : "warn",
    });
  } catch {
    results.push({
      name: "OpenSpec",
      current: "未安装",
      required: config.compatible.openspec,
      status: "fail",
    });
  }

  // 3. Superpowers
  try {
    execSync("npx skills list", { stdio: "pipe" });
    results.push({
      name: "Superpowers",
      current: "已安装",
      required: config.compatible.superpowers,
      status: "pass",
    });
  } catch {
    results.push({
      name: "Superpowers",
      current: "未安装",
      required: config.compatible.superpowers,
      status: "fail",
    });
  }

  // 4. Alloy 自身版本
  try {
    const pkg = JSON.parse(
      await readFile(join(packageDir, "package.json"), "utf-8")
    );
    const version = pkg.version as string;
    results.push({
      name: "Alloy",
      current: version,
      required: config.compatible.alloy,
      status: semver.satisfies(version, config.compatible.alloy)
        ? "pass"
        : "warn",
    });
  } catch {
    results.push({
      name: "Alloy",
      current: "未知",
      required: config.compatible.alloy,
      status: "fail",
    });
  }

  // 5. Schema 版本 — 检查活跃 changes 的 schema_version
  try {
    const changesDir = join(projectPath, "openspec", "changes");
    const schemaStatus = await checkSchemaVersions(
      changesDir,
      config.compatible.schema
    );
    results.push(schemaStatus);
  } catch {
    results.push({
      name: "Schema",
      current: "无法检测",
      required: String(config.compatible.schema),
      status: "warn",
      message: "openspec/changes/ 目录不存在或无法读取",
    });
  }

  // 6. Skill 文件完整性
  try {
    const skillsDir = join(projectPath, ".claude", "skills");
    const skillsStatus = checkSkillsIntegrity(skillsDir);
    results.push(skillsStatus);
  } catch {
    results.push({
      name: "Skills",
      current: "无法检测",
      required: `9 个目录 (${EXPECTED_SKILLS.join(", ")})`,
      status: "warn",
    });
  }

  // 7. 环境检测
  const env = detectEnv();
  const envOk = env.gitInstalled && env.claudeCodeInstalled;
  const envDetails: string[] = [];
  if (env.gitInstalled) envDetails.push("git ✓");
  else envDetails.push("git ✗");
  if (env.claudeCodeInstalled) envDetails.push("Claude Code ✓");
  else envDetails.push("Claude Code ✗");
  results.push({
    name: "Environment",
    current: envDetails.join("  "),
    required: "git + Claude Code",
    status: envOk ? "pass" : "warn",
  });

  return results;
}

async function checkSchemaVersions(
  changesDir: string,
  requiredVersion: number
): Promise<HealthCheckResult> {
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(changesDir, { withFileTypes: true });
    const mismatches: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const yaml = await import("yaml");
        const content = await readFile(
          join(changesDir, entry.name, ".alloy.yaml"),
          "utf-8"
        );
        const state = yaml.parse(content) as { schema_version?: number };
        if (state.schema_version !== undefined && state.schema_version !== requiredVersion) {
          mismatches.push(`${entry.name}=${state.schema_version}`);
        }
      } catch {
        // 跳过无 .alloy.yaml 的目录
      }
    }

    if (mismatches.length === 0) {
      return {
        name: "Schema",
        current: `version ${requiredVersion}`,
        required: String(requiredVersion),
        status: "pass",
      };
    }
    return {
      name: "Schema",
      current: mismatches.join(", "),
      required: String(requiredVersion),
      status: "warn",
      message: `以下 change 的 schema_version 不匹配: ${mismatches.join(", ")}`,
    };
  } catch {
    return {
      name: "Schema",
      current: "无 changes",
      required: String(requiredVersion),
      status: "pass",
      message: "没有活跃 change，跳过 schema_version 检查",
    };
  }
}

function checkSkillsIntegrity(skillsDir: string): HealthCheckResult {
  const missing: string[] = [];
  for (const name of EXPECTED_SKILLS) {
    if (!existsSync(join(skillsDir, name))) {
      missing.push(name);
    }
  }
  const found = EXPECTED_SKILLS.length - missing.length;
  if (missing.length === 0) {
    return {
      name: "Skills",
      current: `${found}/${EXPECTED_SKILLS.length} 目录完整`,
      required: `${EXPECTED_SKILLS.length} 个目录`,
      status: "pass",
    };
  }
  return {
    name: "Skills",
    current: `${found}/${EXPECTED_SKILLS.length}（缺失: ${missing.join(", ")}）`,
    required: `${EXPECTED_SKILLS.length} 个目录`,
    status: "fail",
    message: `缺失: ${missing.join(", ")}`,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/core/health.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/health.ts test/core/health.test.ts
git commit -m "feat: health.ts 健康检查模块——7 项检查统一编排

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 精简 compat.ts

**Files:**
- Modify: `src/core/compat.ts`

- [ ] **Step 1: 移除 checkCompat 函数**

`compat.ts` 现有 59 行，包含 `loadCompat` 和 `checkCompat`。移除 `checkCompat` 后只保留 `loadCompat`。

将 `src/core/compat.ts` 内容替换为：

```typescript
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { CompatConfig } from "./types.js";

export async function loadCompat(packageDir: string): Promise<CompatConfig> {
  const content = await readFile(join(packageDir, "compat.yaml"), "utf-8");
  return parseYaml(content) as CompatConfig;
}
```

- [ ] **Step 2: 验证编译和现有测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 编译通过，现有 42 个测试仍 PASS（health.test.ts 的 5 个也 PASS）

- [ ] **Step 3: Commit**

```bash
git add src/core/compat.ts
git commit -m "refactor: compat.ts 精简——移除 checkCompat，逻辑迁移到 health.ts

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: doctor.ts 集成 + 测试

**Files:**
- Modify: `src/cli/commands/doctor.ts`
- Create: `test/cli/doctor.test.ts`

- [ ] **Step 1: 编写测试文件 test/cli/doctor.test.ts**

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/core/health.js", () => ({
  runHealthCheck: vi.fn(),
}));

import { runHealthCheck } from "../../src/core/health.js";
import { doctorCommand, formatDoctorResult } from "../../src/cli/commands/doctor.js";
import type { HealthCheckResult } from "../../src/core/types.js";

describe("doctorCommand", () => {
  it("应返回 healthResults 和 consistencyWarnings", async () => {
    vi.mocked(runHealthCheck).mockResolvedValue([
      {
        name: "Node.js",
        status: "pass",
        current: "20.0.0",
        required: ">=18.0.0 <22.0.0",
      },
    ]);

    const result = await doctorCommand("/fake/project");
    expect(result.healthResults).toBeDefined();
    expect(result.healthResults).toHaveLength(1);
    expect(result.consistencyWarnings).toBeDefined();
  });
});

describe("formatDoctorResult", () => {
  it("应以文本格式输出 pass/warn/fail 三种状态", () => {
    const result = {
      healthResults: [
        {
          name: "Node.js",
          status: "pass" as const,
          current: "20.0.0",
          required: ">=18.0.0 <22.0.0",
        },
        {
          name: "OpenSpec",
          status: "fail" as const,
          current: "未安装",
          required: ">=1.3.0 <2.0.0",
        },
        {
          name: "Alloy",
          status: "warn" as const,
          current: "0.1.0",
          required: ">=0.1.0",
        },
      ],
      consistencyWarnings: [],
    };

    const output = formatDoctorResult(result, false);
    expect(output).toContain("✓");
    expect(output).toContain("✗");
    expect(output).toContain("⚠");
    expect(output).toContain("Node.js");
    expect(output).toContain("OpenSpec");
  });

  it("JSON 模式应输出有效 JSON", () => {
    const result = {
      healthResults: [] as HealthCheckResult[],
      consistencyWarnings: [],
    };

    const json = formatDoctorResult(result, true);
    const parsed = JSON.parse(json);
    expect(parsed.healthResults).toEqual([]);
    expect(parsed.consistencyWarnings).toEqual([]);
  });

  it("应显示文件一致性警告", () => {
    const result = {
      healthResults: [],
      consistencyWarnings: ["test-change: worktree 路径不可达"],
    };

    const output = formatDoctorResult(result, false);
    expect(output).toContain("test-change");
    expect(output).toContain("worktree");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/cli/doctor.test.ts`
Expected: FAIL — `healthResults` 属性尚未存在

- [ ] **Step 3: 修改 doctor.ts 集成 health.ts**

将 `src/cli/commands/doctor.ts` 修改为：

```typescript
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { runHealthCheck } from "../../core/health.js";
import type { HealthCheckResult } from "../../core/types.js";
import { findActiveChanges } from "../utils/state.js";

export interface DoctorResult {
  healthResults: HealthCheckResult[];
  consistencyWarnings: string[];
}

export async function doctorCommand(
  projectPath: string
): Promise<DoctorResult> {
  const packageDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    ".."
  );

  // 1. 健康检查
  const healthResults = await runHealthCheck(packageDir, projectPath);

  // 2. 文件一致性
  const consistencyWarnings: string[] = [];
  const changesDir = join(projectPath, "openspec", "changes");
  const changes = await findActiveChanges(changesDir);

  for (const [name, state] of changes) {
    const changePath = join(changesDir, name);
    if (state.worktree) {
      const worktreePath = join(projectPath, state.worktree);
      if (!existsSync(worktreePath)) {
        consistencyWarnings.push(
          `${name}: .alloy.yaml 声称 worktree 存在但路径不可达 (${state.worktree})`
        );
      }
    }
  }

  return { healthResults, consistencyWarnings };
}

export function formatDoctorResult(
  result: DoctorResult,
  useJson: boolean
): string {
  if (useJson) {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];

  lines.push("健康检查：");
  for (const r of result.healthResults) {
    const mark = r.status === "pass" ? "✓" : r.status === "warn" ? "⚠" : "✗";
    let line = `  ${mark} ${r.name}: ${r.current}（要求 ${r.required}）`;
    if (r.message) line += `\n     ↳ ${r.message}`;
    lines.push(line);
  }

  if (result.consistencyWarnings.length > 0) {
    lines.push("\n文件一致性：");
    for (const w of result.consistencyWarnings) {
      lines.push(`  ⚠ ${w}`);
    }
  } else {
    lines.push("\n文件一致性：✓ 无问题");
  }

  return lines.join("\n");
}
```

关键改动：
- `import { loadCompat, checkCompat }` → `import { runHealthCheck }`
- `compatResults: CompatResult[]` → `healthResults: HealthCheckResult[]`
- `formatDoctorResult` 中的 `r.compatible ? "✓" : "⚠️"` → `r.status === "pass" ? "✓" : r.status === "warn" ? "⚠" : "✗"`
- 新增 `r.message` 辅助信息输出

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/cli/doctor.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/doctor.ts test/cli/doctor.test.ts
git commit -m "feat: doctor.ts 集成 runHealthCheck——7 项健康检查 + 三态输出

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: init.ts 集成

**Files:**
- Modify: `src/cli/commands/init.ts`

- [ ] **Step 1: 修改 init.ts 第 8 步兼容性检查**

将 `src/cli/commands/init.ts` 第 107-118 行：

```typescript
  // 8. 兼容性检查
  console.log("\n  🩺 兼容性检查...");
  const packageDir = getPackageRoot();
  const config = await loadCompat(packageDir);
  const results = checkCompat(config);
  for (const r of results) {
    const mark = r.compatible ? "✓" : "⚠️";
    console.log(
      `     ${mark} ${r.name} ${r.current}（兼容范围 ${r.required}）`
    );
  }
```

替换为：

```typescript
  // 8. 健康检查
  console.log("\n  🩺 健康检查...");
  const packageDir = getPackageRoot();
  const results = await runHealthCheck(packageDir, opts.projectPath);
  for (const r of results) {
    const mark = r.status === "pass" ? "✓" : r.status === "warn" ? "⚠" : "✗";
    console.log(
      `     ${mark} ${r.name}: ${r.current}（要求 ${r.required}）`
    );
  }
```

同时更新顶部 import：
- 移除 `import { loadCompat, checkCompat } from "../../core/compat.js";`
- 添加 `import { runHealthCheck } from "../../core/health.js";`

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 编译通过

- [ ] **Step 3: 运行全量测试**

Run: `npx vitest run`
Expected: 所有测试 PASS（含新增的 health.test.ts 5 个 + doctor.test.ts 4 个 = 现有 42 个 + 9 个）

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/init.ts
git commit -m "feat: init.ts 兼容性检查→健康检查——调用 runHealthCheck

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: completion.ts PowerShell 补全 + -v 修正

**Files:**
- Modify: `src/cli/commands/completion.ts`
- Create: `test/cli/completion.test.ts`

- [ ] **Step 1: 编写测试文件 test/cli/completion.test.ts**

```typescript
import { describe, it, expect } from "vitest";
import { generateCompletion } from "../../src/cli/commands/completion.js";

describe("generateCompletion", () => {
  it("bash 补全应包含所有公开命令", () => {
    const output = generateCompletion("bash");
    expect(output).toContain("init");
    expect(output).toContain("status");
    expect(output).toContain("doctor");
    expect(output).toContain("update");
    expect(output).toContain("completion");
  });

  it("zsh 补全应包含 -v 短选项", () => {
    const output = generateCompletion("zsh");
    expect(output).toContain("{-v,--version}");
  });

  it("bash 补全应包含 -v 短选项", () => {
    const output = generateCompletion("bash");
    expect(output).toContain("--version");
    expect(output).toContain("-v");
  });

  it("应生成 PowerShell 补全", () => {
    const output = generateCompletion("pwsh");
    expect(output).toContain("Register-ArgumentCompleter");
    expect(output).toContain("-Alloy");
    expect(output).toContain("init");
    expect(output).toContain("status");
    expect(output).toContain("doctor");
    expect(output).toContain("update");
    expect(output).toContain("completion");
  });

  it("PowerShell 补全应包含各命令选项", () => {
    const output = generateCompletion("powershell");
    expect(output).toContain("--scope");
    expect(output).toContain("--json");
    expect(output).toContain("--inject-claude-md");
    expect(output).toContain("--version");
    expect(output).toContain("--help");
  });

  it("不包含内部命令", () => {
    const pwsh = generateCompletion("pwsh");
    expect(pwsh).not.toContain("_state");
    expect(pwsh).not.toContain("_guard");
    expect(pwsh).not.toContain("_archive");

    const bash = generateCompletion("bash");
    expect(bash).not.toContain("_state");
    expect(bash).not.toContain("_guard");
    expect(bash).not.toContain("_archive");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/cli/completion.test.ts`
Expected: FAIL — PowerShell 补全尚未实现，`-v` 短选项尚未添加

- [ ] **Step 3: 修改 completion.ts**

将 `src/cli/commands/completion.ts` 修改为：

```typescript
export function generateCompletion(shell: string): string {
  if (shell.includes("zsh")) return zshCompletion();
  if (shell.includes("pwsh") || shell.includes("powershell"))
    return powershellCompletion();
  return bashCompletion();
}

function bashCompletion(): string {
  return [
    "# alloy bash completion — 添加到 ~/.bashrc 或 ~/.bash_profile:",
    "#   source <(alloy completion bash)",
    "",
    "_alloy_completion() {",
    '  local cur="${COMP_WORDS[COMP_CWORD]}"',
    "",
    "  if [ \"$COMP_CWORD\" -eq 1 ]; then",
    '    COMPREPLY=($(compgen -W "-v --version -h --help init status doctor update completion" -- "$cur"))',
    "    return 0",
    "  fi",
    "",
    '  case "${COMP_WORDS[1]}" in',
    "    init)",
    '      COMPREPLY=($(compgen -W "--scope --inject-claude-md --help -h" -- "$cur"))',
    "      ;;",
    "    status|doctor)",
    '      COMPREPLY=($(compgen -W "--json --help -h" -- "$cur"))',
    "      ;;",
    "    update)",
    '      COMPREPLY=($(compgen -W "--help -h" -- "$cur"))',
    "      ;;",
    "    completion)",
    '      COMPREPLY=($(compgen -W "bash zsh pwsh powershell" -- "$cur"))',
    "      ;;",
    "  esac",
    "}",
    "",
    "complete -F _alloy_completion alloy",
    "",
  ].join("\n");
}

function zshCompletion(): string {
  return [
    "# alloy zsh completion — 添加到 ~/.zshrc:",
    "#   source <(alloy completion zsh)",
    "",
    "#compdef alloy",
    "",
    "_alloy_commands() {",
    "  local -a cmds",
    "  cmds=(",
    "    'init:项目初始化——检测环境 → 安装依赖 → 部署 schema + skill'",
    "    'status:查看所有活跃 change 总览'",
    "    'doctor:诊断——版本兼容性、文件一致性'",
    "    'update:更新 Alloy skill 文件到最新版'",
    "    'completion:生成 shell 补全脚本'",
    "  )",
    "  _describe 'command' cmds",
    "}",
    "",
    "_alloy() {",
    "  local context state state_descr line",
    "  typeset -A opt_args",
    "",
    "  _arguments -C \\",
    "    '{-v,--version}[显示版本号]' \\",
    "    '{-h,--help}[显示帮助]' \\",
    "    '1: :_alloy_commands' \\",
    "    '*:: :->args'",
    "",
    "  case $state in",
    "    args)",
    "      case $words[1] in",
    "        init)",
    "          _arguments \\",
    "            '--scope[安装范围]:scope:(project global)' \\",
    "            '--inject-claude-md[注入 CLAUDE.md]' \\",
    "            '{-h,--help}[显示帮助]'",
    "          ;;",
    "        status|doctor)",
    "          _arguments \\",
    "            '--json[JSON 格式输出]' \\",
    "            '{-h,--help}[显示帮助]'",
    "          ;;",
    "        update|completion)",
    "          _arguments \\",
    "            '{-h,--help}[显示帮助]'",
    "          ;;",
    "      esac",
    "      ;;",
    "  esac",
    "}",
    "",
    "_alloy",
    "",
  ].join("\n");
}

function powershellCompletion(): string {
  return [
    "# alloy PowerShell completion",
    "# 添加到 PowerShell profile:",
    "#   Add-Content -Path $PROFILE -Value '. <path>/alloy.ps1'",
    "# 或安装到系统:",
    "#   alloy completion pwsh | Out-File -FilePath $PROFILE -Append",
    "",
    "Register-ArgumentCompleter -Native -CommandName alloy -ScriptBlock {",
    "  param($wordToComplete, $commandAst, $cursorPosition)",
    "",
    "  $commands = @('init', 'status', 'doctor', 'update', 'completion')",
    "  $globalOpts = @('--version', '-v', '--help', '-h')",
    "",
    "  # 解析当前输入的命令和位置参数",
    "  $tokens = $commandAst.CommandElements",
    "  $command = $null",
    "  $prev = ''",
    "",
    "  foreach ($token in $tokens) {",
    "    $value = $token.Value",
    "    if ($value -in $commands) {",
    "      $command = $value",
    "    }",
    "    $prev = $value",
    "  }",
    "",
    "  # 没有子命令 → 补全命令名或全局选项",
    "  if (-not $command) {",
    "    $completionText = @()",
    "    foreach ($cmd in $commands) {",
    '      if ($cmd -like "$wordToComplete*") { $completionText += $cmd }',
    "    }",
    "    foreach ($opt in $globalOpts) {",
    '      if ($opt -like "$wordToComplete*") { $completionText += $opt }',
    "    }",
    "    $completionText | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }",
    "    return",
    "  }",
    "",
    "  # 根据子命令提供选项",
    "  $opts = @()",
    "  switch ($command) {",
    "    'init'    { $opts = @('--scope', '--inject-claude-md', '--help', '-h') }",
    "    'status'  { $opts = @('--json', '--help', '-h') }",
    "    'doctor'  { $opts = @('--json', '--help', '-h') }",
    "    'update'  { $opts = @('--help', '-h') }",
    "    'completion' { $opts = @('bash', 'zsh', 'pwsh', 'powershell', '--help', '-h') }",
    "  }",
    "",
    "  $opts | Where-Object { $_ -like \"$wordToComplete*\" } | ForEach-Object {",
    "    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)",
    "  }",
    "}",
    "",
  ].join("\n");
}
```

关键改动：
- `generateCompletion` 新增 PowerShell 检测分支
- `bashCompletion` 第 1 个参数补全列表新增 `-v --version -h --help`
- `zshCompletion` 的 `--version` → `{-v,--version}`
- 新增 `powershellCompletion()` 函数，使用 `Register-ArgumentCompleter`
- 所有 shell 补全不包含 `_state` / `_guard` / `_archive` 内部命令

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/cli/completion.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/completion.ts test/cli/completion.test.ts
git commit -m "feat: PowerShell 补全 + -v 短选项修正——Windows 一等支持

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: index.ts CLI 选项规范对齐

**Files:**
- Modify: `src/cli/index.ts`

- [ ] **Step 1: 修改 ' -V' → ' -v'，strict: false → strict: true**

需要改 6 处：

**1) Line 30 — USAGE 文本：**
```diff
-  --version, -V  版本号
+  --version, -v  版本号
```

**2) Line 92 — isVersion 检测：**
```diff
- const isVersion = (a: string[]) => a.includes("--version") || a.includes("-V");
+ const isVersion = (a: string[]) => a.includes("--version") || a.includes("-v");
```

**3) Lines 128-131 — init 命令 parseArgs：**
```diff
- const { values, positionals } = parseArgs({
-   args: restArgs,
-   options: {
-     scope: { type: "string" },
-     "inject-claude-md": { type: "boolean", default: false },
-   },
-   strict: false,
-   allowPositionals: true,
- });
+ const { values, positionals } = parseArgs({
+   args: restArgs,
+   options: {
+     scope: { type: "string" },
+     "inject-claude-md": { type: "boolean", default: false },
+   },
+   strict: true,
+   allowPositionals: true,
+ });
```

**4) Lines 144-148 — status 命令 parseArgs：**
```diff
- const { positionals } = parseArgs({
-   args: restArgs,
-   options: { json: { type: "boolean", default: false } },
-   strict: false,
-   allowPositionals: true,
- });
+ const { positionals } = parseArgs({
+   args: restArgs,
+   options: { json: { type: "boolean", default: false } },
+   strict: true,
+   allowPositionals: true,
+ });
```

**5) Lines 173-177 — doctor 命令 parseArgs：**
```diff
- const { positionals } = parseArgs({
-   args: restArgs,
-   options: { json: { type: "boolean", default: false } },
-   strict: false,
-   allowPositionals: true,
- });
+ const { positionals } = parseArgs({
+   args: restArgs,
+   options: { json: { type: "boolean", default: false } },
+   strict: true,
+   allowPositionals: true,
+ });
```

**6) Lines 185-189 — update 命令 parseArgs：**
```diff
- const { positionals } = parseArgs({
-   args: restArgs,
-   options: {},
-   strict: false,
-   allowPositionals: true,
- });
+ const { positionals } = parseArgs({
+   args: restArgs,
+   options: {},
+   strict: true,
+   allowPositionals: true,
+ });
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 编译通过

- [ ] **Step 3: 手动验证选项行为**

Run: `npx vitest run`
Expected: 全部测试 PASS

- [ ] **Step 4: 构建并验证 alloy -v 输出**

```bash
npm run build
node dist/cli/index.js -v
```
Expected: 输出 `alloy vX.X.X`

- [ ] **Step 5: 验证 strict:true 行为**

```bash
node dist/cli/index.js init --unknown-flag
```
Expected: 报错（之前 strict:false 会静默忽略）

- [ ] **Step 6: Commit**

```bash
git add src/cli/index.ts
git commit -m "fix: CLI 选项规范对齐——-V→-v, strict:false→strict:true

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: 构建验证 + 端到端测试

**Files:** 无新建，验证所有改动

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: 全部 PASS（42 个现有 + 5 health + 4 doctor + 6 completion = 57 个测试）

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 编译成功，无错误

- [ ] **Step 3: 端到端验证 alloy doctor**

```bash
node dist/cli/index.js doctor
```
Expected: 输出 7 项健康检查结果

```bash
node dist/cli/index.js doctor --json | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'healthResults' in d; print(f'OK: {len(d[\"healthResults\"])} checks')"
```
Expected: `OK: 7 checks`

- [ ] **Step 4: 端到端验证 alloy completion**

```bash
node dist/cli/index.js completion bash | head -5
node dist/cli/index.js completion zsh | grep -- '-v'
node dist/cli/index.js completion pwsh | grep 'Register-ArgumentCompleter'
```
Expected: 三种 shell 均生成正确补全

- [ ] **Step 5: 端到端验证 alloy -v（非 -V）**

```bash
node dist/cli/index.js -v
node dist/cli/index.js --version
node dist/cli/index.js -V 2>&1  # 预期报错（未知选项）
```
Expected: `-v` 和 `--version` 输出正常，`-V` 报错

- [ ] **Step 6: Commit（如有遗漏文件）**

```bash
git status
# 如有未提交的修改，add + commit
```

---

## 完成清单

- [ ] `compat.yaml` — 新增 node/alloy/schema
- [ ] `src/core/types.ts` — 新增 HealthCheckResult，扩展 CompatConfig
- [ ] `src/core/health.ts` — 新建，7 项健康检查
- [ ] `test/core/health.test.ts` — 新建，5 个测试
- [ ] `src/core/compat.ts` — 移除 checkCompat
- [ ] `src/cli/commands/doctor.ts` — 集成 runHealthCheck，三态输出
- [ ] `test/cli/doctor.test.ts` — 新建，4 个测试
- [ ] `src/cli/commands/init.ts` — 第 8 步替换为 runHealthCheck
- [ ] `src/cli/commands/completion.ts` — PowerShell + -v 修正
- [ ] `test/cli/completion.test.ts` — 新建，6 个测试
- [ ] `src/cli/index.ts` — -V→-v，4× strict:true
- [ ] `npm run build` — 构建成功
- [ ] `npx vitest run` — 约 57 个测试全 PASS
