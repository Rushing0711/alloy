// test/cli/internal/worktree-create.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execSyncMock = vi.fn();
vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => execSyncMock(...args),
}));

const readStateMock = vi.fn();
const setPendingGateMock = vi.fn();
const addClearedGateMock = vi.fn();
vi.mock("../../../src/cli/utils/state.js", () => ({
  readState: (...args: unknown[]) => readStateMock(...args),
  formatTimestamp: () => "2026-07-17 15:30:00",
  setPendingGate: (...args: unknown[]) => setPendingGateMock(...args),
  addClearedGate: (...args: unknown[]) => addClearedGateMock(...args),
}));

// mock existsSync(默认 false,测试可临时改 true 验证 gate_history 同步)
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}));

import { worktreeCreateCommand } from "../../../src/cli/commands/internal/worktree-create.js";
import { existsSync } from "node:fs";

const CHANGE_DIR = "openspec/changes/test-change";
const CHANGE_NAME = "test-change";
const WORKTREE_BRANCH = "worktree-test-change";

describe("alloy _worktree-create", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-wt-create-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    execSyncMock.mockReset();
    readStateMock.mockReset();
    setPendingGateMock.mockReset();
    addClearedGateMock.mockReset();
    vi.mocked(existsSync).mockReturnValue(false);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("缺少 change-dir 参数时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await worktreeCreateCommand([]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("用法"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("已在 worktree 内时 exit 1(禁止重复创建)", async () => {
    // mock:git-dir != git-common-dir(已在 worktree 内)
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd === "git rev-parse --git-dir") return "/path/to/worktree/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/path/to/main/.git\n";
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await worktreeCreateCommand([CHANGE_DIR]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("已在 worktree 内"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("当前分支 != feature_branch 时 exit 1", async () => {
    readStateMock.mockResolvedValue({ feature_branch: "feature/test-change" });
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "main\n"; // 当前 main,不是 feature
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await worktreeCreateCommand([CHANGE_DIR]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("≠ feature 分支"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("主仓工作目录不清洁时 exit 1", async () => {
    readStateMock.mockResolvedValue({ feature_branch: "feature/test-change" });
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "feature/test-change\n";
      if (cmd === "git status --porcelain") return " M some-file.txt\n"; // dirty
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await worktreeCreateCommand([CHANGE_DIR]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("工作目录不清洁"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("worktree 分支已存在时 exit 1", async () => {
    readStateMock.mockResolvedValue({ feature_branch: "feature/test-change" });
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "feature/test-change\n";
      if (cmd === "git status --porcelain") return ""; // clean
      if (cmd === "grep -q '^.worktrees/' .gitignore") return ""; // .gitignore 有规则
      if (cmd === `git rev-parse --verify ${WORKTREE_BRANCH} 2>/dev/null`) return "abc123\n"; // 分支已存在
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await worktreeCreateCommand([CHANGE_DIR]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("worktree 分支") && String(c[0]).includes("已存在"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("成功创建 worktree:git worktree add + _state write 三字段 + commit", async () => {
    readStateMock.mockResolvedValue({ feature_branch: "feature/test-change" });
    const calls: string[] = [];
    execSyncMock.mockImplementation((cmd: string) => {
      calls.push(cmd);
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "feature/test-change\n";
      if (cmd === "git status --porcelain") return ""; // clean
      if (cmd === "grep -q '^.worktrees/' .gitignore") return ""; // .gitignore 有规则
      if (cmd === `git rev-parse --verify ${WORKTREE_BRANCH} 2>/dev/null`) {
        throw new Error("branch not found"); // 分支不存在(校验通过)
      }
      if (cmd === "git rev-parse --show-toplevel") return "/main\n";
      if (cmd.startsWith('git worktree add')) return "Preparing worktree\n";
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await worktreeCreateCommand([CHANGE_DIR]);

    // 验证 git worktree add 用 worktree-<change-name> 分支名(不是 feature 分支)
    expect(calls.some(c => c === `git worktree add ".worktrees/${CHANGE_NAME}" -b ${WORKTREE_BRANCH}`)).toBe(true);
    // 验证 _state write 三字段(worktree 内执行)
    expect(calls.some(c => c.includes(`_state write`) && c.includes('worktree ".worktrees/test-change"'))).toBe(true);
    expect(calls.some(c => c.includes(`_state write`) && c.includes(`worktree_branch "${WORKTREE_BRANCH}"`))).toBe(true);
    expect(calls.some(c => c.includes(`_state write`) && c.includes("worktree_created_at"))).toBe(true);
    // 验证 commit
    expect(calls.some(c => c.includes("git commit -m") && c.includes("记录 worktree 状态"))).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("--record-only 缺 --path -> exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await worktreeCreateCommand(["openspec/changes/test", "--record-only", "--branch", "worktree-test"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("--record-only 缺 --branch -> exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await worktreeCreateCommand(["openspec/changes/test", "--record-only", "--path", ".claude/worktrees/test"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("成功创建 worktree:同步主仓 gate_history 到 worktree(OpenCode 场景,git worktree add 从 HEAD 创建)", async () => {
    // 场景:主仓 .alloy.yaml 有 gate_history=["apply:worktree-choice"](clearAllPendingGates 留在工作区)
    //       git worktree add 从 HEAD 创建 worktree,worktree 内 .alloy.yaml 是 HEAD 版本,缺 gate_history
    //       syncGateHistoryFromMainRepo 读主仓工作区版本,同步到 worktree
    vi.mocked(existsSync).mockReturnValue(true);
    readStateMock.mockImplementation((changePath: string) => {
      // 主仓 state(含 gate_history)
      if (typeof changePath === "string" && changePath.startsWith("/main/")) {
        return {
          pending_gate: null,
          gate_history: ["apply:worktree-choice"],
        };
      }
      // worktree state(前置校验用)
      return { feature_branch: "feature/test-change" };
    });
    const calls: string[] = [];
    execSyncMock.mockImplementation((cmd: string) => {
      calls.push(cmd);
      if (cmd === "git rev-parse --git-dir") return "/main/.git\n";
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      if (cmd === "git branch --show-current") return "feature/test-change\n";
      if (cmd === "git status --porcelain") return "";
      if (cmd === "grep -q '^.worktrees/' .gitignore") return "";
      if (cmd === `git rev-parse --verify ${WORKTREE_BRANCH} 2>/dev/null`) {
        throw new Error("branch not found");
      }
      if (cmd === "git rev-parse --show-toplevel") return "/main\n";
      if (cmd.startsWith('git worktree add')) return "Preparing worktree\n";
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await worktreeCreateCommand([CHANGE_DIR]);

    // 验证 addClearedGate 被调(同步主仓 gate_history:["apply:worktree-choice"] -> worktree)
    expect(addClearedGateMock).toHaveBeenCalledWith(expect.any(String), "apply:worktree-choice");
    // 验证 setPendingGate 被调(同步主仓 pending_gate:null -> worktree null)
    expect(setPendingGateMock).toHaveBeenCalledWith(expect.any(String), null);

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("--record-only 模式:同步主仓 gate_history 到 worktree(Claude Code 场景,EnterWorktree 从 HEAD 创建)", async () => {
    // 场景:Claude Code EnterWorktree 从 HEAD 创建 worktree,worktree 内 .alloy.yaml 是 HEAD 版本
    //       --record-only 在 worktree 内执行(cwd=worktree),syncGateHistoryFromMainRepo 同步主仓 gate_history
    vi.mocked(existsSync).mockReturnValue(true);
    readStateMock.mockImplementation((changePath: string) => {
      // 主仓 state(含 gate_history)
      if (typeof changePath === "string" && changePath.startsWith("/main/")) {
        return {
          pending_gate: null,
          gate_history: ["apply:worktree-choice", "apply:sdd-ep-choice"],
        };
      }
      return { feature_branch: "feature/test-change" };
    });
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd === "git rev-parse --git-common-dir") return "/main/.git\n";
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await worktreeCreateCommand([
      "openspec/changes/test",
      "--record-only",
      "--path",
      ".claude/worktrees/test",
      "--branch",
      "worktree-test",
    ]);

    // 验证 addClearedGate 被调(同步主仓 gate_history:["apply:worktree-choice", "apply:sdd-ep-choice"])
    expect(addClearedGateMock).toHaveBeenCalledWith(expect.any(String), "apply:worktree-choice");
    expect(addClearedGateMock).toHaveBeenCalledWith(expect.any(String), "apply:sdd-ep-choice");
    // 验证 setPendingGate 被调(同步主仓 pending_gate:null)
    expect(setPendingGateMock).toHaveBeenCalledWith(expect.any(String), null);

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });
});
