import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createInitialState,
  readState,
  writeState,
  findActiveChanges,
} from "../../src/cli/utils/state.js";

describe("state utils", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("createInitialState 返回 started phase 的状态", () => {
    const state = createInitialState();
    expect(state.phase).toBe("started");
    expect(state.worktree).toBeNull();
    expect(state.schema_version).toBe(1);
    // 格式: YYYY-MM-DDTHH:MM:SS（与 shell 脚本一致）
    expect(state.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(state.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it("writeState 和 readState 往返一致", async () => {
    const changeDir = join(tmpDir, "test-change");
    await mkdir(changeDir, { recursive: true });
    const original = createInitialState();
    await writeState(changeDir, original);
    const loaded = await readState(changeDir);
    expect(loaded.phase).toBe(original.phase);
    expect(loaded.worktree).toBe(original.worktree);
    expect(loaded.schema_version).toBe(original.schema_version);
  });

  it("writeState 自动更新 updated_at（含时间）", async () => {
    const changeDir = join(tmpDir, "test-change-2");
    await mkdir(changeDir, { recursive: true });
    const state = createInitialState();
    state.updated_at = "2020-01-01T00:00:00";
    await writeState(changeDir, state);
    const loaded = await readState(changeDir);
    expect(loaded.updated_at).not.toBe("2020-01-01T00:00:00");
    expect(loaded.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it("findActiveChanges 过滤 finished change，保留 archived", async () => {
    const changesDir = join(tmpDir, "openspec", "changes");
    const activeDir = join(changesDir, "active-change");
    const archivedDir = join(changesDir, "archived-change");
    const finishedDir = join(changesDir, "finished-change");
    await mkdir(activeDir, { recursive: true });
    await mkdir(archivedDir, { recursive: true });
    await mkdir(finishedDir, { recursive: true });

    const active = createInitialState();
    await writeState(activeDir, active);

    const archived = createInitialState();
    archived.phase = "archived";
    await writeState(archivedDir, archived);

    const finished = createInitialState();
    finished.phase = "finished";
    await writeState(finishedDir, finished);

    const changes = await findActiveChanges(changesDir);
    expect(changes.has("active-change")).toBe(true);
    expect(changes.has("archived-change")).toBe(true);
    expect(changes.has("finished-change")).toBe(false);
  });

  it("findActiveChanges 忽略无 .alloy.yaml 的目录", async () => {
    const changesDir = join(tmpDir, "openspec", "changes");
    await mkdir(join(changesDir, "no-state-dir"), { recursive: true });

    const changes = await findActiveChanges(changesDir);
    expect(changes.size).toBe(0);
  });
});
