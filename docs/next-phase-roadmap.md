# Alloy 下一阶段 Roadmap

> **创建时间：** 2026-07-08
> **分支：** `docs/next-phase-roadmap`
> **性质：** 调研与规划，不含实际开发。本分支仅写文档，实现待后续 feature 分支。

## 背景

Alloy 0.4.0 已融合 OpenSpec（需求追踪）+ Superpowers（流程方法论），但存在两个核心缺口：

1. **闸门不硬**：`alloy _guard` 是主动闸门（模型调用才生效），无 PreToolUse hook，弱模型可绕过
2. **agent 覆盖窄**：当前主要面向 Claude Code，未系统支持其他 agent

下一阶段围绕 5 个主题推进，目标是让 Alloy 成为"多 agent + 真闸门 + 可评估 + token 优化"的工作流 CLI。

## 主题清单

| 主题 | 优先级 | 状态 | 依赖 |
|------|--------|------|------|
| 1. 确定支持的 agent + 深挖特性 | P0 | 调研完成 | - |
| 2. 增加真闸门（PreToolUse 等价物） | P0 | 规划完成，待实现 | 主题 1 |
| 3. eval 评估 skill | P1 | 待规划 | - |
| 4. headroom token 优化 | P1 | 调研完成，待规划集成方式 | 主题 1 |
| 5. 其他特性 | P2 | 待规划 | - |

---

## 主题 1：确定支持的 agent + 深挖特性

### 结论

**闸门层（完整 Alloy：skill + hook 真闸门）-- 4 个：**

| 优先级 | Agent | 官网 | GitHub | hook 机制 | 适配成本 |
|--------|-------|------|--------|----------|---------|
| P0 | Claude Code | code.claude.com | 无公开仓库 | PreToolUse 外部脚本 | 基准 |
| P0 | Codex | chatgpt.com/codex | 无公开仓库（npm） | 同款协议（白送） | 0 |
| P1 | Pi | pi.dev | github.com/earendil-works/pi | TS 扩展 `tool_call` 事件 | 中 |
| P1 | OpenCode | opencode.ai | github.com/anomalyco/opencode | custom tool 覆盖 write/edit | 中 |

**skill 层（只装 skill，不装 hook）：** 跟 Superpowers 对齐，覆盖 Cursor / Antigravity / Factory Droid / Kimi Code 等。`alloy doctor` 标注"无 hook 闸门，保护降级"。

**不纳入：** Qwen / Qoder / Copilot / Gemini CLI / Windsurf / Kiro / Amazon Q -- 生态重叠或无需求。

### 已完成调研

`docs/reference/agent-instruction-files.md` 已更新：

- 4 个闸门层 agent 的官网、GitHub、指令文件、配置文件（项目级/用户级）、hook 机制、permission 机制
- 新增"hook/生命周期钩子机制调研"章节，含适配策略和代码示例

### 关键洞察

1. **Claude Code + Codex 同款协议是关键杠杆**：一份适配器两个 agent 白送，覆盖主流闭源 CLI
2. **Pi 是开源锚点**：唯一"开源 + 有真 hook + 符合标准"的 agent，对冲 Claude Code 生态绑定
3. **OpenCode 用 custom tool 覆盖实现等价闸门**：无独立 hook，但覆盖内置 write/edit 能动态判定 + block
4. **不让步原则**：无 hook 能力的 agent 只走 skill 层，不假装有闸门

---

## 主题 2：增加真闸门

### 现状缺口

- `alloy _guard` 是主动闸门（模型调用才生效），弱模型可跳过
- `alloy _state set phase` 不硬拦截 phase 跳跃（只拦 `phase_timings`）
- 无 PreToolUse hook，模型可直接 Edit `.alloy.yaml` 或在错误阶段写源码
- init 不装 hook

### 实现计划

**P0（Claude Code + Codex，一份适配器）：**

