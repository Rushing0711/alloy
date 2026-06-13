# Spec Audit + Spec Sync 设计文档

## 目标

实现 spec-code 对账机制的两项剩余交付物：
1. `alloy _spec-audit` 内部 CLI 命令（TypeScript）——自动检测 spec/skill behaviors frontmatter 差异
2. `commands/alloy/references/spec-sync.md` ——人工对账工作流指南

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 检测范围 | 仅 frontmatter 对账 | 正文语义检测误报率高，frontmatter 是结构化可程序化检测的唯一可靠数据 |
| 对账方向 | skill → spec 单向 | skill 是实际执行的文件，是真相源；spec 是描述性文档 |
| --fix 交互 | 逐条确认 | 细粒度控制，避免批量写入意外 |
| 实现方式 | 独立 TypeScript 命令 | 与现有 7 个 internal 命令模式一致；YAML 解析可靠 |
| spec-sync 定位 | 纯工作流指南 | 不包含模式库或语义检测逻辑，保持简单 |

## §1 `alloy _spec-audit` 命令

### 路径

`src/cli/commands/internal/spec-audit.ts`

### 签名

```
alloy _spec-audit [--fix]
```

### 行为流程

1. **扫描** `commands/alloy/*.md`，提取每个文件的 `spec` 和 `behaviors` frontmatter
2. **定位** 对应 spec 文件（`docs/specification/<spec 路径>`）
3. **比较** 5 个 behaviors 字段：`stops`、`hard_stops`、`artifacts`、`transitions_to`、`external_calls`
4. **输出** 差异报告

### 比较逻辑

每个字段按类型比较：
- **数字字段**（`stops`、`hard_stops`）：直接数值比较
- **字符串字段**（`transitions_to`）：字符串相等比较
- **数组字段**（`artifacts`、`external_calls`）：集合比较——检测缺失项和多余项

### 输出格式

```
✓ start: spec 与 skill 一致
✗ archive: spec 与 skill 不一致
  stops: spec=3, skill=4（spec 落后 1 个 🔴 STOP）
  external_calls: spec=[opsx:archive], skill=[opsx:archive, superpowers:x]
    skill 多出: superpowers:x
⚠ fix: 未声明 spec 锚点，跳过对账
✗ start: 对应 spec 文件 01-product-spec/01-start-spec.md 不存在
```

### --fix 模式

对每个不一致的 skill/spec 对：
1. 展示所有差异
2. 逐条询问：`是否用 skill 的值更新 spec 的 <字段>? [y/N]`
3. 确认后仅修改 spec 文件的 YAML frontmatter 部分，不修改正文
4. 所有修复完成后输出变更摘要

Frontmatter 修改方式：解析整个文件 → 修改 behaviors 对象 → 重新序列化 frontmatter + 保留正文原样 → 写回文件。

### 依赖

使用 `gray-matter` npm 包解析和序列化 frontmatter。这是 Node.js 生态中处理 YAML frontmatter 的标准库，可靠且轻量。

### 注册

在 `src/cli/commands/internal/index.ts` 添加：
- 顶部 `import { specAuditCommand } from './spec-audit.js'`
- switch 中添加 `case "_spec-audit": await specAuditCommand(restArgs); break`

### 导出签名

遵循现有 internal 命令模式：

```typescript
export async function specAuditCommand(args: string[]): Promise<void>
```

### 退出码

- 0：所有 spec 与 skill 一致，或 --fix 成功修复
- 1：发现不一致（非 --fix 模式），或文件读取错误

## §2 `spec-sync.md` Reference 文件

### 路径

`commands/alloy/references/spec-sync.md`

### 定位

纯人工对账工作流指南，供 skill 文件的 CLAUDE.md "对账"列引用。

### 内容结构

```markdown
# Spec-Sync：Spec/Skill 对账工作流

所有 alloy 阶段命令共享的 spec-skill 对账工作流。

## 1. 自动检测

运行 `alloy _spec-audit` 查看差异报告。

## 2. 定位变更源

确认哪个 skill 文件修改了 behaviors——是新增/删除了 🔴 STOP、变更了外部调用、还是产物列表更新。

## 3. 更新 spec 正文

确保 spec 正文描述与 skill 一致。例如 skill 新增了 🔴 STOP，spec 正文应有对应的确认点描述。

## 4. 更新 spec frontmatter

修改 spec 文件的 behaviors 值，使其与 skill 一致。

或使用 `alloy _spec-audit --fix` 自动更新 frontmatter（仅修改 frontmatter，不修改正文）。

## 5. 验证

再运行 `alloy _spec-audit`，确认所有字段一致。

## 6. 提交

skill 变更和 spec 变更在同一 commit 中：

git add commands/alloy/<skill>.md docs/specification/01-product-spec/<spec>.md
git commit -m "docs(<name>): 同步 spec 与 skill behaviors"

## 注意事项

- 对账方向是 skill → spec（skill 是真相源）
- 只改 spec 匹配 skill，不反向修改 skill
- 正文同步是人工判断，frontmatter 同步可自动化
```

### 格式

与其他 reference 文件一致——纯 markdown，无 frontmatter，表格 + 代码块。

## 测试策略

### 单元测试

`src/cli/commands/internal/__tests__/spec-audit.test.ts`

覆盖场景：
1. spec 与 skill 一致 → 输出 ✓
2. 数字字段差异（stops/hard_stops）→ 输出差异详情
3. 数组字段差异（artifacts/external_calls）→ 输出缺失/多出项
4. 字符串字段差异（transitions_to）→ 输出值对比
5. 无 spec 锚点 → 输出 ⚠
6. spec 文件不存在 → 输出 ✗
7. --fix 模式：确认修复 → spec frontmatter 更新
8. --fix 模式：拒绝修复 → spec 不变

测试方式：创建临时 markdown 文件（skill + spec），运行 specAuditCommand，验证输出和文件修改。
