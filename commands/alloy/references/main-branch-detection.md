# 主分支检测

start 和 fix 命令共享的主分支自动检测逻辑。

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

检测到主分支后，必须让用户确认（Y/n）：
```
主分支: $DEFAULT_BRANCH。使用此分支作为基础分支？[Y/n]
```

选 Y 或直接回车 → 使用检测结果。选 n → 让用户输入自定义名称。

确认后写入项目级配置：
```bash
alloy _config write <project-root> main_branch <用户确认的主分支名>
```
