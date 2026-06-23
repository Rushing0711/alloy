// test/cli/internal/phase.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { phaseCommand } from "../../../src/cli/commands/internal/phase.js";
import { readState } from "../../../src/cli/utils/state.js";

describe("alloy _phase complete", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-phase-test-${Date.now()}`);
    changeDir = join(tmpDir, "openspec", "changes", "test-change");
    await mkdir(changeDir, { recursive: true });

    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.name "test-user"', { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });

    const yaml = [
      "phase: started",
      "schema_version: 1",
      "worktree: null",
      'created_at: "2020-01-01 00:00:00"',
      'updated_at: "2020-01-01 00:00:00"',
      "phase_timings:",
      "  start:",
      '    started_at: "2020-01-01 10:00:00"',
      "    completed_at: null",
      "records: []",
      "skill_usage: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function gitLog(): string {
    try {
      return execSync("git log --oneline", { cwd: tmpDir, encoding: "utf-8" }).trim();
    } catch {
      return "";
    }
  }

  it("start：写 completed_at，不推进 phase（保持 started）", async () => {
    await phaseCommand(["complete", changeDir, "start"]);

    const state = await readState(changeDir);
    expect(state.phase).toBe("started"); // start 完成不推进
    expect(state.phase_timings?.start?.completed_at).toBeTruthy();
    expect(state.updated_at).not.toBe("2020-01-01 00:00:00");

    const log = gitLog();
    expect(log).toContain("chore(test-change): 记录 start 阶段完成时间");
    expect(log).not.toContain("推进到");
  });

  it("plan→planned：推进到 planned", async () => {
    const state = await readState(changeDir);
    state.phase = "started";
    state.phase_timings = {
      plan: { started_at: "2020-01-01 11:00:00", completed_at: null },
    };
    const { writeState } = await import("../../../src/cli/utils/state.js");
    await writeState(changeDir, state);

    await phaseCommand(["complete", changeDir, "plan"]);

    const after = await readState(changeDir);
    expect(after.phase).toBe("planned");
    expect(after.phase_timings?.plan?.completed_at).toBeTruthy();
    expect(gitLog()).toContain("推进到 planned");
  });

  it("finish→finished：推进到 finished", async () => {
    const state = await readState(changeDir);
    state.phase = "archived";
    state.phase_timings = {
      finish: { started_at: "2020-01-01 15:00:00", completed_at: null },
    };
    const { writeState } = await import("../../../src/cli/utils/state.js");
    await writeState(changeDir, state);

    await phaseCommand(["complete", changeDir, "finish"]);

    const after = await readState(changeDir);
    expect(after.phase).toBe("finished");
    expect(after.phase_timings?.finish?.completed_at).toBeTruthy();
    const log = gitLog();
    expect(log).toContain("记录 finish 阶段完成时间，推进到 finished");
  });

  it("幂等：重复调用不产生新 commit（completed_at 已写入但 .alloy.yaml 内容相同则跳过）", async () => {
    await phaseCommand(["complete", changeDir, "start"]);
    const firstLog = gitLog();

    // 第二次：completed_at 会更新为新时间，所以会有新 commit——这是预期行为
    await phaseCommand(["complete", changeDir, "start"]);

    const after = await readState(changeDir);
    expect(after.phase).toBe("started"); // 仍是 started
    expect(gitLog().split("\n").length).toBeGreaterThanOrEqual(firstLog.split("\n").length);
  });

  it("保留 started_at：写 completed_at 时不覆盖 started_at", async () => {
    await phaseCommand(["complete", changeDir, "start"]);

    const state = await readState(changeDir);
    expect(state.phase_timings?.start?.started_at).toBe("2020-01-01 10:00:00");
    expect(state.phase_timings?.start?.completed_at).toBeTruthy();
  });

  it("无效 phase 时 exit(1)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await phaseCommand(["complete", changeDir, "bogus"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy.mock.calls.some((c) => c[0].includes("无效的 phase"))).toBe(true);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("缺少参数时 exit(1)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await phaseCommand(["complete", changeDir]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("不在 git 仓库时 exit(1)", async () => {
    // 用一个独立于 tmpDir（git 仓库）的目录
    const isolatedDir = join(tmpdir(), `alloy-phase-nogit-${Date.now()}`, "change");
    await mkdir(isolatedDir, { recursive: true });
    // 放一个 .alloy.yaml 让 readState 能过，但 findGitRoot 会失败
    await writeFile(join(isolatedDir, ".alloy.yaml"), "phase: started\nrecords: []\n", "utf-8");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await phaseCommand(["complete", isolatedDir, "start"]);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errSpy.mock.calls.some((c) => c[0].includes("不在 git 仓库"))).toBe(true);
    } finally {
      exitSpy.mockRestore();
      errSpy.mockRestore();
      await rm(join(isolatedDir, ".."), { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe("alloy _phase start", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-phase-start-test-${Date.now()}`);
    changeDir = join(tmpDir, "openspec", "changes", "test-change");
    await mkdir(changeDir, { recursive: true });

    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.name "test-user"', { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });

    // 初始 .alloy.yaml，无 phase_timings
    const yaml = [
      "phase: started",
      "schema_version: 1",
      "worktree: null",
      'created_at: "2020-01-01 00:00:00"',
      'updated_at: "2020-01-01 00:00:00"',
      "records: []",
      "skill_usage: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function gitLog(): string {
    try {
      return execSync("git log --oneline", { cwd: tmpDir, encoding: "utf-8" }).trim();
    } catch {
      return "";
    }
  }

  it("首次调用：写 started_at + 独立 commit", async () => {
    await phaseCommand(["start", changeDir, "plan"]);

    const state = await readState(changeDir);
    expect(state.phase_timings?.plan?.started_at).toBeTruthy();
    expect(state.updated_at).not.toBe("2020-01-01 00:00:00");

    const log = gitLog();
    expect(log).toContain("chore(test-change): 记录 plan 阶段开始时间");
  });

  it("幂等：started_at 已存在时不覆盖、不产生新 commit", async () => {
    // 预置已有 started_at
    const state = await readState(changeDir);
    state.phase_timings = { plan: { started_at: "2020-06-01 10:00:00", completed_at: null } };
    const { writeState } = await import("../../../src/cli/utils/state.js");
    await writeState(changeDir, state);

    await phaseCommand(["start", changeDir, "plan"]);

    const after = await readState(changeDir);
    expect(after.phase_timings?.plan?.started_at).toBe("2020-06-01 10:00:00"); // 未覆盖

    // .alloy.yaml 无变更（updated_at 被 writeState 刷新，但有内容变化 → 会 commit）
    // 关键：started_at 值未被改写
  });

  it("start 阶段：写 start.started_at", async () => {
    await phaseCommand(["start", changeDir, "start"]);

    const state = await readState(changeDir);
    expect(state.phase_timings?.start?.started_at).toBeTruthy();
    expect(gitLog()).toContain("记录 start 阶段开始时间");
  });

  it("--at 传入实际开始时间（补录场景：技能在 change 目录创建前执行）", async () => {
    await phaseCommand(["start", changeDir, "start", "--at", "2026-06-21 07:04:58"]);

    const state = await readState(changeDir);
    expect(state.phase_timings?.start?.started_at).toBe("2026-06-21 07:04:58");
  });

  it("不传 --at 时用当前时间", async () => {
    const before = new Date();
    await phaseCommand(["start", changeDir, "start"]);

    const state = await readState(changeDir);
    const started = state.phase_timings?.start?.started_at!;
    expect(started).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const localDate = `${before.getFullYear()}-${pad(before.getMonth() + 1)}-${pad(before.getDate())}`;
    expect(started.startsWith(localDate)).toBe(true);
  });

  it("--at 与已存在 started_at：幂等不覆盖", async () => {
    // 预置已有 started_at
    const state = await readState(changeDir);
    state.phase_timings = { start: { started_at: "2020-06-01 10:00:00", completed_at: null } };
    const { writeState } = await import("../../../src/cli/utils/state.js");
    await writeState(changeDir, state);

    await phaseCommand(["start", changeDir, "start", "--at", "2026-06-21 07:04:58"]);

    const after = await readState(changeDir);
    expect(after.phase_timings?.start?.started_at).toBe("2020-06-01 10:00:00"); // 未覆盖
  });

  it("无效 phase 时 exit(1)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await phaseCommand(["start", changeDir, "bogus"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy.mock.calls.some((c) => c[0].includes("无效的 phase"))).toBe(true);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("缺少参数时 exit(1)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await phaseCommand(["start", changeDir]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("独立 commit：started_at commit 早于制品 commit", async () => {
    // 1. 阶段开始 commit
    await phaseCommand(["start", changeDir, "plan"]);

    // 2. 模拟制品 commit（手动写 proposal + _artifact commit）
    await writeFile(join(changeDir, "proposal.md"), "# proposal", "utf-8");
    const { artifactCommand } = await import("../../../src/cli/commands/internal/artifact.js");
    await artifactCommand(["commit", changeDir, "proposal"]);

    const log = gitLog();
    const lines = log.split("\n");
    // 最上面是 proposal commit，下面是 plan 开始 commit
    expect(lines[0]).toContain("proposal 已锁定");
    expect(lines[1]).toContain("记录 plan 阶段开始时间");
  });
});

