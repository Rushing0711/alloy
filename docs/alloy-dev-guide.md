# Alloy 开发者执行手册

> **目标读者：** 人类开发者（不是给 Agent 的——Agent 的约束在 [CLAUDE.md](../CLAUDE.md)）
> **职责：** 如何构建、测试、调试 Alloy CLI 和 Skill 本身。
> **不放入：** 产品规格 → 见 [alloy-design.md](alloy-design.md)；设计背景 → 见 [project-background.md](project-background.md)；Skill 编写规范 → 见 [skill-writing-guide.md](skill-writing-guide.md)。

Alloy 项目的构建、测试、调试约定和踩坑记录。

**前置阅读：** 动手前先读完 `alloy-design.md`（了解 Alloy 是什么）、`openspec-vs-superpowers.md` + `workflow-design.md`（了解设计推导）。

---

## 一、构建与测试

### 常规命令

```bash
npm run build        # tsc 编译 → dist/ + chmod +x dist/cli/index.js
npm run dev          # tsc --watch 开发模式
npm test             # vitest run（一次性运行全部 TypeScript 测试）
npm run test:watch   # vitest 交互式 watch 模式
```

### 运行单个测试

```bash
# TypeScript — vitest
npx vitest run test/cli/state.test.ts

# Shell — bats
bats test/shell/alloy-guard.bats
bats test/shell/alloy-state.bats
bats test/shell/alloy-archive.bats

# 运行全部（shell + TypeScript）
bats test/shell/*.bats && npm test
```

### 本地调试（其他项目验证）

```bash
# 在 Alloy 项目目录
npm link                           # 创建全局 symlink
npm run build                      # 编译

# 在新项目目录
cd ~/your-test-project
alloy init --scope project         # 初始化
/alloy-start <topic>               # Claude Code 中测试
```

---

## 二、代码约定

### Shell 脚本

| 规则 | 说明 | 踩坑 |
|------|------|------|
| 兼容 bash 3.2 | macOS 默认 bash 3.2，禁用 `declare -A`（关联数组）、`shopt -s lastpipe` 等 bash 4+ 特性 | [`9feb958`] guard.sh 用了 `declare -A`，macOS 报 `invalid option` |
| sed 分隔符用 `#` | `s/pattern/replacement/` 中的 `/` 会与路径值冲突。写入含 `/` 的值（如 `worktree: .worktrees/web-tetris`）时 sed 报错 | [`ee195e2`] state.sh 写 worktree 路径时 sed 报 `No such file` |
| 用 `alloy-state.sh` 读写 `.alloy.yaml` | Agent 不直接编辑 YAML，统一通过脚本操作，保证格式一致 | — |
| 阶段转换用 `alloy-guard.sh` | 校验 phase 转换合法性 + 制品完整性 + 更新 phase | — |
| shebang: `#!/usr/bin/env bash` | 可移植，不硬编码 `/bin/bash` 路径 | — |

### TypeScript

| 规则 | 说明 |
|------|------|
| Node.js ≥ 22 | 使用 `import.meta.dirname`、`parseArgs` 等 ES2024 特性 |
| ESM 模块 | `"type": "module"`，import 用 `.js` 后缀 |
| `execSync` 用 `pipe` | 捕获输出静默运行，错误通过 try/catch 处理 |
| 类型统一放 `core/types.ts` | 避免 `AlloyState` 重复定义这种技术债 |

---

## 三、测试约定

### Shell (bats)

```bash
#!/usr/bin/env bats
# 文件: test/shell/<script-name>.bats

setup() {
  TEST_DIR="$(mktemp -d)"          # 隔离临时目录
  # 准备 fixture ...
  SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)/skills/alloy/scripts/<script>.sh"
}

teardown() {
  rm -rf "$TEST_DIR"              # 每次测试完清理
}

@test "descriptive English name" {  # ⚠️ 必须 ASCII，bats 不支持中文测试名
  run bash "$SCRIPT" args...
  [ "$status" -eq 0 ]             # exit code
  [[ "$output" == *"expected"* ]] # stdout 匹配
}
```

**命名规范：** `should X when Y` 或 `X-Y does Z` 模式。如：
- `started->planned passes with all artifacts`
- `started->applied is rejected (skip planned)`

### TypeScript (vitest)

```typescript
// mock node 内置模块用 vi.mock
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

// 在 vi.mock 之后再 import 被测试的模块
import { execSync } from "node:child_process";
import { myFunction } from "../../src/core/my-module.js";

describe("myFunction", () => {
  it("should ...", () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("output\n") as any);
    // ...
  });
});
```

**关键：** ESM 模式下 `vi.mock` 必须在 import 之前声明，不能用 `vi.spyOn(require(...))`。

### 测试覆盖优先级

1. **Shell 脚本**（确定性逻辑，最易改坏）→ bats
2. **Core 模块**（纯函数，可 mock 外部依赖）→ vitest
3. **CLI 命令**（集成度高，依赖真实环境）→ vitest + 集成测试

