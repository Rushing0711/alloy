---
name: "Alloy: Finish"
description: Alloy 收尾阶段 - archive 完成后进入
category: Workflow
tags: [alloy, workflow]
---

# alloy-finish

你是 Alloy 的收尾命令。你的职责是：在 spec 已归档（phase=archived）的前提下，完成代码合入与现场清理，将 phase 推进到 `finished`。

**核心原则：只做代码合入，不碰 spec。** 如果合入过程中（如 PR 审查）发现需要修改 spec，那是另一个 change 的事——当前 change 的 spec 已归档封存。

**交互风格：** 主分支确认、合并策略选择使用 `AskUserQuestion` 工具。**合并确认仍用精确文本匹配**（安全机制）。详见 `commands/alloy/references/interaction-style.md`。

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。不要只出标题然后沉默。**

**捕获阶段启动时间**（命令调用后第一时间，前置检查之前，幂等——重入时返回已有值）：
```bash
PHASE_START=$(alloy _state timestamp ensure openspec/changes/<name> finish)
```

---

**什么算"finish 使用不当"（反例）：**
- phase 不是 archived 时调 finish——"反正就合个代码"——跳过了 archive，spec 没有同步
- 分支已 merge 或删除后重复调 finish——浪费操作，应该直接告知用户无需再次 finish
- finish 过程中试图修改 spec——spec 已归档，任何 spec 级变更应走新 change

### Red Flags——STOP，不要继续

以下任何一个念头出现，都意味着闸门正在被绕过：

| 借口 | 现实 |
|------|------|
| "phase 不是 archived，但代码都已经写好了，直接合吧" | archive 不可跳过——spec 归档和代码合入是两件事。先归档再合入，顺序不可颠倒。 |
| "分支已经删了，finish 白跑了" | finish 前置检查的第一步就是确认分支存在。分支不存在 = 无需再次 finish，直接告知用户。 |
| "PR 审查说要改 spec，我在 finish 里顺手改了吧" | spec 已归档封存。任何 spec 级变更 = 新 change。当前 change 的 finish 不涉及 spec 修改。 |
| "选'保持分支'就等于没做完，太麻烦了，直接 merge 吧" | 保持分支是合法选项——用户可能有后续计划。替用户选 merge 是越权。 |
| "merge 确认太啰嗦了，用户说'好'就是同意了" | merge 确认必须精确文本匹配。`merge <branch> into <branch>` 是安全机制——防止手滑合入。 |

---

## 前置检查

```
┌──────────────────────────────────────┐
│ Alloy [5/5] · Phase: Finish          │
│ 启动时间: $PHASE_START
└──────────────────────────────────────┘
```

### [Step 1/3] 前置检查

**0. Skill 预检：** 确认以下依赖可用：
   skill: finishing-a-development-branch

   读取 `commands/alloy/references/skill-precheck.md` 了解检测方法。任一不可用 → 引导 `alloy init` → STOP。

> phase 是否为 archived？ <检查结果>

**phase 检查：**

通过 `alloy _guard` 校验：
```bash
alloy _guard openspec/changes/<name> finished
```

若 guard 报错（phase 不匹配），读取 `commands/alloy/references/phase-routing.md` 按路由表自动跳转。当前 phase=archived 时 precheck 通过。

**HARD STOP 保留场景：** 分支不存在（可能已 merge 或删除）→ 提示无需再次 finish。

确认当前有对应的 git 分支存在：
```bash
git branch --list <feature_branch>
```
分支不存在 → "分支 <feature_branch> 不存在，可能已 merge 或删除。无需再次 finish。"

读取主分支作为默认合并目标：
```bash
alloy _config read . main_branch
```
若 `main_branch` 未记录（输出 `null`）→ 读取 `commands/alloy/references/main-branch-detection.md`，按 3 级优先级自动检测主分支。检测到后让用户确认（Y/n），确认后写入配置：
```bash
alloy _config write . main_branch <确认的主分支名>
```

---

## 执行

### [Step 2/3] superpowers:finishing-a-development-branch

> 选择处理方式
> ──────────────────────────────────────
>
> phase=archived 已确认 ✓
>
> 1. 本地 merge —— 合入基础分支
> 2. 创建 PR    —— 提交代码审查
> 3. 保持分支   —— 暂不处理

使用 Skill 工具加载 `superpowers:finishing-a-development-branch` 技能，传入上下文：
```
Change: <name>
状态：phase=archived（spec 已归档，代码待合入）
当前分支：<feature_branch>
基础分支：<main_branch>（从 openspec/config.yaml 读取）
```

**技能加载后立即记录：**
```bash
alloy _skill log openspec/changes/<name> finish superpowers:finishing-a-development-branch
```

技能加载后，按其指引提供 3 个选项。

### 各选项的后续行为

**选项 1：本地合并（squash）**

在执行 merge 之前，必须展示确认信息并等待用户确认：

> 确认合并
> ──────────────────────────────────────
>
> 即将执行本地合并：
>
> 源分支：<feature_branch>
> 目标分支：<main_branch>
>
> 即将合入的提交：
> ```
> <git log main_branch..feature_branch --oneline 的输出>
> ```
>
> 合并后 worktree 将被清理，分支将被删除。
>
> 输入 merge <feature_branch> into <main_branch> 确认，或输入其他内容取消。

