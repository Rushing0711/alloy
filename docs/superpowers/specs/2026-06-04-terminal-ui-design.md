# Terminal UI 美化设计

**日期**: 2026-06-04
**状态**: 已确认

## 背景

Alloy CLI 当前使用纯 `console.log` + emoji + `padEnd` 进行终端输出，没有任何终端 UI 库。存在以下问题：

1. **CJK 框线错位**：box-drawing 字符与中文混用时右边框对不齐
2. **无颜色**：所有输出为纯文本，无法快速区分状态
3. **无加载反馈**：长时间操作无 spinner 提示

## 目标

- 引入终端美化能力，输出风格为**极简克制**（灰度为主，少量强调色）
- 修复 CJK 字符导致的框线错位问题
- 自动检测终端能力，不支持时静默降级为纯文本
- 封装统一格式化模块，命令层不直接依赖底层库

## 技术栈

| 库 | 用途 | 大小 | 依赖数 |
|---|---|---|---|
| `picocolors` | 颜色输出 + TTY 自动检测 | 1.4KB | 0 |
| `string-width` | CJK 字符宽度正确计算 | 3KB | 2 |
| `cli-table3` | Unicode 表格，自动处理 CJK 列宽 | ~50KB | 5 |
| `boxen` | 带边框面板，自动处理 CJK 对齐 | ~20KB | 6 |
| `ora` | Spinner 加载动画 | ~30KB | 8 |
| `strip-ansi` | 去除 ANSI 转义序列 | 1KB | 1 |

**兼容性**: Node 18+，Windows / macOS / Linux，PowerShell 7，Windows Terminal / iTerm2 / GNOME Terminal。

## 架构

```
src/utils/
  format.ts        ← 核心格式化模块，统一导出所有美化能力
  prompt.ts        ← (已有，不动)
```

**设计原则**：
- `format.ts` 是唯一的格式化入口，命令层不直接 import 底层库
- 所有函数内部做能力检测，外部调用者无需关心降级逻辑
- 导出 API 保持极简

## API 设计

```typescript
import pc from 'picocolors'
import stringWidth from 'string-width'
import Table from 'cli-table3'
import boxen from 'boxen'
import ora, { type Ora } from 'ora'

// ── 颜色 ──
// 直接导出 picocolors，TTY 检测由库自动处理
export const color = pc

// ── 字符宽度 ──
export { default as stringWidth } from 'string-width'

// ── Box 面板 ──
export interface BoxOptions extends boxen.Options {}
export function box(text: string, opts?: BoxOptions): string {
  const isUnicodeSupported = !('CI' in process.env) && process.platform !== 'win32' || process.env.TERM === 'xterm-256color'
  return boxen(text, {
    padding: 1,
    borderStyle: isUnicodeSupported ? 'round' : 'single',
    ...opts,
  })
}

// ── 表格 ──
export function table(headers: string[], rows: string[][]): string {
  const t = new Table({
    head: headers,
    style: { head: ['cyan'] },
    chars: {
      'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
      'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
      'left': '  ', 'left-mid': '', 'mid': '', 'mid-mid': '',
      'right': '', 'right-mid': '', 'middle': '  ',
    },
  })
  rows.forEach(r => t.push(r))
  return t.toString()
}

// ── 带边框表格（需要强调时） ──
export function borderedTable(headers: string[], rows: string[][]): string {
  const t = new Table({ head: headers, style: { head: ['cyan'] } })
  rows.forEach(r => t.push(r))
  return t.toString()
}

// ── Spinner ──
export function spinner(text: string): Ora {
  return ora({ text, isEnabled: process.stdout.isTTY ?? false }).start()
}

// ── 工具函数 ──
export { default as stripAnsi } from 'strip-ansi'
```

## 视觉风格规范

### 颜色语义

| 语义 | 颜色 | 使用场景 |
|------|------|----------|
| 成功 | `green` | ✓ 通过、已安装 |
| 失败 | `red` | ✗ 错误、缺失 |
| 警告 | `yellow` | ⚠ 需要注意 |
| 信息 | `cyan` | ℹ 提示、路径 |
| 次要 | `dim` | 灰色，补充说明 |
| 强调 | `bold` | 标题、关键值 |

**原则**: 灰度为主，彩色只用于状态标记和关键值。

### 表格

- **默认无边框**：用 2 空格分隔列，简洁不喧宾夺主
- **有边框表格**：需要强调或复杂数据时使用，`cli-table3` 自动处理 CJK 对齐

### Box 面板

- 默认使用 `round` 边框样式（╭╮╰╯）
- 不支持 Unicode 时自动降级为 ASCII（+-+|）
- 内边距 1 字符

### Spinner

- 仅在 TTY 环境启用
- 成功/失败/信息有对应图标前缀

## 降级策略

| 能力 | 检测方式 | 降级行为 |
|------|----------|----------|
| 颜色 | `picocolors` 检测 `process.stdout.isTTY` | 非 TTY 时输出纯文本 |
| Unicode | 内置检测逻辑（`TERM`、平台、CI） | 不支持时框线回退为 ASCII |
| CJK 宽度 | `string-width` 内置处理 | 始终正确计算 |

**最差情况**（老旧 conhost.exe、无 ANSI 支持）：输出退化为纯文本 + 空格对齐，功能完全不受影响。

## 集成计划

### 阶段 1：基础能力

1. 安装依赖：`npm install picocolors string-width strip-ansi cli-table3 boxen ora`
2. 安装类型：`npm install -D @types/cli-table3`
3. 创建 `src/utils/format.ts`

### 阶段 2：命令改造

按优先级改造现有命令：

1. **status.ts** — 表格化输出模块/Change 状态
2. **doctor.ts** — 带颜色的健康检查结果
3. **init.ts** — spinner + box 面板展示检测结果
4. **update.ts** — spinner 展示更新进度

### 阶段 3：收尾

- 运行 `npm test` 确保测试通过
- 运行 `npm run build && npm link` 确保 dist 最新
- 人工在不同终端测试渲染效果

## 验收标准

- [ ] `alloy status` 输出为表格形式，CJK 字符不错位
- [ ] `alloy doctor` 检查结果有颜色区分
- [ ] `alloy init` 有 spinner 加载动画和 box 面板
- [ ] 在非 TTY 环境（如 `| cat`）输出为纯文本
- [ ] 所有现有测试通过
