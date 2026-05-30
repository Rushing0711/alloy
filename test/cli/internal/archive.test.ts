// test/cli/internal/archive.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock execSync：模拟 openspec 和 git 均不可用的环境
vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => {
    throw Object.assign(new Error("command not found"), {
      stderr: Buffer.from("command not found"),
    });
  }),
}));

import { archiveCommand } from "../../../src/cli/commands/internal/archive.js";
import { readState } from "../../../src/cli/utils/state.js";

describe("alloy _archive", () => {
  let tmpDir: string;
  let changeDir: string;

  async function setupState(phase: string) {
    const yaml = [
      "worktree: .worktrees/test-change",
      "schema_version: 1",
      `phase: ${phase}`,
      'updated_at: "2020-01-01T00:00:00"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
  }

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-archive-test-${Date.now()}`);
    changeDir = join(tmpDir, "openspec", "changes", "test-change");
    await mkdir(changeDir, { recursive: true });
    await setupState("applied");
    await writeFile(join(changeDir, "verify.md"), "");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("phase 非 applied 时 HARD STOP", async () => {
    await setupState("planned");
    await expect(
      archiveCommand([tmpDir, "test-change"])
    ).rejects.toThrow();
  });

  it("phase=applied 通过并更新为 archived", async () => {
    await archiveCommand([tmpDir, "test-change"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("archived");
  });

  it("--dry-run 不修改文件", async () => {
    await archiveCommand([tmpDir, "test-change", "--dry-run"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("applied"); // unchanged
  });

});
