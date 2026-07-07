import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../../src/core/health.js", () => ({
  runHealthCheck: vi.fn(),
}));
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { runHealthCheck } from "../../src/core/health.js";
import { execSync } from "node:child_process";
import { doctorCommand, formatDoctorResult, checkWorktreeConsistency } from "../../src/cli/commands/doctor.js";
import type { HealthCheckResult } from "../../src/core/types.js";

describe("doctorCommand", () => {
  it("应返回 healthResults 和 consistencyWarnings", async () => {
    vi.mocked(runHealthCheck).mockResolvedValue([
      {
        name: "Node.js",
        status: "pass",
        current: "20.0.0",
        required: ">=18.0.0 <22.0.0",
      },
    ]);

    const result = await doctorCommand("/fake/project");
    expect(result.healthResults).toBeDefined();
    expect(result.healthResults).toHaveLength(1);
    expect(result.consistencyWarnings).toBeDefined();
  });
});

describe("formatDoctorResult", () => {
  it("应以文本格式输出 pass/warn/fail 三种状态", () => {
    const result = {
      healthResults: [
        {
          name: "Node.js",
          status: "pass" as const,
          current: "20.0.0",
          required: ">=18.0.0 <22.0.0",
        },
        {
          name: "OpenSpec",
          status: "fail" as const,
          current: "未安装",
          required: ">=1.3.0 <2.0.0",
        },
        {
          name: "Alloy",
          status: "warn" as const,
          current: "0.1.0",
          required: ">=0.1.0",
        },
      ],
      consistencyWarnings: [],
    };

    const output = formatDoctorResult(result, false);
    expect(output).toContain("✓");
    expect(output).toContain("✗");
    expect(output).toContain("⚠");
    expect(output).toContain("Node.js");
    expect(output).toContain("OpenSpec");
  });

  it("JSON 模式应输出有效 JSON", () => {
    const result = {
      healthResults: [] as HealthCheckResult[],
      consistencyWarnings: [],
    };

    const json = formatDoctorResult(result, true);
    const parsed = JSON.parse(json);
    expect(parsed.healthResults).toEqual([]);
    expect(parsed.consistencyWarnings).toEqual([]);
  });

  it("应显示文件一致性警告", () => {
    const result = {
      healthResults: [],
      consistencyWarnings: ["test-change: worktree 路径不可达"],
    };

    const output = formatDoctorResult(result, false);
    expect(output).toContain("test-change");
    expect(output).toContain("worktree");
  });
});

describe("checkWorktreeConsistency", () => {
  let tmpProject: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpProject = await mkdtemp(join(tmpdir(), "alloy-doctor-test-"));
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("not a git repo");
    });
  });

  afterEach(async () => {
    await rm(tmpProject, { recursive: true, force: true });
  });

  it("应检测 .claude/worktrees/<name>/ 孤儿(Claude Code EnterWorktree 路径)", async () => {
    const changeName = "login-feature";
    const orphanDir = join(tmpProject, ".claude", "worktrees", changeName);
    await mkdir(orphanDir, { recursive: true });

    const changes = new Map([
      [changeName, { worktree: null, schema_version: 1 } as any],
    ]);

    const warnings = checkWorktreeConsistency(changes, tmpProject);
    expect(warnings.some((w) => w.includes("worktree 孤儿") && w.includes(".claude/worktrees/login-feature"))).toBe(true);
  });

  it("应检测 .worktrees/<name>/ 孤儿(其他 agent git fallback 路径)", async () => {
    const changeName = "login-feature";
    const orphanDir = join(tmpProject, ".worktrees", changeName);
    await mkdir(orphanDir, { recursive: true });

    const changes = new Map([
      [changeName, { worktree: null, schema_version: 1 } as any],
    ]);

    const warnings = checkWorktreeConsistency(changes, tmpProject);
    expect(warnings.some((w) => w.includes("worktree 孤儿") && w.includes(".worktrees/login-feature"))).toBe(true);
  });

  it("两路径都存在时只报一条孤儿警告(含两个路径)", async () => {
    const changeName = "login-feature";
    await mkdir(join(tmpProject, ".claude", "worktrees", changeName), { recursive: true });
    await mkdir(join(tmpProject, ".worktrees", changeName), { recursive: true });

    const changes = new Map([
      [changeName, { worktree: null, schema_version: 1 } as any],
    ]);

    const warnings = checkWorktreeConsistency(changes, tmpProject);
    const orphanWarnings = warnings.filter((w) => w.includes("worktree 孤儿"));
    expect(orphanWarnings).toHaveLength(1);
    expect(orphanWarnings[0]).toContain(".claude/worktrees/login-feature");
    expect(orphanWarnings[0]).toContain(".worktrees/login-feature");
    expect(orphanWarnings[0]).toContain(" 或 ");
  });

  it("两个路径都不存在时不应报孤儿", async () => {
    const changes = new Map([
      ["login-feature", { worktree: null, schema_version: 1 } as any],
    ]);

    const warnings = checkWorktreeConsistency(changes, tmpProject);
    expect(warnings.some((w) => w.includes("worktree 孤儿"))).toBe(false);
  });

  it("worktree 字段有值但路径不存在时应报残留", async () => {
    const changes = new Map([
      ["login-feature", { worktree: ".claude/worktrees/login-feature", schema_version: 1 } as any],
    ]);

    const warnings = checkWorktreeConsistency(changes, tmpProject);
    expect(warnings.some((w) => w.includes("worktree 残留"))).toBe(true);
  });

  it("检查 3:git worktree list 含 .claude/worktrees/<name> 时不报孤立", () => {
    const changeName = "login-feature";
    const wtPath = join(tmpProject, ".claude", "worktrees", changeName);
    vi.mocked(execSync).mockReturnValue(
      Buffer.from(`worktree ${tmpProject}\nworktree ${wtPath}\n`)
    );

    const changes = new Map([
      [changeName, { worktree: null, schema_version: 1 } as any],
    ]);

    const warnings = checkWorktreeConsistency(changes, tmpProject);
    expect(warnings.some((w) => w.includes("孤立 worktree"))).toBe(false);
  });

  it("检查 3:git worktree list 含 .worktrees/<name> 时不报孤立", () => {
    const changeName = "login-feature";
    const wtPath = join(tmpProject, ".worktrees", changeName);
    vi.mocked(execSync).mockReturnValue(
      Buffer.from(`worktree ${tmpProject}\nworktree ${wtPath}\n`)
    );

    const changes = new Map([
      [changeName, { worktree: null, schema_version: 1 } as any],
    ]);

    const warnings = checkWorktreeConsistency(changes, tmpProject);
    expect(warnings.some((w) => w.includes("孤立 worktree"))).toBe(false);
  });

  it("检查 3:git worktree list 含未知路径时报孤立", () => {
    const unknownPath = join(tmpProject, ".claude", "worktrees", "unknown-change");
    vi.mocked(execSync).mockReturnValue(
      Buffer.from(`worktree ${tmpProject}\nworktree ${unknownPath}\n`)
    );

    const changes = new Map([
      ["login-feature", { worktree: null, schema_version: 1 } as any],
    ]);

    const warnings = checkWorktreeConsistency(changes, tmpProject);
    expect(warnings.some((w) => w.includes("孤立 worktree") && w.includes("unknown-change"))).toBe(true);
  });
});
