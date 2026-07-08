# 主分支检测

start 和 fix 命令共享的主分支自动检测逻辑。

**交互规则：** 确认点为 🔴 STOP——必须用 AskUserQuestion 等用户选择，不可自行决定。

## 检测优先级（3 级）

```bash
# 1. remote HEAD（标准默认分支）
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||')
# 2. 本地 init.defaultBranch 配置
[ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH=$(git config --get init.defaultBranch 2>/dev/null)
# 3. 名称匹配（main 或 master）
[ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH=$(git branch --list 'main' --list 'master' | head -1 | sed 's/[* ]//g')
```

## 配置优先

若 `openspec/config.yaml` 已有 `alloy.main_branch` 记录，直接用记录值，跳过检测和确认。

## 确认步骤

检测到主分支后，🔴 STOP: 确认主分支（检测值 / 自定义名称）。

确认后写入项目级配置：
```bash
alloy _config write <project-root> main_branch <用户确认的主分支名>
```
