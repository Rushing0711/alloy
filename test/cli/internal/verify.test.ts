// test/cli/internal/verify.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const readStateMock = vi.fn();
vi.mock("../../../src/cli/utils/state.js", () => ({
  readState: (...args: unknown[]) => readStateMock(...args),
}));

import { verifyCommand } from "../../../src/cli/commands/internal/verify.js";

describe("alloy _verify", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-verify-test-${Date.now()}`);
    changeDir = join(tmpDir, "test-change");
    await mkdir(changeDir, { recursive: true });
    readStateMock.mockReset();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("未知子命令时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await verifyCommand(["unknown"]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("用法"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("缺少 phase / change-dir 时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await verifyCommand(["phase-enter"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("未知阶段时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await verifyCommand(["phase-enter", "unknown-phase", changeDir]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("未知阶段校验"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("change 目录不存在时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await verifyCommand(["phase-enter", "start", "/nonexistent/path"]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("change 目录不存在"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("state 读取失败时 exit 1", async () => {
    readStateMock.mockRejectedValue(new Error("read failed"));
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await verifyCommand(["phase-enter", "start", changeDir]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("无法读取 state"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("start-exit 校验通过(draft + state 字段齐全)", async () => {
    await writeFile(join(changeDir, "draft.md"), "# draft\n", "utf-8");
    readStateMock.mockResolvedValue({
      phase: "started",
      feature_branch: "feature/test",
      worktree: null,
      started_at: "2026-07-05 10:00:00",
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await verifyCommand(["phase-exit", "start", changeDir]);

    expect(logSpy.mock.calls.some(c => String(c[0]).includes("校验通过"))).toBe(true);
    logSpy.mockRestore();
  });

  it("start-exit 校验失败(缺 draft.md)", async () => {
    readStateMock.mockResolvedValue({
      phase: "started",
      feature_branch: "feature/test",
      worktree: null,
      started_at: "2026-07-05 10:00:00",
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await verifyCommand(["phase-exit", "start", changeDir]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("draft") && String(c[0]).includes("文件不存在"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("start-exit 校验失败(phase 不匹配)", async () => {
    await writeFile(join(changeDir, "draft.md"), "# draft\n", "utf-8");
    readStateMock.mockResolvedValue({
      phase: "planned", // 期望 started
      feature_branch: "feature/test",
      worktree: null,
      started_at: "2026-07-05 10:00:00",
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await verifyCommand(["phase-exit", "start", changeDir]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("phase 不匹配"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("start-exit 校验失败(state 字段缺失)", async () => {
    await writeFile(join(changeDir, "draft.md"), "# draft\n", "utf-8");
    readStateMock.mockResolvedValue({
      phase: "started",
      feature_branch: null, // 缺失
      worktree: null,
      started_at: "2026-07-05 10:00:00",
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await verifyCommand(["phase-exit", "start", changeDir]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("feature_branch"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("archive-exit 校验失败(目录位置错误)", async () => {
    // changeDir 不在 archive/ 下
    readStateMock.mockResolvedValue({
      phase: "archived",
      phase_timings: {
        archive: { started_at: "2026-07-05 10:00:00", completed_at: "2026-07-05 11:00:00" },
      },
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await verifyCommand(["phase-exit", "archive", changeDir]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("目录位置错误"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("archive-exit 校验通过(在 archive/ 下)", async () => {
    // 创建 archive/2026-07-05-test/ 结构
    const archiveChangeDir = join(tmpDir, "archive", "2026-07-05-test");
    await mkdir(archiveChangeDir, { recursive: true });
    readStateMock.mockResolvedValue({
      phase: "archived",
      phase_timings: {
        archive: { started_at: "2026-07-05 10:00:00", completed_at: "2026-07-05 11:00:00" },
      },
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await verifyCommand(["phase-exit", "archive", archiveChangeDir]);

    expect(logSpy.mock.calls.some(c => String(c[0]).includes("校验通过"))).toBe(true);
    logSpy.mockRestore();
  });

  it("finish-exit 校验通过(phase=finished + completed_at + 目录在 archive/)", async () => {
    const archiveChangeDir = join(tmpDir, "archive", "2026-07-05-test");
    await mkdir(archiveChangeDir, { recursive: true });
    readStateMock.mockResolvedValue({
      phase: "finished",
      completed_at: "2026-07-05 12:00:00",
      phase_timings: {
        finish: { started_at: "2026-07-05 11:00:00", completed_at: "2026-07-05 12:00:00" },
      },
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await verifyCommand(["phase-exit", "finish", archiveChangeDir]);

    expect(logSpy.mock.calls.some(c => String(c[0]).includes("校验通过"))).toBe(true);
    logSpy.mockRestore();
  });
});
