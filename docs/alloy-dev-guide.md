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
npx vitest run test/cli/internal/guard.test.ts
```

### 运行全部测试

```bash
npm test            # vitest run（全量）
npm run test:watch  # vitest 交互式 watch 模式
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

### TypeScript

| 规则 | 说明 |
|------|------|
| Node.js ≥ 18 | 编译和测试通过即可，不依赖特定版本的 Node.js 新 API |
| ESM 模块 | `"type": "module"`，import 用 `.js` 后缀 |
| `execSync` 用 `pipe` | 捕获输出静默运行，错误通过 try/catch 处理 |
| 类型统一放 `core/types.ts` | 避免 `AlloyState` 重复定义这种技术债 |

---

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

1. **Core 模块**（纯函数，可 mock 外部依赖）→ vitest
2. **CLI 命令**（集成度高，依赖真实环境）→ vitest + 集成测试
3. **内部命令**（`_state`/`_guard`/`_archive`）→ vitest 直接调用函数

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

---

## 六、跨层复盘清单

任何代码改动完成后，按以下 6 层逐一检查：

```
[ ] 1. 设计文档 (docs/alloy-design.md) — 设计描述需要更新吗？
[ ] 2. Schema    (openspec/schemas/alloy/) — DAG/制品/instructions 需要同步吗？
[ ] 3. Guard     (src/cli/commands/internal/guard.ts) — 检查规则完整吗？
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
| 3 | vitest mock 不生效 | ESM 模块不能用 `vi.spyOn(require(...))` | 用 `vi.mock` + `vi.mocked` |
| 4 | `alloy init --scope project` 文件创建到 `./project/` 子目录 | CLI 参数解析把 `"project"` 当路径 | 用 `parseArgs({ allowPositionals: true })` |
| 5 | `openspec archive -y --change <name>` 报 `unknown option` | v1.3 CLI 不支持 `--change` flag | 语法是 `openspec archive -y <name>` |
| 6 | worktree 断线重连无法识别 | alloy-apply 创建 worktree 后没写 `.alloy.yaml` | Step 1c 后立即 `alloy _state write worktree` |
| 7 | `.alloy.yaml` phase 不更新 | guard `started→planned` 无制品检查 | 补充 5 制品缺失检查 |
| 8 | `.alloy.yaml` 缺少 `created_at` 字段 | alloy-plan Step 1/3 只写了 worktree 和 schema_version | 补写 `phase started` + `created_at` |
