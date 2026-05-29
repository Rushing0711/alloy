#!/usr/bin/env bats
# alloy-archive.sh tests — archive validation and execution

setup() {
  TEST_DIR="$(mktemp -d)"
  mkdir -p "$TEST_DIR/openspec/changes/web-tetris"
  CHANGE_DIR="$TEST_DIR/openspec/changes/web-tetris"
  ALLOY_YAML="$CHANGE_DIR/.alloy.yaml"

  cat > "$ALLOY_YAML" << 'EOF'
worktree: .worktrees/web-tetris
schema_version: 1
phase: applied
updated_at: "2026-05-29"
EOF

  touch "$CHANGE_DIR/verify.md"

  SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)/skills/alloy/scripts/alloy-archive.sh"
}

teardown() {
  rm -rf "$TEST_DIR"
}

@test "HARD STOP when phase is not applied" {
  sed -i '' 's/^phase: applied/phase: planned/' "$ALLOY_YAML"
  run bash "$SCRIPT" "$TEST_DIR" web-tetris
  [ "$status" -eq 1 ]
  [[ "$output" == *"HARD STOP"* ]]
  [[ "$output" == *"applied"* ]]
}

@test "phase applied passes and updates to archived" {
  run bash "$SCRIPT" "$TEST_DIR" web-tetris
  [ "$status" -eq 0 ]
  grep -q '^phase: archived' "$ALLOY_YAML"
  [[ "$output" == *"phase"*"archived"* ]]
}

@test "--dry-run does not modify files" {
  run bash "$SCRIPT" "$TEST_DIR" web-tetris --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"DRY RUN"* ]]
  grep -q '^phase: applied' "$ALLOY_YAML"
}

@test "openspec CLI unavailable still updates phase" {
  # Use PATH without the nvm bin where openspec lives
  run env PATH="/usr/bin:/bin" bash "$SCRIPT" "$TEST_DIR" web-tetris
  [ "$status" -eq 0 ]
  grep -q '^phase: archived' "$ALLOY_YAML"
}