1. `src/core/hook-guard.ts` -- 平台无关判定逻辑（纯函数）
   - 输入：`(filePath, phase, state)`
   - 输出：`{ allowed: boolean, reason: string }`
   - 逻辑：读 `.alloy.yaml` 的 phase + 路径，按 phase 判定
   - 白名单：`.alloy.yaml`、`.claude/`、`openspec/`（按阶段细分）、根目录 `.md`
   - 拦截规则：`open`/`design`/`archive` 阶段禁写源码；`build` 但 `design_doc` 空防空跳

2. `src/core/platforms/claude-code.ts` -- Claude Code/Codex 共用适配器
   - stdin JSON 解析（`tool_input.file_path`）
   - exit code 映射（0 = 放行，2 = 阻断）
   - 唯一差异：`skillsDir`（`.claude` vs `.codex`）

3. `alloy init` 自动写 hook 配置
   - Claude Code：`.claude/settings.local.json` 的 `hooks.PreToolUse`
   - Codex：`.codex/settings.local.json`（同款格式）
   - matcher：`Write|Edit`

4. `alloy _state set phase` 加硬拦截
   - 直接 set phase -> throw，提示走 `alloy _guard --apply`
   - 加 `ALLOY_FORCE_PHASE=1` 逃生阀（修复畸形状态用）

**P1（Pi + OpenCode）：**

5. `src/core/platforms/pi.ts` -- 生成 `.pi/extensions/alloy-guard.ts`
   - 订阅 `tool_call` 事件
   - 回调里调 `hook-guard` 判定，block 或放行

6. `src/core/platforms/opencode.ts` -- 生成 `.opencode/tools/write.ts` + `.edit.ts`
   - 覆盖内置 write/edit
   - execute 里调 `hook-guard` 判定，通过则 node fs 写入，不通过返回 blocked

**P2（兜底）：**

7. `alloy doctor` 检测当前 agent 能力，标注保护层级
8. git pre-commit hook 检查"guard 凭证 + 测试存在 + schema 合法"（最后一道，CI 强制）

### 待验证

- OpenCode 覆盖后的 custom tool 能否调原内置工具（避免自己实现 fs 逻辑）
- Pi 的 `tool_call` 事件回调能否同步 block
- Codex 的 `settings.local.json` hook 是否完全兼容 Claude Code 全部生命周期钩子

---

## 主题 3：eval 评估 skill

### 现状缺口

- Alloy 的 skill（`skills/alloy-*/SKILL.md`）无评估机制，质量靠人工审查
- skill 迭代无量化反馈，难以判断"改了之后变好还是变差"

### 计划方向（待细化）

参考 Comet 的 `comet eval`（Rubric / Pass@k / Pass^k）：

1. **Rubric 评估**：定义 skill 质量维度（如"是否触发正确"、"是否走完流程"、"是否产生产物"），人工或 LLM 打分
2. **Pass@k**：同一任务跑 k 次，统计通过率（稳定性）
3. **Pass^k**：k 个不同任务，统计通过率（泛化性）
4. **回归测试**：skill 改动后跑 eval 套件，防止退化

### 待规划

- eval 套件目录结构（`eval/` 下？）
- eval 运行命令（`alloy eval`？）
- 评估结果存储和可视化
- 与 CI 集成

---

## 主题 4：headroom token 优化

### headroom 是什么

- 57k stars，"The context compression layer for AI agents"
- 60-95% fewer tokens (JSON)，15-20% fewer (coding agents)
- 形态：library（Python/TS）/ proxy / MCP server / agent wrap
- 本地优先，可逆（CCR 缓存原始内容）
- 官网：headroom-docs.vercel.app/docs
- GitHub：github.com/headroomlabs-ai/headroom

### 核心能力

| 能力 | 说明 |
|------|------|
| Library | `compress(messages)` 内联，Python 或 TypeScript |
| Proxy | `headroom proxy --port 8787`，零代码改动，任何语言 |
| Agent wrap | `headroom wrap claude\|codex\|copilot\|cursor\|aider\|opencode\|cline\|continue\|...` 一行命令 |
| MCP server | `headroom_compress` / `headroom_retrieve` / `headroom_stats` |
| Cross-agent memory | 跨 agent 共享存储，自动去重 |
| `headroom learn` | 挖掘失败会话，写修正到 `CLAUDE.local.md` / `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` |
| Output token reduction | 减少模型写回的 token（不只是发送的） |
| Reversible (CCR) | 原始内容缓存，按需检索 |

