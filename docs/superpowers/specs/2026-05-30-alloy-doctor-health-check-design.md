# Alloy Doctor 健康检查增强 + PowerShell 补全

> **目标读者：** 人类开发者
> **状态：** 已确认
> **关联计划：** 待生成

## 目标

增强 `alloy doctor` 的诊断能力（补充 Node.js 版本、schema_version、skill 完整性等检查），`alloy init` 同步受益。同时补齐 PowerShell 补全，实现 Windows 一等支持。

不涉及斜杠命令命名（`/alloy-start` → `/alloy:start`），那是第二阶段。

---

## 一、架构

```
src/core/
  compat.ts          → 精简：只负责加载 compat.yaml 配置（保留 loadCompat）
  health.ts          → 新增：所有健康检查的编排和执行
  types.ts           → 新增 HealthCheckResult 类型，扩展 CompatConfig

compat.yaml          → 新增 node / alloy / schema 字段
```

**health.ts 负责的检查项：**

| 检查项 | 数据来源 | 检查方式 |
|--------|----------|----------|
| Node.js 版本 | `process.version` | 与 `compat.yaml` node range 对比 |
| OpenSpec 版本 | `openspec --version` | 与 openspec range 对比 |
| Superpowers | `npx skills list` | 检查输出含关键 skill |
| Alloy 版本 | `package.json` version | 对比 compat.yaml alloy range |
| Schema 版本 | `openspec/config.yaml` | 对比 compat.yaml schema |
| Skill 完整性 | 文件系统 | 9 个 skill 目录是否完整 |
| 环境检测 | detect.ts | git / Claude Code 存在性 |

**调用方：**
- `alloy init` 第 8 步：将 `loadCompat()` + `checkCompat()` 替换为 `runHealthCheck()`
- `alloy doctor`：调用 `runHealthCheck()` + 现有文件一致性检查

---

## 二、配置结构

### compat.yaml（扩展后）

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

### types.ts（新增）

```typescript
export interface HealthCheckResult {
  name: string;           // "Node.js" | "OpenSpec" | "Superpowers" | "Alloy" | "Schema" | "Skills" | "Environment"
  status: "pass" | "warn" | "fail";
  current: string;        // 当前版本/状态
  required: string;       // 要求版本/约束
  message?: string;       // 额外说明（warn/fail 时填充）
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
```

`HealthCheckResult` 替代现有 `CompatResult`（boolean `compatible` → 三态 `pass/warn/fail`）。

---

## 三、health.ts 检查逻辑

### 函数签名

```typescript
export async function runHealthCheck(
  packageDir: string,
  projectPath: string
): Promise<HealthCheckResult[]>
```

### 各检查实现

| # | 检查项 | 实现 |
|---|--------|------|
| 1 | Node.js | `process.version.slice(1)` → `semver.satisfies(nodeVersion, config.compatible.node)` |
| 2 | OpenSpec | `execSync("openspec --version")` → `semver.satisfies(version, config.compatible.openspec)` |
| 3 | Superpowers | `execSync("npx skills list")` → 检查输出是否含关键 skill（brainstorming 等） |
| 4 | Alloy | `readFile(packageDir/package.json)` → parse version → 对比 `config.compatible.alloy` |
| 5 | Schema | 遍历活跃 changes：读 `.alloy.yaml` 的 `schema_version` 字段 → 与 `compat.yaml` schema 值对比 |
| 6 | Skills | 根据 scope 确定路径（project: `.claude/skills/`，global: `~/.claude/skills/`），检查 `alloy*` 目录是否完整（9 个目录名） |
| 7 | Env | 复用 `detectEnv()`（git / Claude Code 存在性） |

### 三态判定规则

| 状态 | 条件 |
|------|------|
| `pass` | 完全满足约束 |
| `warn` | 有风险但可用（如版本偏高但仍在 range 内、文件缺失个别非关键项） |
| `fail` | 不满足约束（版本过低、关键依赖缺失） |

---

## 四、集成变更

### `alloy doctor`（doctor.ts）

- 将 `loadCompat()` + `checkCompat()` 替换为 `runHealthCheck()`
- 保留文件一致性检查（worktree 路径验证）
- `formatDoctorResult()` 适配 `HealthCheckResult` 三态输出

输出格式：
```
健康检查：
  ✓ Node.js: v18.20.8（要求 >=18.0.0 <22.0.0）
  ✓ OpenSpec: 1.3.1（要求 >=1.3.0 <2.0.0）
  ✓ Superpowers: 已安装（要求 >=5.0.0 <6.0.0）
  ⚠ Alloy: v0.1.0（要求 >=0.1.0，请定期检查更新）
  ✓ Schema: version 1
  ✓ Skills: 9/9 目录完整
  ✓ Environment: git ✓  Claude Code ✓

文件一致性：✓ 无问题
```

### `alloy init`（init.ts）

- 第 8 步兼容性检查：替换为 `runHealthCheck()`
- 输出与 doctor 一致

### `compat.ts`

- 保留 `loadCompat()` 函数
- 移除 `checkCompat()`（迁移到 health.ts）
- 移除对 `semver` 和 `execSync` 的依赖（不再需要）

---

## 五、PowerShell 补全

### completion.ts 新增

```typescript
function powershellCompletion(): string
```

生成 PowerShell `Register-ArgumentCompleter` 脚本，命令和选项与 bash/zsh 补全保持一致。

### 自动检测

`generateCompletion()` 增加 PowerShell 检测：
```typescript
if (shell.includes("pwsh") || shell.includes("powershell")) return powershellCompletion();
```

---

## 六、测试覆盖

| 文件 | 测试重点 |
|------|----------|
| `test/core/health.test.ts` | 各项检查 pass/warn/fail 三态 |
| `test/cli/doctor.test.ts` | 输出格式适配 |
| `test/cli/completion.test.ts` | PowerShell 补全生成 |

---

## 七、不变的部分

- CLI 命令体系结构不变（init/status/doctor/update/completion 命令名不变）
- 内部命令（_state/_guard/_archive）不变
- Skill 文件不变（斜杠命令改名延后到第二阶段）
- OpenSpec schema 不变
