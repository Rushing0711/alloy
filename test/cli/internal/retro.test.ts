// test/cli/internal/retro.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { retroCommand } from "../../../src/cli/commands/internal/retro.js";

describe("alloy _retro scaffold", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-retro-test-${Date.now()}`);
    changeDir = join(tmpDir, "openspec", "changes", "test-change");
    await mkdir(changeDir, { recursive: true });

    execSync("git init -b main", { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.name "test-user"', { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });

    // config.yaml
    await mkdir(join(tmpDir, "openspec"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "config.yaml"), "schema: alloy\nalloy:\n  main_branch: main\n", "utf-8");

    // 初始 commit + feature 分支
    await writeFile(join(tmpDir, "README.md"), "init", "utf-8");
    execSync("git add README.md && git commit -m 'chore: init'", { cwd: tmpDir, stdio: "pipe" });
    execSync("git checkout -b feature/test-change", { cwd: tmpDir, stdio: "pipe" });
    await writeFile(join(tmpDir, "f1.txt"), "x", "utf-8");
    execSync("git add f1.txt && git commit -m 'feat: add f1'", { cwd: tmpDir, stdio: "pipe" });

    // .alloy.yaml
    const yaml = [
      "phase: applied",
      "schema_version: 1",
      "worktree: skipped",
      "feature_branch: feature/test-change",
      'created_at: "2026-06-24 17:26:29"',
      'started_at: "2026-06-24 16:50:53"',
      'updated_at: "2026-06-24 18:01:01"',
      "completed_at: null",
      "phase_timings:",
      "  start:",
      '    started_at: "2026-06-24 16:50:53"',
      '    completed_at: "2026-06-24 17:29:01"',
      "  plan:",
      '    started_at: "2026-06-24 17:33:36"',
      '    completed_at: "2026-06-24 18:08:11"',
      "records:",
      "  - artifact: draft",
      "    hash: aaa111",
      '    committed_at: "2026-06-24 17:28:55"',
      "    approver: emon",
      "  - artifact: proposal",
      "    hash: bbb222",
      '    committed_at: "2026-06-24 17:37:11"',
      "    approver: emon",
      "skill_usage:",
      "  - skill: opsx:explore",
      "    stage: start",
      "    used: true",
      "    count: 1",
      '    called_at: "2026-06-24 16:50:53"',
      "  - skill: opsx:continue",
      "    stage: plan",
      "    used: true",
      "    count: 4",
      '    called_at: "2026-06-24 17:59:30"',
      "  - skill: superpowers:using-git-worktrees",
      "    stage: apply",
      "    used: false",
      "    reason: 用户选择跳过 worktree",
      '    called_at: "2026-06-24 18:09:10"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");

    // tasks.md
    await writeFile(join(changeDir, "tasks.md"), "- [x] T1\n- [x] T2\n- [ ] T3\n", "utf-8");
    // verify.md
    await writeFile(join(changeDir, "verify.md"), "## Overall Decision\n- [x] ✅ PASS\n", "utf-8");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("生成 retrospective.md 含 §0 和 §4", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await retroCommand(["scaffold", changeDir]);
    const content = await readFile(join(changeDir, "retrospective.md"), "utf-8");
    expect(content).toContain("## §0 量化全景");
    expect(content).toContain("## §4 全周期技能审计");
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("§4 技能审计列全所有 skill_usage 条目（含 used=false）", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await retroCommand(["scaffold", changeDir]);
    const content = await readFile(join(changeDir, "retrospective.md"), "utf-8");
    expect(content).toContain("opsx:explore");
    expect(content).toContain("opsx:continue");
    expect(content).toContain("×4");
    expect(content).toContain("using-git-worktrees");
    expect(content).toContain("✗");
    expect(content).toContain("用户选择跳过 worktree");
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("制品审批链含 records 各行", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await retroCommand(["scaffold", changeDir]);
    const content = await readFile(join(changeDir, "retrospective.md"), "utf-8");
    expect(content).toContain("draft");
    expect(content).toContain("aaa111");
    expect(content).toContain("proposal");
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("审批链不含 retrospective 自身（避免自指）", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await retroCommand(["scaffold", changeDir]);
    const content = await readFile(join(changeDir, "retrospective.md"), "utf-8");
    // 审批链表格里不应出现 retrospective 行（它自身尚未审批）
    const chainSection = content.split("### 制品审批链")[1]?.split("###")[0] ?? "";
    expect(chainSection).not.toContain("| retrospective |");
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("阶段间隔列计算（plan started - start completed）", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await retroCommand(["scaffold", changeDir]);
    const content = await readFile(join(changeDir, "retrospective.md"), "utf-8");
    expect(content).toContain("距上阶段间隔");
    expect(content).toMatch(/4m\d+s/);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("无检查点时显示稳定提示", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await retroCommand(["scaffold", changeDir]);
    const content = await readFile(join(changeDir, "retrospective.md"), "utf-8");
    expect(content).toContain("无检查点");
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("有检查点 tag 时统计数量", async () => {
    execSync('git tag -a "alloy-checkpoint-test-change-20260624-170000" -m "cp1"', { cwd: tmpDir, stdio: "pipe" });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await retroCommand(["scaffold", changeDir]);
    const content = await readFile(join(changeDir, "retrospective.md"), "utf-8");
    expect(content).toContain("共 1 个检查点");
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("多行 annotation 的 tag 不被误拆为多个检查点", async () => {
    // 模拟 checkpoint.ts 实际创建的 5 行 annotation 格式
    const annotation = "原因: draft 已锁定，brainstorming 锚点\n制品: draft\nphase: started\ncommit 数: 2\n时间: 2026-06-27 22:45:50";
    execSync(`git tag -a "alloy-checkpoint-test-change-brainstorming-1" -m "${annotation.replace(/"/g, '\\"')}"`, { cwd: tmpDir, stdio: "pipe" });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await retroCommand(["scaffold", changeDir]);
    const content = await readFile(join(changeDir, "retrospective.md"), "utf-8");
    // 1 个 tag，annotation 5 行不能被当成 5 个检查点
    expect(content).toContain("共 1 个检查点");
    expect(content).not.toContain("共 5 个检查点");
    // 表格展示：含表头 + 数据行，tag 名剥离前缀只留 brainstorming-1
    expect(content).toContain("| 检查点 | 原因 | 制品 | phase | commit 数 | 时间 |");
    expect(content).toContain("| brainstorming-1 | draft 已锁定，brainstorming 锚点 | draft | started | 2 | 2026-06-27 22:45:50 |");
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("任务完成比正确（2/3）", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await retroCommand(["scaffold", changeDir]);
    const content = await readFile(join(changeDir, "retrospective.md"), "utf-8");
    expect(content).toContain("2 / 3");
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("空 skill_usage（旧 change）显示提示", async () => {
    // 覆盖 .alloy.yaml 的 skill_usage 为空
    const yaml = [
      "phase: applied",
      "schema_version: 1",
      "worktree: skipped",
      "feature_branch: feature/test-change",
      'created_at: "2026-06-24 17:26:29"',
      'started_at: "2026-06-24 16:50:53"',
      'updated_at: "2026-06-24 18:01:01"',
      "completed_at: null",
      "records: []",
      "skill_usage: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await retroCommand(["scaffold", changeDir]);
    const content = await readFile(join(changeDir, "retrospective.md"), "utf-8");
    expect(content).toContain("无 skill_usage 记录");
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("feature_branch 缺失时 base 不可用，commit 统计降级提示", async () => {
    const yaml = [
      "phase: applied",
      "schema_version: 1",
      "worktree: skipped",
      "feature_branch: null",
      'created_at: "2026-06-24 17:26:29"',
      'started_at: "2026-06-24 16:50:53"',
      'updated_at: "2026-06-24 18:01:01"',
      "completed_at: null",
      "records: []",
      "skill_usage: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await retroCommand(["scaffold", changeDir]);
    const content = await readFile(join(changeDir, "retrospective.md"), "utf-8");
    expect(content).toContain("无法确定 base");
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("change 目录存在但 .alloy.yaml 缺失时 exit 1", async () => {
    // 删除 .alloy.yaml，保留目录
    await rm(join(changeDir, ".alloy.yaml"), { force: true });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await retroCommand(["scaffold", changeDir]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("change 目录不存在时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await retroCommand(["scaffold", join(tmpDir, "nonexistent")]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("按阶段 commit 汇总分段", async () => {
    // beforeEach 的 git 历史只有 chore: init + feat: add f1，无阶段边界 commit
    // 构造带阶段边界的 commit
    await writeFile(join(tmpDir, "s1.txt"), "x", "utf-8");
    execSync("git add s1.txt && git commit -m 'chore(test-change): 记录 start 阶段开始时间'", { cwd: tmpDir, stdio: "pipe" });
    await writeFile(join(tmpDir, "s2.txt"), "x", "utf-8");
    execSync("git add s2.txt && git commit -m 'docs(test-change): draft 已锁定'", { cwd: tmpDir, stdio: "pipe" });
    await writeFile(join(tmpDir, "s3.txt"), "x", "utf-8");
    execSync("git add s3.txt && git commit -m 'chore(test-change): 记录 start 阶段完成时间'", { cwd: tmpDir, stdio: "pipe" });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await retroCommand(["scaffold", changeDir]);
    const content = await readFile(join(changeDir, "retrospective.md"), "utf-8");
    expect(content).toContain("Commit 汇总（按阶段）");
    expect(content).toContain("| start |");
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("plans.md frontmatter strategy 读取", async () => {
    await writeFile(join(changeDir, "plans.md"), "---\nstrategy: EP\nreason: 用户选择\n---\n# Plan\n", "utf-8");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await retroCommand(["scaffold", changeDir]);
    const content = await readFile(join(changeDir, "retrospective.md"), "utf-8");
    expect(content).toContain("EP");
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("按阶段汇总含前置段（第一个边界 commit 之前的 commit）", async () => {
    // 构造：前置 commit + start 阶段 commit
    await writeFile(join(tmpDir, "pre.txt"), "x", "utf-8");
    execSync("git add pre.txt && git commit -m 'chore: 项目初始化'", { cwd: tmpDir, stdio: "pipe" });
    await writeFile(join(tmpDir, "s1.txt"), "x", "utf-8");
    execSync("git add s1.txt && git commit -m 'chore(test-change): 记录 start 阶段开始时间'", { cwd: tmpDir, stdio: "pipe" });
    await writeFile(join(tmpDir, "s2.txt"), "x", "utf-8");
    execSync("git add s2.txt && git commit -m 'docs(test-change): draft 已锁定'", { cwd: tmpDir, stdio: "pipe" });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await retroCommand(["scaffold", changeDir]);
    const content = await readFile(join(changeDir, "retrospective.md"), "utf-8");
    expect(content).toContain("| 前置 |");
    expect(content).toContain("| start |");
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });
});
