// test/cli/internal/artifact-commit.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { artifactCommand } from "../../../src/cli/commands/internal/artifact.js";
import { readState } from "../../../src/cli/utils/state.js";
import { computeArtifactHash } from "../../../src/core/artifacts.js";

describe("alloy _artifact commit", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-artifact-commit-test-${Date.now()}`);
    changeDir = join(tmpDir, "openspec", "changes", "test-change");
    await mkdir(changeDir, { recursive: true });

    // 真实 git 仓库
    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.name "test-user"', { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });

    // 初始 .alloy.yaml
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

  it("制品存在时：写入 records + hash + commit", async () => {
    await writeFile(join(changeDir, "draft.md"), "# draft content", "utf-8");

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

    await artifactCommand(["commit", changeDir, "draft"]);

    logSpy.mockRestore();

    // records 已写入
    const state = await readState(changeDir);
    expect(state.records).toHaveLength(1);
    expect(state.records[0].artifact).toBe("draft");
    const expectedHash = await computeArtifactHash(changeDir, "draft");
    expect(state.records[0].hash).toBe(expectedHash);
    expect(state.records[0].approver).toBe("test-user");

    // updated_at 已刷新（不再是 2020-01-01）
    expect(state.updated_at).not.toBe("2020-01-01 00:00:00");

    // git commit 已产生
    const log = gitLog();
    expect(log).toContain("docs(test-change): draft 已锁定");
  });

  it("幂等：重复 commit 同一制品只产生一次 commit", async () => {
    await writeFile(join(changeDir, "draft.md"), "# draft content", "utf-8");

    await artifactCommand(["commit", changeDir, "draft"]);
    const firstLog = gitLog();

    // 第二次调用，内容未变
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
    await artifactCommand(["commit", changeDir, "draft"]);
    logSpy.mockRestore();

    const secondLog = gitLog();
    expect(secondLog).toBe(firstLog); // 无新 commit
    // N3：已锁定且未变更时输出"已锁定且未变更"，不再走到 git diff 检测
    expect(logs.some((l) => l.includes("已锁定且未变更"))).toBe(true);

    // records 仍只有一条
    const state = await readState(changeDir);
    expect(state.records).toHaveLength(1);
  });

  it("制品内容变更后重新 commit：hash 更新 + 新 commit", async () => {
    await writeFile(join(changeDir, "draft.md"), "# v1", "utf-8");
    await artifactCommand(["commit", changeDir, "draft"]);
    const firstState = await readState(changeDir);
    const firstHash = firstState.records[0].hash;

    await writeFile(join(changeDir, "draft.md"), "# v2 changed", "utf-8");
    await artifactCommand(["commit", changeDir, "draft"]);

    const secondState = await readState(changeDir);
    expect(secondState.records).toHaveLength(1);
    expect(secondState.records[0].hash).not.toBe(firstHash);

    const log = gitLog();
    expect(log.split("\n")).toHaveLength(2); // 两个 commit
  });

  it("specs 目录制品：递归 hash + commit", async () => {
    const specsDir = join(changeDir, "specs");
    await mkdir(specsDir, { recursive: true });
    await writeFile(join(specsDir, "spec1.md"), "spec1", "utf-8");
    await writeFile(join(specsDir, "spec2.md"), "spec2", "utf-8");

    await artifactCommand(["commit", changeDir, "specs"]);

    const state = await readState(changeDir);
    expect(state.records).toHaveLength(1);
    expect(state.records[0].artifact).toBe("specs");
    expect(state.records[0].hash).toMatch(/^[a-f0-9]{12}$/);

    const log = gitLog();
    expect(log).toContain("docs(test-change): specs 已锁定");
  });

  it("制品文件不存在时 exit(1)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await artifactCommand(["commit", changeDir, "draft"]); // draft.md 不存在

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy.mock.calls.some((c) => c[0].includes("无法计算"))).toBe(true);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("未知制品名时 exit(1)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await artifactCommand(["commit", changeDir, "bogus"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy.mock.calls.some((c) => c[0].includes("未知制品"))).toBe(true);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("缺少参数时 exit(1)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await artifactCommand(["commit", changeDir]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  describe("重复锁定检测（N3）", () => {
    it("制品已锁定且 hash 未变时跳过重复 commit", async () => {
      await writeFile(join(changeDir, "draft.md"), "# draft", "utf-8");
      await artifactCommand(["commit", changeDir, "draft"]);
      const firstLog = gitLog();

      const logs: string[] = [];
      const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
      await artifactCommand(["commit", changeDir, "draft"]); // 第二次，内容未变
      logSpy.mockRestore();

      // 无新 commit
      expect(gitLog()).toBe(firstLog);
      // 提示跳过
      expect(logs.some((l) => l.includes("已锁定且未变更"))).toBe(true);

      // records 仍只有一条
      const state = await readState(changeDir);
      expect(state.records).toHaveLength(1);
    });

    it("制品内容变更后（hash 不同）允许重新锁定", async () => {
      await writeFile(join(changeDir, "draft.md"), "# v1", "utf-8");
      await artifactCommand(["commit", changeDir, "draft"]);
      const firstState = await readState(changeDir);
      const firstHash = firstState.records[0].hash;

      // 修改内容
      await writeFile(join(changeDir, "draft.md"), "# v2 changed", "utf-8");
      await artifactCommand(["commit", changeDir, "draft"]);

      const secondState = await readState(changeDir);
      expect(secondState.records).toHaveLength(1); // 仍是 1 条（更新而非新增）
      expect(secondState.records[0].hash).not.toBe(firstHash);

      const log = gitLog();
      expect(log.split("\n")).toHaveLength(2); // 两个 commit
    });

    it("首次锁定不受影响（无 existing record）", async () => {
      await writeFile(join(changeDir, "draft.md"), "# draft", "utf-8");
      const logs: string[] = [];
      const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
      await artifactCommand(["commit", changeDir, "draft"]);
      logSpy.mockRestore();

      expect(logs.some((l) => l.includes("已 commit"))).toBe(true);
      expect(gitLog()).toContain("draft 已锁定");
    });
  });
});
