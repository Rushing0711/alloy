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
  formatTimestamp: () => "2026-07-14 16:34:43",
}));

import { worktreeCleanupCommand } from "../../../src/cli/commands/internal/worktree-cleanup.js";

const CHANGE_DIR = "/tmp/test";
const WORKTREE_BRANCH = "worktree-test";
const STATE_YAML = `worktree: /path/to/wt\nfeature_branch: feature/test\nworktree_branch: ${WORKTREE_BRANCH}`;

// mock 前置:worktree 分支存在 + git show 读 state
function mockBranchAndState(extra?: (cmd: string) => string | undefined) {
  execSyncMock.mockImplementation((cmd: string) => {
    if (cmd === `git rev-parse --verify ${WORKTREE_BRANCH}`) return "abc123\n";
    if (cmd === `git show ${WORKTREE_BRANCH}:${CHANGE_DIR}/.alloy.yaml`) return STATE_YAML + "\n";
    return extra?.(cmd) ?? "";
  });
}

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

  it("缺少 change-dir 参数时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await worktreeCleanupCommand([]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("用法"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("worktree 分支不存在 -> PRECONDITION_FAIL", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd === `git rev-parse --verify ${WORKTREE_BRANCH}`) {
        throw new Error("unknown revision");
      }
      return "";
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await worktreeCleanupCommand([CHANGE_DIR]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("worktree 分支") && String(c[0]).includes("不存在"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("无法从 worktree 分支读 .alloy.yaml -> PRECONDITION_FAIL", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd === `git rev-parse --verify ${WORKTREE_BRANCH}`) return "abc123\n";
      if (cmd === `git show ${WORKTREE_BRANCH}:${CHANGE_DIR}/.alloy.yaml`) {
        throw Object.assign(new Error("not found"), {
          stdout: Buffer.from(""), stderr: Buffer.from("fatal: pathspec"),
        });
      }
      return "";
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await worktreeCleanupCommand([CHANGE_DIR]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("无法从 worktree 分支") && String(c[0]).includes("读 .alloy.yaml"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("worktree 目录不存在 + git worktree list 不含 -> silent fallback 仅记录 merged_at + 清空 worktree 字段", async () => {
    mockBranchAndState((cmd) => {
      if (cmd.includes("git worktree list")) return "other-path\n";
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      return "";
    });
    readStateMock.mockResolvedValue({ worktree: "/path/to/wt", feature_branch: "feature/test" });
    writeStateMock.mockResolvedValue(undefined);

    await worktreeCleanupCommand([CHANGE_DIR]);

    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git merge"))).toBe(false);
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git worktree remove"))).toBe(false);
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git branch -d"))).toBe(false);
    expect(writeStateMock).toHaveBeenCalled();
    // 验证 worktree 字段被清空(避免后续 assertInWorktree 误判 worktree 模式)
    const writtenState = writeStateMock.mock.calls[0][1] as { worktree: string | null; worktree_merged_at: string };
    expect(writtenState.worktree).toBeNull();
    expect(writtenState.worktree_merged_at).toBeTruthy();
  });

  it("当前在 worktree 内 -> PRECONDITION_FAIL", async () => {
    mockBranchAndState((cmd) => {
      if (cmd.includes("git worktree list")) return "/path/to/wt\n";
      if (cmd === "git rev-parse --git-dir") return "/path/to/wt/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      return "";
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(require("node:fs"), "existsSync").mockReturnValue(true);

    await worktreeCleanupCommand([CHANGE_DIR]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("当前在 worktree 内"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("当前分支 ≠ feature_branch -> PRECONDITION_FAIL", async () => {
    mockBranchAndState((cmd) => {
      if (cmd.includes("git worktree list")) return "/path/to/wt\n";
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "main\n";
      return "";
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(require("node:fs"), "existsSync").mockReturnValue(true);

    await worktreeCleanupCommand([CHANGE_DIR]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("≠ feature 分支"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("git merge 失败 -> HARD_STOP,禁 agent 自救", async () => {
    mockBranchAndState((cmd) => {
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

    await worktreeCleanupCommand([CHANGE_DIR]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("git merge 失败"))).toBe(true);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("git merge --abort"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git worktree remove"))).toBe(false);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("git branch -d 失败 -> HARD_STOP,禁自动 -D", async () => {
    mockBranchAndState((cmd) => {
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

    await worktreeCleanupCommand([CHANGE_DIR]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("git branch -d 失败"))).toBe(true);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("git branch -D 强制删除"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("全流程成功 -> merge + remove + branch -d + merged_at 记录", async () => {
    mockBranchAndState((cmd) => {
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

    await worktreeCleanupCommand([CHANGE_DIR]);

    expect(writeStateMock).toHaveBeenCalled();
    expect(logSpy.mock.calls.some(c => String(c[0]).includes("✓ worktree 清理完成"))).toBe(true);
    // 验证 worktree 字段被清空(避免后续 assertInWorktree 误判 worktree 模式)
    const lastWriteCall = writeStateMock.mock.calls[writeStateMock.mock.calls.length - 1][1] as { worktree: string | null; worktree_merged_at: string };
    expect(lastWriteCall.worktree).toBeNull();
    expect(lastWriteCall.worktree_merged_at).toBeTruthy();
    logSpy.mockRestore();
  });

  it("git worktree remove 失败 + 仅有 untracked 文件 -> 自动 --force,流程继续", async () => {
    mockBranchAndState((cmd) => {
      if (cmd.includes("git worktree list")) return "/path/to/wt\n";
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "feature/test\n";
      if (cmd === "git merge worktree-test --no-edit") return "Merge made by the 'ort' strategy.\n";
      if (cmd === "git worktree remove \"/path/to/wt\"") {
        throw Object.assign(new Error("remove failed"), {
          stdout: Buffer.from(""), stderr: Buffer.from("contains untracked files"),
        });
      }
      if (cmd === "git status --porcelain") return "?? test_hello.sh\n";
      if (cmd === "git worktree remove --force \"/path/to/wt\"") return "";
      if (cmd === "git branch -d worktree-test") return "Deleted branch worktree-test\n";
      return "";
    });
    readStateMock.mockResolvedValue({ worktree: "/path/to/wt", feature_branch: "feature/test" });
    writeStateMock.mockResolvedValue(undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(require("node:fs"), "existsSync").mockReturnValue(true);

    await worktreeCleanupCommand([CHANGE_DIR]);

    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git worktree remove --force"))).toBe(true);
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git branch -d"))).toBe(true);
    expect(writeStateMock).toHaveBeenCalled();
    expect(logSpy.mock.calls.some(c => String(c[0]).includes("✓ worktree 清理完成"))).toBe(true);
    logSpy.mockRestore();
  });

  it("git worktree remove 失败 + 仅 .alloy.yaml 未提交 -> 自动 --force,流程继续", async () => {
    mockBranchAndState((cmd) => {
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
      if (cmd === "git status --porcelain") return ` M ${CHANGE_DIR}/.alloy.yaml\n`;
      if (cmd === "git worktree remove --force \"/path/to/wt\"") return "";
      if (cmd === "git branch -d worktree-test") return "Deleted branch worktree-test\n";
      return "";
    });
    readStateMock.mockResolvedValue({ worktree: "/path/to/wt", feature_branch: "feature/test" });
    writeStateMock.mockResolvedValue(undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(require("node:fs"), "existsSync").mockReturnValue(true);

    await worktreeCleanupCommand([CHANGE_DIR]);

    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git worktree remove --force"))).toBe(true);
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git branch -d"))).toBe(true);
    expect(writeStateMock).toHaveBeenCalled();
    expect(logSpy.mock.calls.some(c => String(c[0]).includes("✓ worktree 清理完成"))).toBe(true);
    logSpy.mockRestore();
  });

  it("git worktree remove 失败 + 有其他文件未提交 -> HARD_STOP,不自动 --force", async () => {
    mockBranchAndState((cmd) => {
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
      if (cmd === "git status --porcelain") return " M src/some-file.ts\n";
      return "";
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(require("node:fs"), "existsSync").mockReturnValue(true);

    await worktreeCleanupCommand([CHANGE_DIR]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("tracked 文件未提交修改"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git worktree remove --force"))).toBe(false);
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git branch -d"))).toBe(false);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("merge 前工作目录有 .alloy.yaml 未 commit -> 自动 commit 后 merge", async () => {
    mockBranchAndState((cmd) => {
      if (cmd.includes("git worktree list")) return "/path/to/wt\n";
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "feature/test\n";
      if (cmd === "git diff --name-only HEAD") return "openspec/changes/test/.alloy.yaml\n";
      if (cmd === 'git add "openspec/changes/test/.alloy.yaml"') return "";
      if (cmd === 'git commit -m "chore: 提交 .alloy.yaml 临时状态 merge 前置"') return "";
      if (cmd === "git merge worktree-test --no-edit") return "Merge made by the 'ort' strategy.\n";
      if (cmd === "git worktree remove \"/path/to/wt\"") return "";
      if (cmd === "git branch -d worktree-test") return "Deleted branch worktree-test\n";
      return "";
    });
    readStateMock.mockResolvedValue({ worktree: "/path/to/wt", feature_branch: "feature/test" });
    writeStateMock.mockResolvedValue(undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(require("node:fs"), "existsSync").mockReturnValue(true);

    await worktreeCleanupCommand([CHANGE_DIR]);

    // 验证自动 commit 了 .alloy.yaml
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes('git commit -m "chore: 提交 .alloy.yaml'))).toBe(true);
    // 验证 merge 执行了(自动 commit 后继续 merge)
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git merge worktree-test"))).toBe(true);
    expect(logSpy.mock.calls.some(c => String(c[0]).includes("worktree 清理完成"))).toBe(true);
    logSpy.mockRestore();
  });

  it("merge 前工作目录有非 .alloy.yaml 未 commit -> HARD_STOP", async () => {
    mockBranchAndState((cmd) => {
      if (cmd.includes("git worktree list")) return "/path/to/wt\n";
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "feature/test\n";
      if (cmd === "git diff --name-only HEAD") return "openspec/changes/test/.alloy.yaml\nsrc/foo.ts\n";
      return "";
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(require("node:fs"), "existsSync").mockReturnValue(true);

    await worktreeCleanupCommand([CHANGE_DIR]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("非 .alloy.yaml 的未 commit 修改"))).toBe(true);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("src/foo.ts"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    // 验证未执行 merge
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git merge worktree-test"))).toBe(false);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("merge 冲突只有 .alloy.yaml -> 自动取 worktree 版本解决", async () => {
    mockBranchAndState((cmd) => {
      if (cmd.includes("git worktree list")) return "/path/to/wt\n";
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "feature/test\n";
      if (cmd === "git merge worktree-test --no-edit") {
        throw Object.assign(new Error("merge conflict"), {
          stdout: Buffer.from(""), stderr: Buffer.from("CONFLICT"),
        });
      }
      if (cmd === "git diff --name-only --diff-filter=U") return "openspec/changes/test/.alloy.yaml\n";
      if (cmd === 'git checkout --theirs "openspec/changes/test/.alloy.yaml"') return "";
      if (cmd === 'git add "openspec/changes/test/.alloy.yaml"') return "";
      if (cmd === "git commit --no-edit") return "";
      if (cmd === "git worktree remove \"/path/to/wt\"") return "";
      if (cmd === "git branch -d worktree-test") return "Deleted branch worktree-test\n";
      return "";
    });
    readStateMock.mockResolvedValue({ worktree: "/path/to/wt", feature_branch: "feature/test" });
    writeStateMock.mockResolvedValue(undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(require("node:fs"), "existsSync").mockReturnValue(true);

    await worktreeCleanupCommand([CHANGE_DIR]);

    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git checkout --theirs"))).toBe(true);
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git worktree remove"))).toBe(true);
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git branch -d"))).toBe(true);
    expect(logSpy.mock.calls.some(c => String(c[0]).includes("冲突已自动解决"))).toBe(true);
    logSpy.mockRestore();
  });

  it("merge 冲突含非 .alloy.yaml -> HARD_STOP", async () => {
    mockBranchAndState((cmd) => {
      if (cmd.includes("git worktree list")) return "/path/to/wt\n";
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "feature/test\n";
      if (cmd === "git merge worktree-test --no-edit") {
        throw Object.assign(new Error("merge conflict"), {
          stdout: Buffer.from(""), stderr: Buffer.from("CONFLICT"),
        });
      }
      if (cmd === "git diff --name-only --diff-filter=U") return "openspec/changes/test/.alloy.yaml\nsrc/foo.ts\n";
      return "";
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(require("node:fs"), "existsSync").mockReturnValue(true);

    await worktreeCleanupCommand([CHANGE_DIR]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("非 .alloy.yaml 冲突"))).toBe(true);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("src/foo.ts"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git checkout --theirs"))).toBe(false);
    expect(execSyncMock.mock.calls.some(c => String(c[0]).includes("git worktree remove"))).toBe(false);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});