**必须等待用户精确输入确认语句。** "好"、"可以"、"y" 都不算确认。

用户确认后，记录完成时间、推进 phase，再 squash 合并：
```bash
# 确定归档路径（archive 阶段已将目录移至 archive/ 下）
ARCHIVE_DIR=$(ls -d openspec/changes/archive/*-<name> 2>/dev/null | sort -r | head -1)
CHANGE_DIR="${ARCHIVE_DIR:-openspec/changes/<name>}"

# 记录完成时间 + 推进 phase 到 finished（所有状态变更在 squash merge 之前完成）
COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
alloy _state merge "$CHANGE_DIR" phase_timings "{\"finish\":{\"completed_at\":\"${COMPLETED_AT:-$(date '+%Y-%m-%d %H:%M:%S')}\"}}"
alloy _guard "$CHANGE_DIR" finished --apply
git add -A "$CHANGE_DIR" openspec/config.yaml
git commit -m "chore(<name>): 记录 finish 阶段完成时间"

git checkout <main_branch>
git pull || echo "⚠️ git pull 失败（网络问题或冲突），请手动处理后再继续"
git merge --squash <feature_branch>
# 抓取被合入分支的完整 commit 列表，生成类似 GitHub squash merge 的 commit message
COMMIT_LOG=$(git log <main_branch>..<feature_branch> --format="* %s")
git commit -m "$(cat <<EOF
chore(<name>): 合入 main（squash merge）

${COMMIT_LOG}
EOF
)"
# squash merge 不产生 merge commit，git 无法识别分支已合入，使用 -D 强删
git branch -D <feature_branch>
```

若 `git pull` 失败（网络不可达、认证失败），输出警告并暂停，让用户决定是否跳过 pull 直接 merge。若 `git merge --squash` 冲突，输出冲突文件列表，让用户手动解决后继续。

提示："代码已合入 <main_branch>。Alloy 工作流完成。"

**选项 2：创建 PR**
- 先记录完成时间并推进 phase，作为分支上最后一个提交（PR squash merge 后主分支仅 1 个 commit）：
  ```bash
  ARCHIVE_DIR=$(ls -d openspec/changes/archive/*-<name> 2>/dev/null | sort -r | head -1)
  CHANGE_DIR="${ARCHIVE_DIR:-openspec/changes/<name>}"
  COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
  alloy _state merge "$CHANGE_DIR" phase_timings "{\"finish\":{\"completed_at\":\"${COMPLETED_AT:-$(date '+%Y-%m-%d %H:%M:%S')}\"}}"
  alloy _guard "$CHANGE_DIR" finished --apply
  git add -A "$CHANGE_DIR" openspec/config.yaml
  git commit -m "chore(<name>): 记录 finish 阶段完成时间"
  ```
- 提示："PR 已创建。审查通过后 squash merge 即可完成。"
- 当用户收到 PR 审查反馈并在对话中讨论时，遵循以下行为规范（来自 superpowers:receiving-code-review）：
  - **验证优先** —— 不要盲从审查意见。先验证 reviewer 指出的问题是否真实存在，再决定是否修改
  - **技术推理** —— 如果你的实现有技术理由，解释原因而不是被动接受。reviewer 可能缺少上下文
  - **不要表演性认同** —— 不理解的评论不要假装同意。追问清楚再动手
  - **每条反馈独立回应** —— 不要批量处理，逐一确认、验证、修改
  - **spec 级变更 = 新 change** —— 如果审查反馈要求修改 spec，当前 change 的 spec 已归档，应走新 change

**选项 3：保持分支**
- 提示："分支已保留。后续需要时再次运行 `/alloy:finish <name>` 进行处理。"
- phase 保持 archived，不推进到 finished

---

### [Step 3/3] 完成

完成时间已在 Step 2 的记录 commit 中写入。finish 阶段不产生额外 commit——合入 commit（选项 1）或 PR（选项 2）本身就是终端动作。

```
┌──────────────────────────────────────┐
│ Alloy [5/5] · Phase: Finish — DONE   │
│ 启动时间: 从 phase_timings.finish.started_at 读取
│ 完成时间: 从 phase_timings.finish.completed_at 读取
│ 耗时: completed_at - started_at       │
└──────────────────────────────────────┘

→ Change: <name>
→ Phase: finished
→ 处理方式: <本地 merge  /  PR  /  保留分支>
→ 分支: <merged  /  已删除  /  保留>

---

## 闸门规则

- **git add 只用精确路径** — 永远不用 `-a`、`.`。
  finish 阶段用 `git add -A "$CHANGE_DIR" openspec/config.yaml`（`$CHANGE_DIR` 为当前 change 的归档路径，`-A` 限路径，只追踪 change 目录和 openspec 配置的新增/修改/删除），代码合入由 git merge 处理
- **phase 必须为 archived** —— spec 已归档的 change 才能 finish
- **分支必须存在** —— 分支已 merge 或删除时无需再次 finish
- **不涉及 spec 变更** —— spec 已归档封存，任何 spec 级修改应走新 change
- **选项 3 不推进 phase** —— 保持分支意味着未真正收尾，phase 停留在 archived
