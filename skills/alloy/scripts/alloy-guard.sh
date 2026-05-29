#!/usr/bin/env bash
# alloy-guard.sh — 阶段转换闸门校验（兼容 bash 3.2+）
# 用法: alloy-guard.sh <change-dir> <target-phase> [--apply]
# 退出码: 0=通过, 1=阻断

set -euo pipefail

CHANGE_DIR="$1"
TARGET_PHASE="$2"
APPLY=false
[[ "${3:-}" == "--apply" ]] && APPLY=true

ALLOY_YAML="$CHANGE_DIR/.alloy.yaml"

# 提取当前 phase
current_phase=$(grep -E '^phase:' "$ALLOY_YAML" | awk '{print $2}')

# 合法转换校验
transition="${current_phase}->${TARGET_PHASE}"
valid=false
case "$transition" in
  "started->planned") valid=true ;;
  "planned->applied") valid=true ;;
  "applied->archived") valid=true ;;
  "archived->finished") valid=true ;;
esac

if ! $valid; then
  echo "[HARD STOP] 不允许的 phase 转换: $current_phase → $TARGET_PHASE"
  echo "  允许的转换: started→planned, planned→applied, applied→archived, archived→finished"
  exit 1
fi

# 针对特定转换的制品检查
case "$transition" in
  "started->planned")
    missing=""
    [[ ! -f "$CHANGE_DIR/proposal.md" ]] && missing="$missing  proposal.md"
    [[ ! -f "$CHANGE_DIR/design.md" ]] && missing="$missing  design.md"
    [[ ! -d "$CHANGE_DIR/specs" ]] && missing="$missing  specs/"
    [[ ! -f "$CHANGE_DIR/tasks.md" ]] && missing="$missing  tasks.md"
    [[ ! -f "$CHANGE_DIR/plan.md" ]] && missing="$missing  plan.md"
    if [[ -n "$missing" ]]; then
      echo "[HARD STOP] 以下制品缺失，无法进入 planned 阶段:"
      echo "$missing"
      exit 1
    fi
    ;;
  "planned->applied")
    if [[ ! -f "$CHANGE_DIR/plan.md" ]]; then
      echo "[HARD STOP] plan.md 不存在，无法进入 apply 阶段"
      exit 1
    fi
    ;;
  "applied->archived")
    if [[ ! -f "$CHANGE_DIR/verify.md" ]]; then
      echo "[HARD STOP] verify.md 不存在，无法进入 archive 阶段"
      exit 1
    fi
    ;;
esac

if $APPLY; then
  # 更新 phase
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s/^phase:.*/phase: $TARGET_PHASE/" "$ALLOY_YAML"
  else
    sed -i "s/^phase:.*/phase: $TARGET_PHASE/" "$ALLOY_YAML"
  fi
  # 更新 updated_at
  today=$(date +%Y-%m-%dT%H:%M:%S)
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s/^updated_at:.*/updated_at: \"$today\"/" "$ALLOY_YAML"
  else
    sed -i "s/^updated_at:.*/updated_at: \"$today\"/" "$ALLOY_YAML"
  fi
  echo "✓ phase: $current_phase → $TARGET_PHASE"
fi

exit 0
