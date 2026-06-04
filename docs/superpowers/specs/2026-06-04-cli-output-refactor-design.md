# CLI 输出层重构

## Why

四个 CLI 命令（init/doctor/status/update）各自用 `console.log` + `color` 手动拼接输出，存在两个问题：
1. 代码重复——30+ 处相似的格式化逻辑散布在各文件中
2. 风格不统一——每个命令的缩进、图标、颜色用法不一致

同时，8 个 skill 文件中的"格式化工具函数"章节对 Agent 有误导（Agent 无法调用这些函数），需要删除。

## What

### Part 1：新建 `src/utils/output.ts` 输出层

抽取公共输出函数，所有 CLI 命令统一使用。

**函数清单：**

```typescript
// 分区标题——粗体，前面空行
section(title: string): void

// 检查项——带状态图标 ✓/✗/⚠
check(label: string, value: string, status: "pass" | "fail" | "warn"): void

// 结果消息
success(msg: string): void   // ✓ 绿色
error(msg: string): void     // ✗ 红色
warn(msg: string): void      // ⚠ 黄色

// 结束横幅
banner(msg: string): void    // 绿色大字

// 详情表——boxPanel 包裹的 borderedTable
detailTable(headers: string[], rows: string[][]): void

// 信息行——缩进普通文本
info(msg: string): void
```

**依赖：** 只依赖 `format.ts` 的 `color`、`boxPanel`、`borderedTable`。

### Part 2：重构四个 CLI 命令

| 命令 | 改动点 |
|------|-------|
| `init.ts` | 30+ 处 console.log → section/check/success/error/banner |
| `doctor.ts` | formatDoctorResult → section/check |
| `status.ts` | detail 模式 → section/check/detailTable |
| `update.ts` | 5 处 console.log → section/check/info |

### Part 3：清理 skill 文件

8 个 skill 文件（start/plan/apply/archive/finish/discard/status/fix）：
- 删除整个"格式化工具函数"章节（函数列表 + 代码示例 + 最佳实践 + Agent 输出格式提示）
- 保留阶段头框（简单单层框，不会错位）

## 范围与边界

**做：**
- 新建 output.ts
- 重构四个 CLI 命令的输出代码
- 清理 8 个 skill 文件的格式化函数章节

**不做：**
- 不改 format.ts（底层原语保持不变）
- 不改 CLI 命令的业务逻辑
- 不改阶段头框（简单的 Unicode 单层框保留）
