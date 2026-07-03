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
    const archiveDir = join(tmpDir, `openspec/changes/archive/2026-07-03-${changeName}`);
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

    const archiveDir = join(tmpDir, `openspec/changes/archive/2026-07-03-${changeName}`);
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
    const archiveDir = join(tmpDir, `openspec/changes/archive/2026-07-03-${changeName}`);
    await mkdir(archiveDir, { recursive: true });
    // archive 目录下也无 specs/（spec-less change）

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

    // 验证调用了 openspec archive CLI 且加了 --skip-specs + -y
    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/^openspec archive\s+\S+\s+--skip-specs\s+-y/),
      expect.anything()
    );
    expect(exitSpy).not.toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});