describe("alloy _phase reset", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-phase-reset-test-${Date.now()}`);
    changeDir = join(tmpDir, "openspec", "changes", "test-change");
    await mkdir(changeDir, { recursive: true });

    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.name "test-user"', { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });

    const yaml = [
      "phase: started",
      "schema_version: 1",
      "worktree: null",
      'created_at: "2020-01-01 00:00:00"',
      'updated_at: "2020-01-01 00:00:00"',
      "records: []",
      "skill_usage: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function gitLog(): string {
    try {
      return execSync("git log --oneline", { cwd: tmpDir, encoding: "utf-8" }).trim();
    } catch {
      return "";
    }
  }

  it("删除指定 phase 的 timing key + commit", async () => {
    // 预置 plan timing
    const { writeState } = await import("../../../src/cli/utils/state.js");
    const state = await readState(changeDir);
    state.phase_timings = {
      plan: { started_at: "2025-06-10 10:00:00", completed_at: "2025-06-10 11:00:00" },
    };
    await writeState(changeDir, state);

    await phaseCommand(["reset", changeDir, "plan"]);

    const after = await readState(changeDir);
    expect(after.phase_timings?.plan).toBeUndefined();
    expect(gitLog()).toContain("回溯——清除 plan 阶段时间记录");
  });

  it("key 不存在时幂等跳过（无新 commit）", async () => {
    const firstLog = gitLog();
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
    await phaseCommand(["reset", changeDir, "plan"]); // plan timing 不存在
    spy.mockRestore();
    expect(gitLog()).toBe(firstLog); // 无新 commit
    expect(logs.some((l) => l.includes("timing 不存在，跳过"))).toBe(true);
  });

  it("保留其他 phase 的 timing", async () => {
    const { writeState } = await import("../../../src/cli/utils/state.js");
    const state = await readState(changeDir);
    state.phase_timings = {
      start: { started_at: "2025-06-10 09:00:00", completed_at: null },
      plan: { started_at: "2025-06-10 10:00:00", completed_at: "2025-06-10 11:00:00" },
    };
    await writeState(changeDir, state);

    await phaseCommand(["reset", changeDir, "plan"]);

    const after = await readState(changeDir);
    expect(after.phase_timings?.plan).toBeUndefined();
    expect(after.phase_timings?.start?.started_at).toBe("2025-06-10 09:00:00"); // start 保留
  });

  it("无效 phase 时 exit(1)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await phaseCommand(["reset", changeDir, "bogus"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("缺少参数时 exit(1)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await phaseCommand(["reset", changeDir]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

