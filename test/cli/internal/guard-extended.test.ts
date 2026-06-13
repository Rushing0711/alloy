// test/cli/internal/guard-extended.test.ts
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

describe("alloy _guard branch-position", () => {
  let tmpDir: string;
  let changeDir: string;
  let projectDir: string;

  async function setupState(featureBranch: string | null) {
    const lines = [
      "worktree: null",
      "schema_version: 1",
      "phase: planned",
      'updated_at: "2020-01-01T00:00:00"',
      featureBranch !== null ? `feature_branch: "${featureBranch}"` : "feature_branch: null",
    ];
    await writeFile(join(changeDir, ".alloy.yaml"), lines.join("\n"), "utf-8");
  }

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-guard-ext-test-${Date.now()}`);
    projectDir = tmpDir;
    changeDir = join(tmpDir, "openspec", "changes", "test-change");
    await mkdir(changeDir, { recursive: true });

    // 创建项目配置
    const configDir = join(tmpDir, "openspec");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "config.yaml"), "schema: alloy\nalloy:\n  main_branch: main\n", "utf-8");

    // 默认 mock：当前分支=feature-1，本地有 main 和 feature-1
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("--show-current")) return Buffer.from("feature-1\n");
      if (cmd.includes("--format=%(refname:short)")) return Buffer.from("main\nfeature-1\n");
      return Buffer.from("");
    });

    vi.spyOn(process, "cwd").mockReturnValue(projectDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("在 feature 分支上且匹配时输出 on-feature", async () => {
    await setupState("feature-1");
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

    await guardCommand(["branch-position", changeDir]);

    expect(logs.some((l) => l.includes("on-feature"))).toBe(true);
    logSpy.mockRestore();
  });

  it("在 main 分支上时输出 on-main 并 exit(1)", async () => {
    await setupState("feature-1");
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("--show-current")) return Buffer.from("main\n");
      if (cmd.includes("--format=%(refname:short)")) return Buffer.from("main\nfeature-1\n");
      return Buffer.from("");
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["branch-position", changeDir]);

    expect(logSpy).toHaveBeenCalledWith("on-main");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("feature_branch 为 null 时输出 feature-missing 并 exit(1)", async () => {
    await setupState(null);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["branch-position", changeDir]);

    expect(logSpy).toHaveBeenCalledWith("feature-missing");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("在非 main 非 feature 分支时输出 on-other 并 exit(1)", async () => {
    await setupState("feature-1");
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("--show-current")) return Buffer.from("other-branch\n");
      if (cmd.includes("--format=%(refname:short)")) return Buffer.from("main\nfeature-1\n");
      return Buffer.from("");
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["branch-position", changeDir]);

    expect(logSpy).toHaveBeenCalledWith("on-other:other-branch");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("feature 分支不在本地时输出 feature-lost 并 exit(1)", async () => {
    await setupState("feature-gone");
    // 当前在 feature-1（不是 main），但 feature_branch=feature-gone 不在本地
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("--show-current")) return Buffer.from("feature-1\n");
      if (cmd.includes("--format=%(refname:short)")) return Buffer.from("main\nfeature-1\n");
      return Buffer.from("");
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["branch-position", changeDir]);

    expect(logSpy).toHaveBeenCalledWith("feature-lost:feature-gone");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("缺少参数时 exit(1)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await guardCommand(["branch-position"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("main_branch 未配置但本地有 main 分支时检测到 on-main", async () => {
    await setupState("feature-1");
    // config 无 main_branch 配置
    await writeFile(join(projectDir, "openspec", "config.yaml"), "schema: alloy\n", "utf-8");
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("--show-current")) return Buffer.from("main\n");
      if (cmd.includes("--format=%(refname:short)")) return Buffer.from("main\nfeature-1\n");
      return Buffer.from("");
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["branch-position", changeDir]);

    expect(logSpy).toHaveBeenCalledWith("on-main");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("main_branch 未配置且本地无 main/master 时无法检测 on-main", async () => {
    await setupState("feature-1");
    await writeFile(join(projectDir, "openspec", "config.yaml"), "schema: alloy\n", "utf-8");
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("--show-current")) return Buffer.from("main\n");
      // 本地无 main 分支
      if (cmd.includes("--format=%(refname:short)")) return Buffer.from("develop\nfeature-1\n");
      return Buffer.from("");
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["branch-position", changeDir]);

    // 无法推断主分支，跳过 on-main 检测，继续后续判断
    // 当前分支="main" 不等于 feature-1 → on-other:main
    expect(logSpy).toHaveBeenCalledWith("on-other:main");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe("alloy _guard verify-passed", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-guard-verify-test-${Date.now()}`);
    changeDir = join(tmpDir, "test-change");
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, ".alloy.yaml"), "worktree: null\nschema_version: 1\nphase: applied\nupdated_at: \"2020-01-01T00:00:00\"\n", "utf-8");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("verify.md 不存在时输出 FAIL 并 exit(1)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["verify-passed", changeDir]);

    expect(logSpy).toHaveBeenCalledWith("FAIL");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("verify.md 含 FAIL 时输出 FAIL 并 exit(1)", async () => {
    await writeFile(join(changeDir, "verify.md"), "# Verify\n- [x] ❌ FAIL: 严重问题", "utf-8");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["verify-passed", changeDir]);

    expect(logSpy).toHaveBeenCalledWith("FAIL");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("verify.md 含 FAIL 但不含 emoji 时仍输出 FAIL", async () => {
    await writeFile(join(changeDir, "verify.md"), "# Verify\n- [x] FAIL: 严重问题", "utf-8");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["verify-passed", changeDir]);

    expect(logSpy).toHaveBeenCalledWith("FAIL");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("verify.md PASS 时输出 PASS", async () => {
    await writeFile(join(changeDir, "verify.md"), "# Verify\n- [x] ✅ PASS: 所有检查通过", "utf-8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["verify-passed", changeDir]);

    expect(logSpy).toHaveBeenCalledWith("PASS");
    logSpy.mockRestore();
  });

  it("verify.md WARNING 时输出 WARNING", async () => {
    await writeFile(join(changeDir, "verify.md"), "# Verify\n- [x] ⚠️ WARNING: 需关注", "utf-8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["verify-passed", changeDir]);

    expect(logSpy).toHaveBeenCalledWith("WARNING");
    logSpy.mockRestore();
  });

  it("缺少参数时 exit(1)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await guardCommand(["verify-passed"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

describe("alloy _guard precheck", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-guard-precheck-test-${Date.now()}`);
    changeDir = join(tmpDir, "test-change");
    await mkdir(changeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("phase 匹配时输出 PASS", async () => {
    await writeFile(join(changeDir, ".alloy.yaml"), "worktree: null\nschema_version: 1\nphase: planned\nupdated_at: \"2020-01-01T00:00:00\"\n", "utf-8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["precheck", changeDir, "planned"]);

    expect(logSpy).toHaveBeenCalledWith("PASS:planned");
    logSpy.mockRestore();
  });

  it("phase 不匹配时输出 FAIL 并 exit(1)", async () => {
    await writeFile(join(changeDir, ".alloy.yaml"), "worktree: null\nschema_version: 1\nphase: started\nupdated_at: \"2020-01-01T00:00:00\"\n", "utf-8");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["precheck", changeDir, "planned"]);

    expect(logSpy).toHaveBeenCalledWith("FAIL:phase=started expected=planned");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("多阶段值（逗号分隔）匹配时输出 PASS", async () => {
    await writeFile(join(changeDir, ".alloy.yaml"), "worktree: null\nschema_version: 1\nphase: applied\nupdated_at: \"2020-01-01T00:00:00\"\n", "utf-8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["precheck", changeDir, "planned,applied"]);

    expect(logSpy).toHaveBeenCalledWith("PASS:applied");
    logSpy.mockRestore();
  });

  it("多阶段值都不匹配时输出 FAIL", async () => {
    await writeFile(join(changeDir, ".alloy.yaml"), "worktree: null\nschema_version: 1\nphase: started\nupdated_at: \"2020-01-01T00:00:00\"\n", "utf-8");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["precheck", changeDir, "planned,applied"]);

    expect(logSpy).toHaveBeenCalledWith("FAIL:phase=started expected=planned,applied");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("目录不存在时输出 FAIL 并 exit(1)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["precheck", "/nonexistent/path", "planned"]);

    expect(logSpy).toHaveBeenCalledWith("FAIL:directory not found");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe("alloy _guard worktree-status", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-guard-worktree-test-${Date.now()}`);
    changeDir = join(tmpDir, "test-change");
    await mkdir(changeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("worktree 为 null 时输出 pending", async () => {
    await writeFile(join(changeDir, ".alloy.yaml"), "worktree: null\nschema_version: 1\nphase: applied\nupdated_at: \"2020-01-01T00:00:00\"\n", "utf-8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["worktree-status", changeDir]);

    expect(logSpy).toHaveBeenCalledWith("pending");
    logSpy.mockRestore();
  });

  it("worktree 为 skipped 时输出 skipped", async () => {
    await writeFile(join(changeDir, ".alloy.yaml"), "worktree: skipped\nschema_version: 1\nphase: applied\nupdated_at: \"2020-01-01T00:00:00\"\n", "utf-8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["worktree-status", changeDir]);

    expect(logSpy).toHaveBeenCalledWith("skipped");
    logSpy.mockRestore();
  });

  it("worktree 路径存在时输出 done", async () => {
    const wtPath = join(tmpDir, "wt-dir");
    await mkdir(wtPath, { recursive: true });
    await writeFile(join(changeDir, ".alloy.yaml"), `worktree: "${wtPath}"\nworktree_branch: "feature-1"\nschema_version: 1\nphase: applied\nupdated_at: "2020-01-01T00:00:00"\n`, "utf-8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["worktree-status", changeDir]);

    expect(logSpy).toHaveBeenCalledWith(`done:${wtPath}:feature-1`);
    logSpy.mockRestore();
  });

  it("worktree 路径不存在时输出 stale", async () => {
    await writeFile(join(changeDir, ".alloy.yaml"), "worktree: \"/nonexistent/path\"\nschema_version: 1\nphase: applied\nupdated_at: \"2020-01-01T00:00:00\"\n", "utf-8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await guardCommand(["worktree-status", changeDir]);

    expect(logSpy).toHaveBeenCalledWith("stale:/nonexistent/path");
    logSpy.mockRestore();
  });
});
