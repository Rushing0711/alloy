// test/cli/commands/internal/archive.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock execSync before importing the command
const execSyncMock = vi.fn();
vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => execSyncMock(...args),
}));

import { archiveCommand } from "../../../src/cli/commands/internal/archive.js";
import { writeState, createInitialState } from "../../../src/cli/utils/state.js";

describe("alloy _archive", () => {
  let tmpDir: string;
  let changeDir: string;
  let changeName: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-archive-test-${Date.now()}`);
    changeName = "test-change";
    changeDir = join(tmpDir, `openspec/changes/${changeName}`);
    await mkdir(changeDir, { recursive: true });
    // 模拟 git 仓库
    await mkdir(join(tmpDir, ".git"), { recursive: true });
    execSyncMock.mockReset();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("调用 openspec archive CLI 完成归档 + 校验通过", async () => {
    // setup: change 含 specs/cli-greeting/spec.md
    await mkdir(join(changeDir, "specs/cli-greeting"), { recursive: true });
    await writeFile(join(changeDir, "specs/cli-greeting/spec.md"), "# spec", "utf-8");

    // 模拟 openspec archive CLI 已完成目录移动 + spec sync
    const archiveDir = join(tmpDir, `openspec/changes/archive/${new Date().toISOString().slice(0, 10)}-${changeName}`);
    await mkdir(archiveDir, { recursive: true });
    await mkdir(join(archiveDir, "specs/cli-greeting"), { recursive: true });
    await writeFile(join(archiveDir, "specs/cli-greeting/spec.md"), "# spec", "utf-8");
    await mkdir(join(tmpDir, "openspec/specs/cli-greeting"), { recursive: true });
    await writeFile(join(tmpDir, "openspec/specs/cli-greeting/spec.md"), "# spec", "utf-8");

    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("openspec archive")) {
        return "";
      }
      if (cmd.includes("git rev-parse --show-toplevel")) {
        return tmpDir;
      }
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await archiveCommand([changeDir]);

    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/^openspec archive\s/),
      expect.anything()
    );
    // 验证自动传 -y（agent 非交互，openspec archive CLI 不应有确认提示）
    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/openspec archive\s+\S+(\s+--skip-specs)?\s+-y/),
      expect.anything()
    );
    expect(exitSpy).not.toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("openspec archive CLI 失败时 PRECONDITION_FAIL", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("openspec archive")) {
        throw new Error("openspec archive failed: spec sync error");
      }
      if (cmd.includes("git rev-parse --show-toplevel")) {
        return tmpDir;
      }
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await archiveCommand([changeDir]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("PRECONDITION_FAIL"))).toBe(true);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("openspec archive CLI 失败"))).toBe(true);

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("archive 目录不存在时 PRECONDITION_FAIL（agent 自行 mkdir/cp/mv 模拟会被拦）", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("openspec archive")) {
        return "";
      }
      if (cmd.includes("git rev-parse --show-toplevel")) {
        return tmpDir;
      }
      return "";
    });

    // 不创建 archive 目录——模拟 agent 跳过 CLI 后 archive 目录不存在

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await archiveCommand([changeDir]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("PRECONDITION_FAIL"))).toBe(true);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("归档目录不存在"))).toBe(true);

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("主 spec 未 promote 时 PRECONDITION_FAIL", async () => {
    // setup: change 含 specs/cli-greeting/，mock CLI 成功 + archive 目录存在但主 spec 未写入
    await mkdir(join(changeDir, "specs/cli-greeting"), { recursive: true });
    await writeFile(join(changeDir, "specs/cli-greeting/spec.md"), "# spec", "utf-8");

    const archiveDir = join(tmpDir, `openspec/changes/archive/${new Date().toISOString().slice(0, 10)}-${changeName}`);
    await mkdir(join(archiveDir, "specs/cli-greeting"), { recursive: true });
    await writeFile(join(archiveDir, "specs/cli-greeting/spec.md"), "# spec", "utf-8");
    // 不创建 openspec/specs/cli-greeting/ —— 主 spec 缺失

    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("openspec archive")) {
        return "";
      }
      if (cmd.includes("git rev-parse --show-toplevel")) {
        return tmpDir;
      }
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await archiveCommand([changeDir]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("PRECONDITION_FAIL"))).toBe(true);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("Delta Spec 未 promote"))).toBe(true);

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("change 无 specs/ 目录时跳过 spec sync 校验（spec-less change）", async () => {
    // change 不含 specs/ 目录
    const archiveDir = join(tmpDir, `openspec/changes/archive/${new Date().toISOString().slice(0, 10)}-${changeName}`);
    await mkdir(archiveDir, { recursive: true });
    // archive 目录下也无 specs/（spec-less change）

    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("openspec archive")) {
        return "";
      }
      if (cmd === "git rev-parse --show-toplevel") {
        return tmpDir;
      }
      if (cmd === "git rev-parse --git-dir" || cmd === "git rev-parse --git-common-dir") {
        return ".git";
      }
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await archiveCommand([changeDir]);

    // 验证调用了 openspec archive CLI 且加了 --skip-specs + -y
    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/^openspec archive\s+\S+\s+--skip-specs\s+-y/),
      expect.anything()
    );
    expect(exitSpy).not.toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("在 worktree 内执行时 PRECONDITION_FAIL(归档变更会落在 worktree 分支)", async () => {
    // mock:git-dir 与 git-common-dir 不同 -> 在 worktree 内
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd === "git rev-parse --show-toplevel") {
        return tmpDir;
      }
      if (cmd === "git rev-parse --git-dir") {
        return join(tmpDir, ".git", "worktrees", "foo");
      }
      if (cmd === "git rev-parse --git-common-dir") {
        return join(tmpDir, ".git");
      }
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await archiveCommand([changeDir]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("PRECONDITION_FAIL"))).toBe(true);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("worktree 内"))).toBe(true);
    // 验证未调用 openspec archive CLI(防御检查在 CLI 之前)
    expect(execSyncMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/^openspec archive\s/),
      expect.anything()
    );

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("worktree 未清理时 PRECONDITION_FAIL(worktree 分支变更未合入 feature)", async () => {
    // 写 .alloy.yaml:worktree 非 null,worktree_merged_at 为 null
    const state = createInitialState();
    state.phase = "applying";
    state.worktree = ".worktrees/test-change";
    state.worktree_branch = "worktree-test-change";
    state.worktree_created_at = "2026-07-14 14:00:00";
    state.worktree_merged_at = null;
    await writeState(changeDir, state);

    // mock:不在 worktree 内(git-dir == git-common-dir),通过检查 1
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd === "git rev-parse --show-toplevel") {
        return tmpDir;
      }
      if (cmd === "git rev-parse --git-dir" || cmd === "git rev-parse --git-common-dir") {
        return ".git";
      }
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await archiveCommand([changeDir]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("PRECONDITION_FAIL"))).toBe(true);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("worktree 未清理"))).toBe(true);
    expect(execSyncMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/^openspec archive\s/),
      expect.anything()
    );

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("worktree 已清理时通过防御检查(worktree_merged_at 非 null)", async () => {
    // 写 .alloy.yaml:worktree 非 null,worktree_merged_at 非 null(已清理)
    const state = createInitialState();
    state.phase = "archiving";
    state.worktree = ".worktrees/test-change";
    state.worktree_branch = "worktree-test-change";
    state.worktree_created_at = "2026-07-14 14:00:00";
    state.worktree_merged_at = "2026-07-14 15:00:00";
    await writeState(changeDir, state);

    // mock:不在 worktree 内
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("openspec archive")) {
        return "";
      }
      if (cmd === "git rev-parse --show-toplevel") {
        return tmpDir;
      }
      if (cmd === "git rev-parse --git-dir" || cmd === "git rev-parse --git-common-dir") {
        return ".git";
      }
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await archiveCommand([changeDir]);

    // 验证调用了 openspec archive CLI(说明防御检查通过)
    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/^openspec archive\s/),
      expect.anything()
    );
    // 验证错误信息不是"worktree 未清理"(可能是"归档目录不存在"因为没创建 archive 目录)
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("worktree 未清理"))).toBe(false);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("worktree 内"))).toBe(false);

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("无 worktree 的 change 通过防御检查(worktree 字段为 null)", async () => {
    // 写 .alloy.yaml:worktree 为 null(从未用 worktree)
    const state = createInitialState();
    state.phase = "archiving";
    state.worktree = null;
    state.worktree_merged_at = null;
    await writeState(changeDir, state);

    // mock:不在 worktree 内
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("openspec archive")) {
        return "";
      }
      if (cmd === "git rev-parse --show-toplevel") {
        return tmpDir;
      }
      if (cmd === "git rev-parse --git-dir" || cmd === "git rev-parse --git-common-dir") {
        return ".git";
      }
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await archiveCommand([changeDir]);

    // 验证调用了 openspec archive CLI(说明防御检查通过)
    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/^openspec archive\s/),
      expect.anything()
    );
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("worktree 未清理"))).toBe(false);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("worktree 内"))).toBe(false);

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("worktree=skipped 时通过防御检查(Pi 不支持 worktree / 用户选跳过,不检查 worktree_merged_at)", async () => {
    // 写 .alloy.yaml:worktree=skipped,worktree_merged_at 为 null(Pi 下正常状态)
    const state = createInitialState();
    state.phase = "archiving";
    state.worktree = "skipped";
    state.worktree_merged_at = null;
    await writeState(changeDir, state);

    // 预创建归档目录(模拟 openspec archive CLI 成功移动目录)
    const today = new Date().toISOString().slice(0, 10);
    const archiveDir = join(tmpDir, `openspec/changes/archive/${today}-test-change`);
    await mkdir(archiveDir, { recursive: true });

    // mock:不在 worktree 内
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("openspec archive")) {
        return "";
      }
      if (cmd === "git rev-parse --show-toplevel") {
        return tmpDir;
      }
      if (cmd === "git rev-parse --git-dir" || cmd === "git rev-parse --git-common-dir") {
        return ".git";
      }
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await archiveCommand([changeDir]);

    // 验证调用了 openspec archive CLI(说明防御检查通过,未误触发 worktree 未清理)
    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/^openspec archive\s/),
      expect.anything()
    );
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("worktree 未清理"))).toBe(false);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("worktree 内"))).toBe(false);
    // 验证输出了 ARCHIVE_DIR 引导行(供 agent 可靠解析归档路径)
    expect(logSpy.mock.calls.some(c => String(c[0]).includes("-> ARCHIVE_DIR="))).toBe(true);

    exitSpy.mockRestore();
    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("兜底:agent 跳过 Step 1 _phase start 时,archive 后自动写 started_at + phase=archiving", async () => {
    // setup:archive 目录存在 + 主 spec 已 promote + archiveDir 有 .alloy.yaml(phase=applied,无 started_at)
    const archiveDir = join(tmpDir, `openspec/changes/archive/${new Date().toISOString().slice(0, 10)}-${changeName}`);
    await mkdir(archiveDir, { recursive: true });
    // 模拟 agent 跳过 Step 1:_phase start 未执行,phase=applied,无 archive.started_at
    const state = createInitialState();
    state.phase = "applied" as typeof state.phase;
    await writeState(archiveDir, state);

    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("openspec archive")) return "";
      if (cmd.includes("git rev-parse --show-toplevel")) return tmpDir;
      if (cmd === "git rev-parse --git-dir") return join(tmpDir, ".git");
      if (cmd === "git rev-parse --git-common-dir") return join(tmpDir, ".git");
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await archiveCommand([changeDir]);

    // 验证兜底写入
    expect(logSpy.mock.calls.some(c => String(c[0]).includes("兜底:archive phase started_at + phase=archiving 已写入"))).toBe(true);
    // 读回 .alloy.yaml 验证
    const { readState } = await import("../../../src/cli/utils/state.js");
    const writtenState = await readState(archiveDir);
    expect(writtenState.phase).toBe("archiving");
    expect(writtenState.phase_timings?.archive?.started_at).toBeTruthy();

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("兜底幂等:agent 按流程执行 Step 1 后,archive 不重复写 started_at", async () => {
    // setup:archiveDir 有 .alloy.yaml(phase=archiving,started_at 已存在)
    const archiveDir = join(tmpDir, `openspec/changes/archive/${new Date().toISOString().slice(0, 10)}-${changeName}`);
    await mkdir(archiveDir, { recursive: true });
    const state = createInitialState();
    state.phase = "archiving" as typeof state.phase;
    const existingStartedAt = "2026-07-18 10:00:00";
    state.phase_timings = {
      ...state.phase_timings,
      archive: { started_at: existingStartedAt, completed_at: null },
    } as typeof state.phase_timings;
    await writeState(archiveDir, state);

    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("openspec archive")) return "";
      if (cmd.includes("git rev-parse --show-toplevel")) return tmpDir;
      if (cmd === "git rev-parse --git-dir") return join(tmpDir, ".git");
      if (cmd === "git rev-parse --git-common-dir") return join(tmpDir, ".git");
      return "";
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await archiveCommand([changeDir]);

    // 验证未触发兜底写入(started_at 已存在 + phase 已是 archiving)
    expect(logSpy.mock.calls.some(c => String(c[0]).includes("兜底:archive phase started_at"))).toBe(false);
    // started_at 不被覆盖
    const { readState } = await import("../../../src/cli/utils/state.js");
    const writtenState = await readState(archiveDir);
    expect(writtenState.phase_timings?.archive?.started_at).toBe(existingStartedAt);

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });
});
