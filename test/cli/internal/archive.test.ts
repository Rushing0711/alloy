// test/cli/internal/archive.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { mockExecSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
}));
vi.mock("node:child_process", () => ({
  execSync: mockExecSync,
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
    // 默认 verify.md 存在且不含 FAIL
    await writeFile(join(changeDir, "verify.md"), "- [x] ✅ PASS\n\nOverall: 通过", "utf-8");
    // 默认 openspec 成功
    mockExecSync.mockReturnValue("");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  // === C2: verify.md 检查 ===

  it("verify.md 不存在时 HARD STOP", async () => {
    await rm(join(changeDir, "verify.md"));
    await expect(
      archiveCommand([tmpDir, "test-change"])
    ).rejects.toThrow();
  });

  it("verify.md 包含 Overall Decision FAIL 时 HARD STOP", async () => {
    await writeFile(
      join(changeDir, "verify.md"),
      "- [x] ❌ FAIL\n\nOverall Decision: FAIL",
      "utf-8"
    );
    await expect(
      archiveCommand([tmpDir, "test-change"])
    ).rejects.toThrow();
  });

  it("verify.md 存在且 PASS 时通过前置检查", async () => {
    await archiveCommand([tmpDir, "test-change"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("archived");
  });

  // === 原有测试 ===

  it("phase 非 applied 时 HARD STOP", async () => {
    await setupState("planned");
    await expect(
      archiveCommand([tmpDir, "test-change"])
    ).rejects.toThrow();
  });

  it("--dry-run 不修改文件", async () => {
    await archiveCommand([tmpDir, "test-change", "--dry-run"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("applied");
  });

  // === C3: 错误分类处理 ===

  it("openspec CLI 不可用(command not found)时警告但继续推进 phase", async () => {
    const err = Object.assign(new Error("command not found: openspec"), {
      stderr: Buffer.from("command not found: openspec"),
    });
    mockExecSync.mockImplementation(() => { throw err; });

    await archiveCommand([tmpDir, "test-change"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("archived");
  });

  it("openspec archive 操作失败(非 CLI 缺失)时 HARD STOP", async () => {
    const err = Object.assign(new Error("permission denied"), {
      stderr: Buffer.from("error: could not write to archive/"),
    });
    mockExecSync.mockImplementation(() => { throw err; });

    await expect(
      archiveCommand([tmpDir, "test-change"])
    ).rejects.toThrow();
  });

  // === C4: git commit 行为 ===

  it("归档后无变更时提示无需要提交", async () => {
    let gitDiffCalled = false;
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("openspec archive")) {
        return Buffer.from(""); // openspec archive 成功
      }
      if (cmd.includes("diff --quiet")) {
        gitDiffCalled = true;
        return Buffer.from(""); // git diff 成功 → 无变更
      }
      return Buffer.from("");
    });

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    await archiveCommand([tmpDir, "test-change"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("archived");
    expect(gitDiffCalled).toBe(true);
    expect(logs.some(l => l.includes("没有需要提交的变更"))).toBe(true);

    logSpy.mockRestore();
  });

  it("归档后有变更时执行 git add + git commit", async () => {
    let gitCommitCalled = false;
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("openspec archive")) {
        return Buffer.from(""); // openspec archive 成功
      }
      if (cmd.includes("diff --quiet")) {
        throw new Error("有未提交变更"); // git diff 返回 1 → 抛出
      }
      if (cmd.includes("git commit")) {
        // 验证 commit message 格式
        expect(cmd).toContain("chore(test-change): Delta Spec 已同步并归档");
        gitCommitCalled = true;
        return Buffer.from("");
      }
      return Buffer.from("");
    });

    await archiveCommand([tmpDir, "test-change"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("archived");
    expect(gitCommitCalled).toBe(true);
  });

  it("归档后 git commit 失败时不阻断 phase", async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("openspec archive")) {
        return Buffer.from(""); // openspec archive 成功
      }
      // git diff 和 git commit 都失败
      throw new Error("git 不可用");
    });

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    await archiveCommand([tmpDir, "test-change"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("archived"); // phase 仍然推进
    expect(logs.some(l => l.includes("git commit 失败"))).toBe(true);

    logSpy.mockRestore();
  });
});