---

## 四、Schema 修改流程

`openspec/schemas/alloy/schema.yaml` 是 OpenSpec 加载的工作流定义。

**修改后的验证步骤：**

1. 编辑 `schema.yaml`
2. 运行 `openspec schemas` 验证加载成功
3. 如有现有 change，运行 `openspec status --change <name>` 验证制品状态正常
4. 运行 `openspec instructions <artifact> --change <name>` 验证模板路径

**已知校验规则：**

| 字段 | 要求 |
|------|------|
| `version` | number，非 string |
| `artifacts[].description` | 必填 string |
| `artifacts[].template` | 相对路径，不含 `templates/` 前缀 |
| `artifacts[].instruction` | 相对路径，不含 `instructions/` 前缀 |
| `apply.requires` | 必填 array，至少 1 项 |

---

## 五、部署流程

`alloy init` 部署顺序（`src/cli/commands/init.ts`）：

```
1. detectEnv()        → 环境检测（Node/git/Claude Code）
2. installOpenSpecCli() → npm install -g @fission-ai/openspec@1
3. initOpenSpecProject() → openspec init <path> --tools claude
4. installSuperpowers() → npx skills add obra/superpowers@5
5. deploySkills()     → 复制 skills/alloy-*/ 到 .claude/skills/
6. deploySchema()     → 复制 openspec/schemas/alloy/ + 写 config.yaml
7. ensureGitignore()  → 追加 .worktrees/ worktrees/
8. injectClaudeMd()   → 可选（--inject-claude-md）
9. checkCompat()      → 版本兼容性诊断
```

**部署文件对应关系：**

| 源（包内） | 目标（用户项目） |
|------|------|
| `skills/alloy-*/SKILL.md` | `.claude/skills/alloy-*/SKILL.md` |
| `skills/alloy/scripts/*.sh` | `.claude/skills/alloy/scripts/*.sh` |
| `openspec/schemas/alloy/*` | `openspec/schemas/alloy/*` |
| `vendor/superpowers/` | `.claude/skills/`（离线兜底） |

---

## 六、跨层复盘清单

任何代码改动完成后，按以下 6 层逐一检查：

```
[ ] 1. 设计文档 (docs/alloy-design.md) — 设计描述需要更新吗？
[ ] 2. Schema    (openspec/schemas/alloy/) — DAG/制品/instructions 需要同步吗？
[ ] 3. Guard     (skills/alloy/scripts/) — 检查规则完整吗？
[ ] 4. Skill 文档 (skills/alloy-*/SKILL.md) — 流程描述/闸门指令需要更新吗？
[ ] 5. CLI 代码  (src/) — 实现对齐了吗？
[ ] 6. 测试      (test/) — 新增回归测试了吗？
```

不满足 6 层检查不提交。不做一个"只改出 bug 那一行"的点状修复。

---

## 七、常见踩坑

| # | 现象 | 原因 | 修复 |
|---|------|------|------|
| 1 | `openspec status` 报 `Invalid schema` | version 是 string、artifact 缺 description、apply 缺 requires | `openspec schemas` 验证 |
| 2 | `Template not found: .../templates/templates/draft.md` | template 值含 `templates/` 前缀，OpenSpec 又加一遍 | 去掉前缀，只写文件名 |
| 3 | sed 报 `No such file or directory` | 路径值含 `/`，sed `s/old/new/` 用 `/` 做分隔符 | 改用 `s#old#new#` |
| 4 | `declare: -A: invalid option` | macOS bash 3.2 不支持关联数组 | 用 `case` 替代 |
| 5 | vitest mock 不生效 | ESM 模块不能用 `vi.spyOn(require(...))` | 用 `vi.mock` + `vi.mocked` |
| 6 | bats 输出乱码或 0 tests | 测试名含中文 | 全部用 ASCII 英文名 |
| 7 | `alloy init --scope project` 文件创建到 `./project/` 子目录 | CLI 参数解析把 `"project"` 当路径 | 用 `parseArgs({ allowPositionals: true })` |
| 8 | `openspec archive -y --change <name>` 报 `unknown option` | v1.3 CLI 不支持 `--change` flag | 语法是 `openspec archive -y <name>` |
| 9 | worktree 断线重连无法识别 | alloy-apply 创建 worktree 后没写 `.alloy.yaml` | Step 1c 后立即 `alloy-state.sh write worktree` |
| 10 | `.alloy.yaml` phase 不更新 | guard 脚本 `started→planned` 无制品检查 | 补充 5 制品缺失检查 |
| 11 | `.alloy.yaml` 缺少 `created_at` 字段 | alloy-plan Step 1/3 只写了 worktree 和 schema_version | 补写 `phase started` + `created_at "$(date +%Y-%m-%dT%H:%M:%S)"` |
| 12 | `updated_at` 只有日期无时间 | `date +%Y-%m-%d` 只输出日期 | 改为 `date +%Y-%m-%dT%H:%M:%S` |
