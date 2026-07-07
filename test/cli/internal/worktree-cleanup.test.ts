// test/cli/internal/worktree-cleanup.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execSyncMock = vi.fn();
vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => execSyncMock(...args),
}));

const readStateMock = vi.fn();
const writeStateMock = vi.fn();
vi.mock("../../../src/cli/utils/state.js", () => ({
  readState: (...args: unknown[]) => readStateMock(...args),
  writeState: (...args: unknown[]) => writeStateMock(...args),
}));

import { worktreeCleanupCommand } from "../../../src/cli/commands/internal/worktree-cleanup.js";

const FULL_ARGS = [
  "--archive-dir", "/tmp/archive-test",
  "--worktree-path", "/path/to/wt",
  "--feature-branch", "feature/test",
  "--worktree-branch", "worktree-test",
];

describe("alloy _worktree-cleanup", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-wt-cleanup-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    execSyncMock.mockReset();
    readStateMock.mockReset();
    writeStateMock.mockReset();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("缺少必需参数时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await worktreeCleanupCommand(["--archive-dir", "/tmp/x"]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("用法"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("worktree 目录不存在 + git worktree list 不含 → silent fallback 仅记录 merged_at", async () => {
    // existsSync 返回 false（worktreePath 不存在）
    // git worktree list 不含 worktreePath
    // readState 成功
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.includes("git worktree list")) return "other-path\n";
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      return "";
    });
    readStateMock.mockResolvedValue({ worktree: "/path/to/wt", feature_branch: "feature/test" });
    writeStateMock.mockResolvedValue(undefined);
    // existsSync 用真实 fs——worktreePath 不存在,返回 false

    await worktreeCleanupCommand(FULL_ARGS);

    // 不应执行 merge / remove / branch -d
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git merge"))).toBe(false);
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git worktree remove"))).toBe(false);
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git branch -d"))).toBe(false);
    // 应记录 worktree_merged_at
    expect(writeStateMock).toHaveBeenCalled();
  });

  it("当前在 worktree 内 → PRECONDITION_FAIL", async () => {
    // existsSync 通过（worktreePath 存在）
    // git worktree list 包含 worktreePath
    // git-dir ≠ git-common-dir（在 worktree 内）
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.includes("git worktree list")) return "/path/to/wt\n";
      if (cmd === "git rev-parse --git-dir") return "/path/to/wt/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      return "";
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // 让 existsSync 返回 true
    vi.spyOn(require("node:fs"), "existsSync").mockReturnValue(true);

    await worktreeCleanupCommand(FULL_ARGS);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("当前在 worktree 内"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("当前分支 ≠ feature_branch → PRECONDITION_FAIL", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.includes("git worktree list")) return "/path/to/wt\n";
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "main\n";
      return "";
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(require("node:fs"), "existsSync").mockReturnValue(true);

    await worktreeCleanupCommand(FULL_ARGS);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("≠ feature 分支"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("git merge 失败 → HARD_STOP,禁 agent 自救", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.includes("git worktree list")) return "/path/to/wt\n";
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "feature/test\n";
      if (cmd === "git merge worktree-test --no-edit") {
        throw Object.assign(new Error("merge conflict"), {
          stdout: Buffer.from(""), stderr: Buffer.from("CONFLICT"),
        });
      }
      if (cmd === "git status --short") return "UU file.txt\n";
      return "";
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(require("node:fs"), "existsSync").mockReturnValue(true);

    await worktreeCleanupCommand(FULL_ARGS);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("git merge 失败"))).toBe(true);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("git merge --abort"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    // 不应继续 remove / branch -d
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git worktree remove"))).toBe(false);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("git branch -d 失败 → HARD_STOP,禁自动 -D", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.includes("git worktree list")) return "/path/to/wt\n";
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "feature/test\n";
      if (cmd === "git merge worktree-test --no-edit") return "Merge made by the 'ort' strategy.\n";
      if (cmd === "git worktree remove \"/path/to/wt\"") return "";
      if (cmd === "git branch -d worktree-test") {
        throw Object.assign(new Error("not fully merged"), {
          stdout: Buffer.from(""), stderr: Buffer.from("not fully merged"),
        });
      }
      return "";
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(require("node:fs"), "existsSync").mockReturnValue(true);

    await worktreeCleanupCommand(FULL_ARGS);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("git branch -d 失败"))).toBe(true);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("git branch -D 强制删除"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("全流程成功 → merge + remove + branch -d + merged_at 记录", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.includes("git worktree list")) return "/path/to/wt\n";
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "feature/test\n";
      if (cmd === "git merge worktree-test --no-edit") return "Merge made by the 'ort' strategy.\n";
      if (cmd === "git worktree remove \"/path/to/wt\"") return "";
      if (cmd === "git branch -d worktree-test") return "Deleted branch worktree-test\n";
      return "";
    });
    readStateMock.mockResolvedValue({ worktree: "/path/to/wt", feature_branch: "feature/test" });
    writeStateMock.mockResolvedValue(undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(require("node:fs"), "existsSync").mockReturnValue(true);

    await worktreeCleanupCommand(FULL_ARGS);

    expect(writeStateMock).toHaveBeenCalled();
    expect(logSpy.mock.calls.some(c => String(c[0]).includes("✓ worktree 清理完成"))).toBe(true);
    logSpy.mockRestore();
  });

  it("git worktree remove 失败 + 仅 .alloy.yaml 未提交 → 自动 --force,流程继续", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.includes("git worktree list")) return "/path/to/wt\n";
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "feature/test\n";
      if (cmd === "git merge worktree-test --no-edit") return "Merge made by the 'ort' strategy.\n";
      if (cmd === "git worktree remove \"/path/to/wt\"") {
        throw Object.assign(new Error("remove failed"), {
          stdout: Buffer.from(""), stderr: Buffer.from("contains modified files"),
        });
      }
      if (cmd === "cd \"/path/to/wt\" && git status --porcelain") return " M /tmp/archive-test/.alloy.yaml\n";
      if (cmd === "git worktree remove --force \"/path/to/wt\"") return "";
      if (cmd === "git branch -d worktree-test") return "Deleted branch worktree-test\n";
      return "";
    });
    readStateMock.mockResolvedValue({ worktree: "/path/to/wt", feature_branch: "feature/test" });
    writeStateMock.mockResolvedValue(undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(require("node:fs"), "existsSync").mockReturnValue(true);

    await worktreeCleanupCommand(FULL_ARGS);

    // 应调用 --force
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git worktree remove --force"))).toBe(true);
    // 应继续完成 branch -d
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git branch -d"))).toBe(true);
    // 应记录 merged_at
    expect(writeStateMock).toHaveBeenCalled();
    expect(logSpy.mock.calls.some(c => String(c[0]).includes("✓ worktree 清理完成"))).toBe(true);
    logSpy.mockRestore();
  });

  it("git worktree remove 失败 + 有其他文件未提交 → HARD_STOP,不自动 --force", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.includes("git worktree list")) return "/path/to/wt\n";
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "feature/test\n";
      if (cmd === "git merge worktree-test --no-edit") return "Merge made by the 'ort' strategy.\n";
      if (cmd === "git worktree remove \"/path/to/wt\"") {
        throw Object.assign(new Error("remove failed"), {
          stdout: Buffer.from(""), stderr: Buffer.from("contains modified files"),
        });
      }
      if (cmd === "cd \"/path/to/wt\" && git status --porcelain") return " M src/some-file.ts\n";
      return "";
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(require("node:fs"), "existsSync").mockReturnValue(true);

    await worktreeCleanupCommand(FULL_ARGS);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("worktree 目录有未提交修改"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    // 不应调用 --force
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git worktree remove --force"))).toBe(false);
    // 不应继续 branch -d
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git branch -d"))).toBe(false);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});
