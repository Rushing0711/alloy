#!/usr/bin/env bats
# alloy-state.sh tests — read/write/check .alloy.yaml

setup() {
  TEST_DIR="$(mktemp -d)"
  CHANGE_DIR="$TEST_DIR/web-tetris"
  mkdir -p "$CHANGE_DIR"
  ALLOY_YAML="$CHANGE_DIR/.alloy.yaml"

  cat > "$ALLOY_YAML" << 'EOF'
worktree: null
schema_version: 1
phase: started
updated_at: "2026-05-29"
EOF

  SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)/skills/alloy/scripts/alloy-state.sh"
}

teardown() {
  rm -rf "$TEST_DIR"
}

# ─── read ───

@test "read phase returns started" {
  run bash "$SCRIPT" read "$CHANGE_DIR" phase
  [ "$status" -eq 0 ]
  [ "$output" = "started" ]
}

@test "read worktree returns null" {
  run bash "$SCRIPT" read "$CHANGE_DIR" worktree
  [ "$status" -eq 0 ]
  [ "$output" = "null" ]
}

@test "read schema_version returns 1" {
  run bash "$SCRIPT" read "$CHANGE_DIR" schema_version
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

# ─── write ───

@test "write updates existing field phase" {
  run bash "$SCRIPT" write "$CHANGE_DIR" phase "planned"
  [ "$status" -eq 0 ]
  grep -q '^phase: planned' "$ALLOY_YAML"
  grep -q '^updated_at:' "$ALLOY_YAML"
}

@test "write appends new field to file" {
  run bash "$SCRIPT" write "$CHANGE_DIR" custom_field "hello"
  [ "$status" -eq 0 ]
  grep -q '^custom_field: hello' "$ALLOY_YAML"
}

@test "write supports path values with slashes" {
  run bash "$SCRIPT" write "$CHANGE_DIR" worktree ".worktrees/web-tetris"
  [ "$status" -eq 0 ]
  grep -q '^worktree: .worktrees/web-tetris' "$ALLOY_YAML"
}

@test "write auto-updates updated_at to today (with time)" {
  local today_prefix
  today_prefix=$(date +%Y-%m-%d)
  run bash "$SCRIPT" write "$CHANGE_DIR" phase "applied"
  [ "$status" -eq 0 ]
  grep -q "updated_at: \"${today_prefix}T" "$ALLOY_YAML"
}

# ─── check ───

@test "check phase match exits 0" {
  run bash "$SCRIPT" check "$CHANGE_DIR" "started"
  [ "$status" -eq 0 ]
}

@test "check phase mismatch exits 1" {
  run bash "$SCRIPT" check "$CHANGE_DIR" "planned"
  [ "$status" -eq 1 ]
  [[ "$output" == *"mismatch"* || "$output" == *"不匹配"* ]]
}
