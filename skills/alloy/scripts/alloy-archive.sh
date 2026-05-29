#!/usr/bin/env bash
# alloy-archive.sh — 归档：验证状态 → sync delta spec → 移动归档
# 用法: alloy-archive.sh <project-dir> <change-name> [--dry-run]

set -euo pipefail

PROJECT_DIR="$1"
CHANGE_NAME="$2"
DRY_RUN=false
[[ "${3:-}" == "--dry-run" ]] && DRY_RUN=true

CHANGE_DIR="$PROJECT_DIR/openspec/changes/$CHANGE_NAME"
ALLOY_YAML="$CHANGE_DIR/.alloy.yaml"

# 1. 状态验证
phase=$(grep -E '^phase:' "$ALLOY_YAML" | awk '{print $2}')
if [[ "$phase" != "applied" ]]; then
  echo "[HARD STOP] phase 必须为 applied，当前为 $phase"
  exit 1
fi

if $DRY_RUN; then
  echo "[DRY RUN] 将归档 change '$CHANGE_NAME' (phase=$phase)"
  echo "[DRY RUN] openspec archive -y --change $CHANGE_NAME"
  exit 0
fi

# 2. 执行 openspec archive
if command -v openspec &> /dev/null; then
  openspec archive -y --change "$CHANGE_NAME"
  echo "✓ delta spec 已同步，change 已归档"
else
  echo "⚠️  OpenSpec CLI 未安装，跳过 spec 同步"
fi

# 3. 更新 phase
today=$(date +%Y-%m-%d)
if [[ "$(uname)" == "Darwin" ]]; then
  sed -i '' "s/^phase:.*/phase: archived/" "$ALLOY_YAML"
  sed -i '' "s/^updated_at:.*/updated_at: \"$today\"/" "$ALLOY_YAML"
else
  sed -i "s/^phase:.*/phase: archived/" "$ALLOY_YAML"
  sed -i "s/^updated_at:.*/updated_at: \"$today\"/" "$ALLOY_YAML"
fi

echo "✓ phase → archived"