### 对 Alloy 的价值

1. **agent wrap**：headroom 已支持 `wrap claude|codex|opencode` -- Alloy 3 个闸门层 agent 直接可用，Pi 可走 proxy 模式
2. **MCP server**：Alloy 可作为 MCP client 调用，精准压缩长文档
3. **headroom learn**：与 Alloy 指令文件机制互补，自动从失败中学习
4. **cross-agent memory**：Alloy 多 agent 场景（用户同时用 Claude Code + Codex）共享上下文
5. **output token reduction**：减少模型写回，整体成本下降

### 集成方式（候选）

| 方式 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A. `alloy init` 启用 wrap | init 时可选 `headroom wrap <agent>` | 零代码改动，用户即开即用 | 依赖 headroom 已安装 |
| B. Alloy 调 headroom MCP | Alloy 作为 MCP client，长文档经 `headroom_compress` | 精准控制压缩哪些内容 | 需实现 MCP client 逻辑 |
| C. skill 输出经压缩 | Alloy skill 的长输出（spec/design/tasks）注入前压缩 | 主动优化最长内容 | 需识别"长输出"时机 |
| D. doctor 检测推荐 | `alloy doctor` 检测 headroom，推荐启用 | 轻量，用户自主选择 | 无主动集成 |

**推荐**：先做 D（doctor 检测推荐）+ A（init 可选启用 wrap），低投入见效快。B/C 待 eval 有数据后按需做。

### 待规划

- headroom 依赖管理（Python 3.10+，uv/pip 安装）
- 与 Alloy 闸门层的交互（wrap 后 hook 是否仍生效？需验证）
- `headroom learn` 写入的指令文件与 Alloy 生成的指令文件冲突处理

---

## 主题 5：其他特性

### 候选

1. **phase 自洽性校验**：不只看 `phase` 字段，还查产物（`phase: build` + `design_doc` 空 = 非法空跳）。参考 Comet 的"阶段进入自洽性校验表"
2. **cross-agent memory**：headroom 提供，Alloy 多 agent 场景共享上下文
3. **多 agent 并行**：用户同时用 Claude Code + Codex，Alloy 协调状态同步
4. **skill marketplace**：参考 Superpowers marketplace，社区共享 Alloy skill
5. **dashboard 可视化**：参考 Comet `comet dashboard`，浏览器看 phase 进度 / eval 结果 / token 节省

### 待规划

- 每个候选的优先级和依赖
- 与主题 1-4 的关系

---

## 优先级和时间线

| 阶段 | 主题 | 产出 | 状态 |
|------|------|------|------|
| 阶段 1 | 主题 1 | agent 调研文档 | ✅ 完成 |
| 阶段 2 | 主题 2 P0 | Claude Code + Codex 真闸门 | 待实现 |
| 阶段 3 | 主题 2 P1 | Pi + OpenCode 真闸门 | 待实现 |
| 阶段 4 | 主题 4 D+A | headroom 集成（doctor + init wrap） | 待规划 |
| 阶段 5 | 主题 3 | eval 框架 | 待规划 |
| 阶段 6 | 主题 5 | 其他特性按需 | 待规划 |

---

## 本分支产出

- [x] `docs/reference/agent-instruction-files.md` 更新（4 agent 官网/GitHub/hook/指令/权限）
- [x] `docs/next-phase-roadmap.md`（本文档）
- [ ] commit 到 `docs/next-phase-roadmap` 分支

## 下一步

本分支合并后，按优先级开 feature 分支：

- `feature/hook-guard-claude-code` -- 主题 2 P0（含 Codex 白送）
- `feature/hook-guard-pi` -- 主题 2 P1（Pi）
- `feature/hook-guard-opencode` -- 主题 2 P1（OpenCode）
- `feature/headroom-integration` -- 主题 4 D+A
- `feature/eval-framework` -- 主题 3
