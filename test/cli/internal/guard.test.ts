// test/cli/internal/guard.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { mockExecSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
}));
vi.mock("node:child_process", () => ({
  execSync: mockExecSync,
}));

import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { guardCommand } from "../../../src/cli/commands/internal/guard.js";
import { readState } from "../../../src/cli/utils/state.js";

describe("alloy _guard", () => {
  let tmpDir: string;
  let changeDir: string;

  async function setupState(phase: string) {
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      `phase: ${phase}`,
      'updated_at: "2020-01-01T00:00:00"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
  }

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-guard-test-${Date.now()}`);
    changeDir = join(tmpDir, "test-change");
    await mkdir(changeDir, { recursive: true });
    await setupState("started");
    // 默认：模拟无 git 仓库（与 temp dir 行为一致）
    mockExecSync.mockImplementation(() => {
      throw new Error("git not available");
    });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  // valid transitions
  it("started→planned 所有制品齐全时通过", async () => {
    await writeFile(join(changeDir, "proposal.md"), "");
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plans.md"), "");
    await mkdir(join(changeDir, "specs"));
    await guardCommand([changeDir, "planned", "--apply"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("planned");
  });

  it("planned→applied plans.md 存在时通过", async () => {
    await setupState("planned");
    await writeFile(join(changeDir, "plans.md"), "");
    await guardCommand([changeDir, "applied", "--apply"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("applied");
  });

  it("applied→archived verify.md 存在时通过", async () => {
    await setupState("applied");
    await writeFile(join(changeDir, "verify.md"), "");
    await guardCommand([changeDir, "archived", "--apply"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("archived");
  });

  it("archived→finished retrospective.md 存在时通过", async () => {
    await setupState("archived");
    await writeFile(join(changeDir, "retrospective.md"), "");
    await guardCommand([changeDir, "finished", "--apply"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("finished");
  });

  // invalid transitions
  it("started→applied 越级转换被拒绝", async () => {
    await expect(
      guardCommand([changeDir, "applied"])
    ).rejects.toThrow();
  });

  it("started→archived 跳多级被拒绝", async () => {
    await expect(
      guardCommand([changeDir, "archived"])
    ).rejects.toThrow();
  });

  it("planned→finished 被拒绝", async () => {
    await setupState("planned");
    await expect(
      guardCommand([changeDir, "finished"])
    ).rejects.toThrow();
  });

  // missing artifacts
  it("started→planned proposal.md 缺失被阻断", async () => {
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plans.md"), "");
    await mkdir(join(changeDir, "specs"));
    await expect(
      guardCommand([changeDir, "planned"])
    ).rejects.toThrow();
  });

  it("started→planned specs/ 缺失被阻断", async () => {
    await writeFile(join(changeDir, "proposal.md"), "");
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plans.md"), "");
    await expect(
      guardCommand([changeDir, "planned"])
    ).rejects.toThrow();
  });

  it("started→planned hash 不匹配时被阻断", async () => {
    await writeFile(join(changeDir, "proposal.md"), "real proposal", "utf-8");
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plans.md"), "");
    await mkdir(join(changeDir, "specs"));
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: started",
      'updated_at: "2020-01-01T00:00:00"',
      "records:",
      "  - artifact: proposal",
      '    hash: "wronghash123"',
      '    committed_at: "2020-01-01T00:00:00"',
      '    approver: "test"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    await expect(
      guardCommand([changeDir, "planned"])
    ).rejects.toThrow();
  });

  it("planned→applied plans.md 缺失被阻断", async () => {
    await setupState("planned");
    await expect(
      guardCommand([changeDir, "applied"])
    ).rejects.toThrow();
  });

  it("planned→applied hash 不匹配时被阻断", async () => {
    await writeFile(join(changeDir, "plans.md"), "real content here");
    // 直接写入带错误 hash 的 .alloy.yaml，绕过 setupState
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: planned",
      'updated_at: "2020-01-01T00:00:00"',
      "records:",
      "  - artifact: plans",
      '    hash: "wronghash123"',
      '    committed_at: "2020-01-01T00:00:00"',
      '    approver: "test"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    await expect(
      guardCommand([changeDir, "applied"])
    ).rejects.toThrow();
  });

  it("applied→archived verify.md 缺失被阻断", async () => {
    await setupState("applied");
    await expect(
      guardCommand([changeDir, "archived"])
    ).rejects.toThrow();
  });

  it("applied→archived hash 不匹配时被阻断", async () => {
    await writeFile(join(changeDir, "verify.md"), "verify content");
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: applied",
      'updated_at: "2020-01-01T00:00:00"',
      "records:",
      "  - artifact: verify",
      '    hash: "wronghash999"',
      '    committed_at: "2020-01-01T00:00:00"',
      '    approver: "test"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    await expect(
      guardCommand([changeDir, "archived"])
    ).rejects.toThrow();
  });

  it("planned→applied hash 匹配时 --apply 成功", async () => {
    const { createHash } = await import("node:crypto");
    const content = "real plans content";
    await writeFile(join(changeDir, "plans.md"), content, "utf-8");
    const hash = createHash("sha256").update(content).digest("hex").substring(0, 12);
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: planned",
      'updated_at: "2020-01-01T00:00:00"',
      "records:",
      `  - artifact: plans`,
      `    hash: "${hash}"`,
      '    committed_at: "2020-01-01T00:00:00"',
      '    approver: "test"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    await guardCommand([changeDir, "applied", "--apply"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("applied");
  });

  it("缺少参数时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await guardCommand([changeDir]); // targetPhase 缺失
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("record 指向不存在的文件时 hash 校验失败", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await writeFile(join(changeDir, "plans.md"), "content", "utf-8");
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: planned",
      'updated_at: "2020-01-01T00:00:00"',
      "records:",
      "  - artifact: tasks",
      '    hash: "def456"',
      '    committed_at: "2020-01-01T00:00:00"',
      '    approver: "test"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    // tasks.md 不存在 → computeArtifactHash 返回 null → mismatches → exit 1
    await guardCommand([changeDir, "applied"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  // git 未提交检查（started→planned）
  it("started→planned change 目录有未提交变更时被阻断", async () => {
    await writeFile(join(changeDir, "proposal.md"), "");
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plans.md"), "");
    await mkdir(join(changeDir, "specs"));

    // 模拟 git 仓库存在但 change 目录有未提交变更
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-parse")) {
        return Buffer.from("/fake/.git");
      }
      if (cmd.includes("status")) {
        return Buffer.from(" M openspec/changes/test-change/draft.md");
      }
      return Buffer.from("");
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await guardCommand([changeDir, "planned"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("started→planned git 仓库干净时通过", async () => {
    await writeFile(join(changeDir, "proposal.md"), "");
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plans.md"), "");
    await mkdir(join(changeDir, "specs"));

    // 模拟 git 仓库干净（status 返回空）
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-parse")) {
        return Buffer.from("/fake/.git");
      }
      if (cmd.includes("status")) {
        return Buffer.from("");
      }
      return Buffer.from("");
    });

    await guardCommand([changeDir, "planned", "--apply"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("planned");
  });

  // 包含 draft 记录的 hash 校验（回归：guard.ts ARTIFACT_FILES 曾遗漏 draft）
  it("started→planned 包含 draft 记录且 hash 匹配时通过", async () => {
    const { createHash } = await import("node:crypto");
    const draftContent = "draft content here";
    await writeFile(join(changeDir, "draft.md"), draftContent, "utf-8");
    await writeFile(join(changeDir, "proposal.md"), "prop");
    await writeFile(join(changeDir, "design.md"), "design");
    await writeFile(join(changeDir, "tasks.md"), "tasks");
    await writeFile(join(changeDir, "plans.md"), "plans");
    await mkdir(join(changeDir, "specs"));
    const draftHash = createHash("sha256").update(draftContent).digest("hex").substring(0, 12);
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: started",
      'updated_at: "2020-01-01T00:00:00"',
      "records:",
      "  - artifact: draft",
      `    hash: "${draftHash}"`,
      '    committed_at: "2020-01-01T00:00:00"',
      '    approver: "test"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    await guardCommand([changeDir, "planned", "--apply"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("planned");
  });

  it("started→planned draft hash 不匹配时被阻断", async () => {
    await writeFile(join(changeDir, "draft.md"), "real draft", "utf-8");
    await writeFile(join(changeDir, "proposal.md"), "");
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plans.md"), "");
    await mkdir(join(changeDir, "specs"));
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: started",
      'updated_at: "2020-01-01T00:00:00"',
      "records:",
      "  - artifact: draft",
      '    hash: "wronghash000"',
      '    committed_at: "2020-01-01T00:00:00"',
      '    approver: "test"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    await expect(
      guardCommand([changeDir, "planned"])
    ).rejects.toThrow();
  });

  // --apply flag behavior
  it("无 --apply 时不修改 phase", async () => {
    await writeFile(join(changeDir, "proposal.md"), "");
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plans.md"), "");
    await mkdir(join(changeDir, "specs"));
    await guardCommand([changeDir, "planned"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("started"); // unchanged
  });

  describe("user-gate", () => {
    it("require 设置 pending_gate", async () => {
      await guardCommand(["user-gate", "require", changeDir, "confirm-main-branch"]);
      const state = await readState(changeDir);
      expect(state.pending_gate).toBe("confirm-main-branch");
    });

    it("require 缺 change-dir -> exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await guardCommand(["user-gate", "require"]);
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("require 缺 gate-id -> exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await guardCommand(["user-gate", "require", changeDir]);
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("pass 清除 pending_gate", async () => {
      await guardCommand(["user-gate", "require", changeDir, "confirm-main-branch"]);
      await guardCommand(["user-gate", "pass", changeDir]);
      const state = await readState(changeDir);
      expect(state.pending_gate).toBeNull();
    });

    it("pass 缺 change-dir -> exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await guardCommand(["user-gate", "pass"]);
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("pass 时 pending_gate 已 null -> 幂等", async () => {
      await guardCommand(["user-gate", "pass", changeDir]);
      const state = await readState(changeDir);
      expect(state.pending_gate).toBeNull();
    });

    it("未知操作 -> exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await guardCommand(["user-gate", "bogus", changeDir]);
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("require 保留 worktree_created_at 引号(精准字段替换,不触发 writeState 全量重写)", async () => {
      // 模拟 agent 手动加引号的 worktree_created_at(agent edit 加引号,yaml 库序列化不加)
      // user-gate require 用 setPendingGate 精准替换 pending_gate 行,不动其他字段
      const yaml = [
        'phase: applying',
        'worktree: .worktrees/test-change',
        'feature_branch: feature/test-change',
        'worktree_branch: worktree-test-change',
        'worktree_created_at: "2026-07-17 11:08:41"',
        'worktree_merged_at: null',
        'schema_version: 1',
        'started_at: 2026-07-17 10:32:24',
        'created_at: 2026-07-17 10:34:27',
        'updated_at: "2026-07-17 11:30:07"',
        'pending_gate: null',
      ].join("\n");
      const { writeFile: writeFileSync } = await import("node:fs/promises");
      await writeFileSync(join(changeDir, ".alloy.yaml"), yaml, "utf-8");

      // 设 ALLOY_FORCE_WORKTREE=1 绕过 assertInWorktree 守卫(测试不在真实 worktree 内)
      process.env.ALLOY_FORCE_WORKTREE = "1";
      try {
        await guardCommand(["user-gate", "require", changeDir, "apply:lock-verify"]);
      } finally {
        delete process.env.ALLOY_FORCE_WORKTREE;
      }

      const { readFile: readFileSync } = await import("node:fs/promises");
      const after = await readFileSync(join(changeDir, ".alloy.yaml"), "utf-8");
      // worktree_created_at 引号保留(精准替换不动此字段)
      expect(after).toContain('worktree_created_at: "2026-07-17 11:08:41"');
      // updated_at 引号保留(精准替换不动此字段)
      expect(after).toContain('updated_at: "2026-07-17 11:30:07"');
      // pending_gate 已设为 gate
      expect(after).toMatch(/^pending_gate: apply:lock-verify$/m);
      // 验证 readState 能正确解析
      const state = await readState(changeDir);
      expect(state.pending_gate).toBe("apply:lock-verify");
      expect(state.worktree_created_at).toBe("2026-07-17 11:08:41");
    });

    it("pass 保留 worktree_created_at 引号(精准字段替换)", async () => {
      const yaml = [
        'phase: applying',
        'worktree: .worktrees/test-change',
        'feature_branch: feature/test-change',
        'worktree_branch: worktree-test-change',
        'worktree_created_at: "2026-07-17 11:08:41"',
        'worktree_merged_at: null',
        'schema_version: 1',
        'started_at: 2026-07-17 10:32:24',
        'created_at: 2026-07-17 10:34:27',
        'updated_at: "2026-07-17 11:30:07"',
        'pending_gate: apply:lock-verify',
      ].join("\n");
      const { writeFile: writeFileSync } = await import("node:fs/promises");
      await writeFileSync(join(changeDir, ".alloy.yaml"), yaml, "utf-8");

      process.env.ALLOY_FORCE_WORKTREE = "1";
      try {
        await guardCommand(["user-gate", "pass", changeDir]);
      } finally {
        delete process.env.ALLOY_FORCE_WORKTREE;
      }

      const { readFile: readFileSync } = await import("node:fs/promises");
      const after = await readFileSync(join(changeDir, ".alloy.yaml"), "utf-8");
      expect(after).toContain('worktree_created_at: "2026-07-17 11:08:41"');
      expect(after).toContain('updated_at: "2026-07-17 11:30:07"');
      expect(after).toMatch(/^pending_gate: null$/m);
    });

    it("require 不自动 git commit(pending_gate 作为临时状态,由下一个 _artifact commit 一起 commit)", async () => {
      const calls: string[] = [];
      mockExecSync.mockImplementation((cmd: string) => {
        calls.push(cmd);
        return "";
      });

      process.env.ALLOY_FORCE_WORKTREE = "1";
      try {
        await guardCommand(["user-gate", "require", changeDir, "apply:lock-verify"]);
      } finally {
        delete process.env.ALLOY_FORCE_WORKTREE;
      }

      // 验证不自动 git commit(避免 USER_GATE 独占 commit 噪音)
      expect(calls.some(c => c.startsWith("git commit -m"))).toBe(false);
      expect(calls.some(c => c === "git add .alloy.yaml")).toBe(false);
      // pending_gate 已写入文件(setPendingGate 精准替换)
      const { readFile: readFileSync } = await import("node:fs/promises");
      const after = await readFileSync(join(changeDir, ".alloy.yaml"), "utf-8");
      expect(after).toMatch(/^pending_gate: apply:lock-verify$/m);
    });

    it("Pi 下 apply:worktree-choice 自动通过(不设 pending_gate)", async () => {
      const origPi = process.env.PI_CODING_AGENT;
      process.env.PI_CODING_AGENT = "true";
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await guardCommand(["user-gate", "require", changeDir, "apply:worktree-choice"]);
        // 验证输出"自动通过"提示
        expect(logSpy.mock.calls.some(c => String(c[0]).includes("自动通过"))).toBe(true);
        // 验证输出"走 skipped 路径"引导
        expect(logSpy.mock.calls.some(c => String(c[0]).includes("走 skipped 路径"))).toBe(true);
        // 验证 pending_gate 未设置(undefined 或 null,默认 state 无此字段)
        const state = await readState(changeDir);
        expect(state.pending_gate ?? null).toBeNull();
      } finally {
        if (origPi === undefined) delete process.env.PI_CODING_AGENT;
        else process.env.PI_CODING_AGENT = origPi;
        logSpy.mockRestore();
      }
    });

    it("Pi 下 apply:sdd-ep-choice 自动通过(不设 pending_gate)", async () => {
      const origPi = process.env.PI_CODING_AGENT;
      process.env.PI_CODING_AGENT = "true";
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await guardCommand(["user-gate", "require", changeDir, "apply:sdd-ep-choice"]);
        // 验证输出"自动通过"提示
        expect(logSpy.mock.calls.some(c => String(c[0]).includes("自动通过"))).toBe(true);
        // 验证输出"走 EP 路径"引导
        expect(logSpy.mock.calls.some(c => String(c[0]).includes("走 EP 路径"))).toBe(true);
        // 验证 pending_gate 未设置
        const state = await readState(changeDir);
        expect(state.pending_gate ?? null).toBeNull();
      } finally {
        if (origPi === undefined) delete process.env.PI_CODING_AGENT;
        else process.env.PI_CODING_AGENT = origPi;
        logSpy.mockRestore();
      }
    });

    it("apply:sdd-ep-choice 前置 gate 检查:worktree-choice 不在 gate_history -> HARD_STOP exit 1", async () => {
      // 模拟 agent 跳过 worktree-choice gate,直接设 sdd-ep-choice
      await setupState("applying");
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await guardCommand(["user-gate", "require", changeDir, "apply:sdd-ep-choice"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errSpy.mock.calls.some(c => String(c[0]).includes("前置 gate 未通过:apply:worktree-choice"))).toBe(true);
      // 验证 pending_gate 未设置(拦截在 setPendingGate 之前)
      const state = await readState(changeDir);
      expect(state.pending_gate ?? null).toBeNull();

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("apply:sdd-ep-choice 前置 gate 检查:worktree-choice 在 gate_history -> 放行设 pending_gate", async () => {
      // 模拟 agent 走完 worktree-choice gate(在 gate_history),再设 sdd-ep-choice
      await setupState("applying");
      // 手动写入 gate_history 含 apply:worktree-choice
      const yaml = [
        "worktree: null",
        "schema_version: 1",
        "phase: applying",
        'updated_at: "2020-01-01T00:00:00"',
        "gate_history:",
        "  - apply:worktree-choice",
      ].join("\n");
      await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await guardCommand(["user-gate", "require", changeDir, "apply:sdd-ep-choice"]);

      // 验证 pending_gate 已设置(前置检查通过)
      const state = await readState(changeDir);
      expect(state.pending_gate).toBe("apply:sdd-ep-choice");

      logSpy.mockRestore();
    });

    it("pass 把 gate 加入 gate_history", async () => {
      // require + pass 后,gate 应在 gate_history
      await setupState("started");
      await guardCommand(["user-gate", "require", changeDir, "start:phase-complete"]);
      await guardCommand(["user-gate", "pass", changeDir]);

      const state = await readState(changeDir);
      expect(state.pending_gate).toBeNull();
      expect(state.gate_history ?? []).toContain("start:phase-complete");
    });

    it("reset 把 gate 从 gate_history 移除 + 重新设为 pending_gate", async () => {
      // 模拟 hook-guard 误 clear:require + pass(gate 进 gate_history)+ reset 恢复
      await setupState("started");
      await guardCommand(["user-gate", "require", changeDir, "start:phase-complete"]);
      await guardCommand(["user-gate", "pass", changeDir]);
      // 此时 pending_gate=null, gate_history=[start:phase-complete]
      await guardCommand(["user-gate", "reset", changeDir, "start:phase-complete"]);

      const state = await readState(changeDir);
      expect(state.pending_gate).toBe("start:phase-complete");
      expect(state.gate_history ?? []).not.toContain("start:phase-complete");
    });

    it("reset 缺 change-dir -> exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: number) => {
        throw new Error(`exit:${code}`);
      });
      try {
        await expect(guardCommand(["user-gate", "reset"])).rejects.toThrow();
      } finally {
        exitSpy.mockRestore();
      }
    });

    it("reset 缺 gate-id -> exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: number) => {
        throw new Error(`exit:${code}`);
      });
      try {
        await expect(guardCommand(["user-gate", "reset", changeDir])).rejects.toThrow();
      } finally {
        exitSpy.mockRestore();
      }
    });

    it("reset 不在 gate_history 的 gate -> 只设 pending_gate(幂等,不报错)", async () => {
      // gate 从未通过(gate_history 无此 gate),reset 仍设 pending_gate
      await setupState("started");
      await guardCommand(["user-gate", "reset", changeDir, "start:phase-complete"]);

      const state = await readState(changeDir);
      expect(state.pending_gate).toBe("start:phase-complete");
      expect(state.gate_history ?? []).not.toContain("start:phase-complete");
    });

    it("Pi 下其他 gate 正常设置(不自动通过)", async () => {
      const origPi = process.env.PI_CODING_AGENT;
      process.env.PI_CODING_AGENT = "true";
      try {
        await guardCommand(["user-gate", "require", changeDir, "apply:lock-verify"]);
        const state = await readState(changeDir);
        expect(state.pending_gate).toBe("apply:lock-verify");
      } finally {
        if (origPi === undefined) delete process.env.PI_CODING_AGENT;
        else process.env.PI_CODING_AGENT = origPi;
      }
    });
  });

  describe("worktree-status", () => {
    it("PI_CODING_AGENT=true 时强制返回 skipped(即使 state.worktree=null)", async () => {
      // state.worktree: null(默认 setupState)
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const origPi = process.env.PI_CODING_AGENT;
      process.env.PI_CODING_AGENT = "true";
      try {
        await guardCommand(["worktree-status", changeDir]);
        expect(logSpy).toHaveBeenCalledWith("skipped");
      } finally {
        if (origPi === undefined) delete process.env.PI_CODING_AGENT;
        else process.env.PI_CODING_AGENT = origPi;
        logSpy.mockRestore();
      }
    });

    it("非 Pi env + state.worktree=null 返回 pending", async () => {
      // state.worktree: null(默认 setupState)
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const origPi = process.env.PI_CODING_AGENT;
      delete process.env.PI_CODING_AGENT;
      try {
        await guardCommand(["worktree-status", changeDir]);
        expect(logSpy).toHaveBeenCalledWith("pending");
      } finally {
        if (origPi !== undefined) process.env.PI_CODING_AGENT = origPi;
        logSpy.mockRestore();
      }
    });

    it("非 Pi env + state.worktree=skipped 返回 skipped", async () => {
      const yaml = [
        "worktree: skipped",
        "schema_version: 1",
        "phase: applying",
        'updated_at: "2020-01-01T00:00:00"',
      ].join("\n");
      await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const origPi = process.env.PI_CODING_AGENT;
      delete process.env.PI_CODING_AGENT;
      try {
        await guardCommand(["worktree-status", changeDir]);
        expect(logSpy).toHaveBeenCalledWith("skipped");
      } finally {
        if (origPi !== undefined) process.env.PI_CODING_AGENT = origPi;
        logSpy.mockRestore();
      }
    });

    it("缺 change-dir -> exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await guardCommand(["worktree-status"]);
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });
  });
});
