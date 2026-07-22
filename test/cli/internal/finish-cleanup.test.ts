// test/cli/internal/finish-cleanup.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execSyncMock = vi.fn();
vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => execSyncMock(...args),
}));

const readStateMock = vi.fn();
const readProjectConfigMock = vi.fn();
vi.mock("../../../src/cli/utils/state.js", () => ({
  readState: (...args: unknown[]) => readStateMock(...args),
  readProjectConfig: (...args: unknown[]) => readProjectConfigMock(...args),
}));

import { finishCleanupCommand } from "../../../src/cli/commands/internal/finish-cleanup.js";

const CHANGE_DIR = "/tmp/test-change";
const FEATURE_BRANCH = "feature/add-hello-script";
const MAIN_BRANCH = "main";

describe("alloy _finish-cleanup", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-finish-cleanup-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    execSyncMock.mockReset();
    readStateMock.mockReset();
    readProjectConfigMock.mockReset();
    readStateMock.mockResolvedValue({});
    readProjectConfigMock.mockResolvedValue({ alloy: { main_branch: MAIN_BRANCH } });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("缺少参数时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await finishCleanupCommand([]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("用法"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("feature-branch 模板占位符未替换 -> PRECONDITION_FAIL", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await finishCleanupCommand([CHANGE_DIR, "<feature_branch>"]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("feature-branch 变量未替换"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("feature-branch 等于 main -> PRECONDITION_FAIL(防误删主分支)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await finishCleanupCommand([CHANGE_DIR, "main"]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("与主分支同名"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("feature-branch 等于 master -> PRECONDITION_FAIL", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await finishCleanupCommand([CHANGE_DIR, "master"]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("与主分支同名"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("feature 分支不存在 -> PRECONDITION_FAIL", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("git rev-parse --verify")) {
        throw new Error("unknown revision");
      }
      return "";
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await finishCleanupCommand([CHANGE_DIR, FEATURE_BRANCH]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("feature 分支") && String(c[0]).includes("不存在"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("当前不在 main 分支 -> PRECONDITION_FAIL", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("git rev-parse --verify")) return "abc123\n";
      if (cmd === "git branch --show-current") return "feature/other\n";
      return "";
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await finishCleanupCommand([CHANGE_DIR, FEATURE_BRANCH]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("当前分支") && String(c[0]).includes("main 分支"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("main 最近 commit 不含 squash merge 痕迹 -> PRECONDITION_FAIL", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("git rev-parse --verify")) return "abc123\n";
      if (cmd === "git branch --show-current") return MAIN_BRANCH + "\n";
      if (cmd === `git log ${MAIN_BRANCH} --oneline -5`) {
        return "def456 feat: some other commit\nabc123 initial commit\n";
      }
      return "";
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await finishCleanupCommand([CHANGE_DIR, FEATURE_BRANCH]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("squash merge 痕迹"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("所有校验通过 -> 执行 git branch -D,输出成功", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("git rev-parse --verify")) return "abc123\n";
      if (cmd === "git branch --show-current") return MAIN_BRANCH + "\n";
      if (cmd === `git log ${MAIN_BRANCH} --oneline -5`) {
        return `def456 chore(add-hello-script): 合入 main（squash merge）\nabc123 initial\n`;
      }
      if (cmd === `git branch -D "${FEATURE_BRANCH}"`) return `Deleted branch ${FEATURE_BRANCH}\n`;
      return "";
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await finishCleanupCommand([CHANGE_DIR, FEATURE_BRANCH]);

    expect(execSyncMock).toHaveBeenCalledWith(`git branch -D "${FEATURE_BRANCH}"`, expect.anything());
    expect(logSpy.mock.calls.some(c => String(c[0]).includes("已删除 feature 分支"))).toBe(true);
    logSpy.mockRestore();
  });

  it("git branch -D 执行失败 -> HARD_FAIL", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("git rev-parse --verify")) return "abc123\n";
      if (cmd === "git branch --show-current") return MAIN_BRANCH + "\n";
      if (cmd === `git log ${MAIN_BRANCH} --oneline -5`) {
        return `def456 chore: 合入 main（squash merge）\nabc123 initial\n`;
      }
      if (cmd === `git branch -D "${FEATURE_BRANCH}"`) {
        throw Object.assign(new Error("fail"), {
          stderr: Buffer.from("error: branch not found"),
        });
      }
      return "";
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await finishCleanupCommand([CHANGE_DIR, FEATURE_BRANCH]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("git branch -D") && String(c[0]).includes("失败"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});
