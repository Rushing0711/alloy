// test/cli/internal/checkpoint.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { checkpointCommand } from "../../../src/cli/commands/internal/checkpoint.js";

describe("alloy _checkpoint", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-checkpoint-test-${Date.now()}`);
    changeDir = join(tmpDir, "openspec", "changes", "test-change");
    await mkdir(changeDir, { recursive: true });
    await mkdir(join(tmpDir, "openspec"), { recursive: true });

    execSync("git init -q", { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.name "test-user"', { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });

    // 默认创建 main 分支（git init 默认可能是 master）
    try { execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" }); } catch { /* 已是 main */ }

    // 创建一个初始 commit + main 分支
    await writeFile(join(tmpDir, "README.md"), "# test", "utf-8");
    execSync("git add README.md", { cwd: tmpDir, stdio: "pipe" });
    execSync('git commit -q -m "init"', { cwd: tmpDir, stdio: "pipe" });

    // 写 openspec/config.yaml 配置 main_branch
    await writeFile(
      join(tmpDir, "openspec", "config.yaml"),
      "schema: alloy\nalloy:\n  main_branch: main\n",
      "utf-8"
    );

    // 切到 feature 分支
    execSync("git checkout -b feature/test-change", { cwd: tmpDir, stdio: "pipe" });

    // 写 .alloy.yaml（phase=started + feature_branch）
    const yaml = [
      "phase: started",
      "schema_version: 1",
      "worktree: null",
      "feature_branch: feature/test-change",
      'created_at: "2020-01-01 00:00:00"',
      'updated_at: "2020-01-01 00:00:00"',
      "records: []",
      "skill_usage: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    execSync("git add openspec/", { cwd: tmpDir, stdio: "pipe" });
    execSync('git commit -q -m "init change"', { cwd: tmpDir, stdio: "pipe" });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function listTags(pattern = "alloy-checkpoint-*"): string[] {
    try {
      const out = execSync(`git tag -l "${pattern}"`, { cwd: tmpDir, encoding: "utf-8" }).trim();
      return out ? out.split("\n") : [];
    } catch {
      return [];
    }
  }

  function currentBranch(): string {
    return execSync("git rev-parse --abbrev-ref HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();
  }

  describe("create", () => {
    it("打 tag，注释含锁定制品列表 + phase + 时间", async () => {
      // 加 draft 制品到 records
      await writeFile(join(changeDir, ".alloy.yaml"), [
        "phase: started",
        "schema_version: 1",
        "worktree: null",
        "feature_branch: feature/test-change",
        'created_at: "2020-01-01 00:00:00"',
        'updated_at: "2020-01-01 00:00:00"',
        "records:",
        "  - artifact: draft",
        "    hash: abc123",
        "    committed_at: '2020-01-01 10:00:00'",
        "    approver: test",
        "skill_usage: []",
      ].join("\n"), "utf-8");

      await checkpointCommand(["create", changeDir]);

      const tags = listTags();
      expect(tags.length).toBe(1);
      expect(tags[0]).toMatch(/^alloy-checkpoint-test-change-\d{8}-\d{6}$/);

      // 注释含制品列表
      const annotation = execSync(`git tag -l "${tags[0]}" --format='%(contents)'`, { cwd: tmpDir, encoding: "utf-8" }).trim();
      expect(annotation).toContain("锁定制品: draft");
      expect(annotation).toContain("phase: started");
      expect(annotation).toContain("时间:");
    });

    it("无制品时注释显示（无）", async () => {
      await checkpointCommand(["create", changeDir]);

      const tags = listTags();
      const annotation = execSync(`git tag -l "${tags[0]}" --format='%(contents)'`, { cwd: tmpDir, encoding: "utf-8" }).trim();
      expect(annotation).toContain("锁定制品: （无）");
    });

    it("phase 不是 started 时拒绝（PRECONDITION_FAIL）", async () => {
      // 改 phase 为 planned
      await writeFile(join(changeDir, ".alloy.yaml"), [
        "phase: planned",
        "schema_version: 1",
        "worktree: null",
        "feature_branch: feature/test-change",
        'created_at: "2020-01-01 00:00:00"',
        'updated_at: "2020-01-01 00:00:00"',
        "records: []",
        "skill_usage: []",
      ].join("\n"), "utf-8");

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await checkpointCommand(["create", changeDir]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errSpy.mock.calls.some((c) => String(c[0]).includes("PRECONDITION_FAIL"))).toBe(true);
      expect(listTags().length).toBe(0);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("缺少参数时 exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await checkpointCommand(["create"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("working tree dirty 时拒绝创建", async () => {
      // 创建脏文件
      await writeFile(join(tmpDir, "dirty.txt"), "dirty", "utf-8");

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await checkpointCommand(["create", changeDir]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errSpy.mock.calls.some((c) => String(c[0]).includes("未提交变更"))).toBe(true);
      expect(listTags().length).toBe(0);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });
  });

  describe("list", () => {
    it("无 tag 时输出（无 checkpoint tag）", async () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

      await checkpointCommand(["list", changeDir]);

      expect(logs.join("\n")).toContain("（无 checkpoint tag）");
      spy.mockRestore();
    });

    it("有 tag 时列出 tag + 注释", async () => {
      await checkpointCommand(["create", changeDir]);
      const tags = listTags();
      expect(tags.length).toBe(1);

      const logs: string[] = [];
      const spy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

      await checkpointCommand(["list", changeDir]);

      const output = logs.join("\n");
      expect(output).toContain(tags[0]);
      expect(output).toContain("锁定制品:");
      expect(output).toContain("phase: started");

      spy.mockRestore();
    });

    it("--json 模式输出 JSON", async () => {
      await checkpointCommand(["create", changeDir]);

      const logs: string[] = [];
      const spy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

      await checkpointCommand(["list", changeDir, "--json"]);

      const parsed = JSON.parse(logs[0]);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
      expect(parsed[0]).toHaveProperty("tag");
      expect(parsed[0]).toHaveProperty("annotation");

      spy.mockRestore();
    });

    it("只列出当前 change 的 tag（不混入其他 change）", async () => {
      // 给其他 change 也打个 tag
      execSync('git tag -a "alloy-checkpoint-other-change-20260101-000000" -m "other"', { cwd: tmpDir, stdio: "pipe" });

      await checkpointCommand(["create", changeDir]);

      const logs: string[] = [];
      const spy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

      await checkpointCommand(["list", changeDir, "--json"]);

      const parsed = JSON.parse(logs[0]);
      expect(parsed.length).toBe(1);
      expect(parsed[0].tag).toContain("test-change");

      spy.mockRestore();
    });
  });

  describe("switch", () => {
    it("从 tag 重建分支：删原分支，重建同名分支指向 tag", async () => {
      // 第一次打 tag
      await checkpointCommand(["create", changeDir]);
      const firstTag = listTags()[0];

      // 在 feature 分支上做新 commit
      await writeFile(join(changeDir, "new.md"), "new", "utf-8");
      execSync("git add openspec/", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -q -m "new commit"', { cwd: tmpDir, stdio: "pipe" });

      const headBeforeSwitch = execSync("git rev-parse HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();
      // annotated tag: 用 ^{} 解到指向的 commit
      const tagCommit = execSync(`git rev-parse ${firstTag}^{}`, { cwd: tmpDir, encoding: "utf-8" }).trim();
      expect(headBeforeSwitch).not.toBe(tagCommit);

      // 切回 tag
      await checkpointCommand(["switch", changeDir, firstTag]);

      // HEAD 应该指向 tag 指向的 commit
      const headAfter = execSync("git rev-parse HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();
      expect(headAfter).toBe(tagCommit);

      // 当前分支应该还是 feature/test-change
      expect(currentBranch()).toBe("feature/test-change");
    });

    it("phase 不是 started 时拒绝", async () => {
      await checkpointCommand(["create", changeDir]);
      const tag = listTags()[0];

      // 改 phase 为 planned
      const yamlContent = [
        "phase: planned",
        "schema_version: 1",
        "worktree: null",
        "feature_branch: feature/test-change",
        'created_at: "2020-01-01 00:00:00"',
        'updated_at: "2020-01-01 00:00:00"',
        "records: []",
        "skill_usage: []",
      ].join("\n");
      await writeFile(join(changeDir, ".alloy.yaml"), yamlContent, "utf-8");

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await checkpointCommand(["switch", changeDir, tag]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errSpy.mock.calls.some((c) => String(c[0]).includes("PRECONDITION_FAIL"))).toBe(true);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("tag 不存在时拒绝", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await checkpointCommand(["switch", changeDir, "alloy-checkpoint-test-change-99999999-999999"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errSpy.mock.calls.some((c) => String(c[0]).includes("不存在"))).toBe(true);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("tag 前缀不匹配当前 change 时拒绝", async () => {
      execSync('git tag -a "alloy-checkpoint-other-change-20260101-000000" -m "other"', { cwd: tmpDir, stdio: "pipe" });

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await checkpointCommand(["switch", changeDir, "alloy-checkpoint-other-change-20260101-000000"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errSpy.mock.calls.some((c) => String(c[0]).includes("不属于"))).toBe(true);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("不依赖 main_branch 配置（git checkout -B 原子切换）", async () => {
      // 删除 openspec/config.yaml 的 main_branch 配置
      await writeFile(
        join(tmpDir, "openspec", "config.yaml"),
        "schema: alloy\n",  // 无 alloy.main_branch
        "utf-8"
      );

      await checkpointCommand(["create", changeDir]);
      const tag = listTags()[0];

      // 在 feature 分支做新 commit
      await writeFile(join(changeDir, "new.md"), "new", "utf-8");
      execSync("git add openspec/", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -q -m "new"', { cwd: tmpDir, stdio: "pipe" });

      // 切换——不应该因为没有 main_branch 配置而失败
      await checkpointCommand(["switch", changeDir, tag]);

      // HEAD 在 feature/test-change 分支上，指向 tag commit
      expect(currentBranch()).toBe("feature/test-change");
      const headAfter = execSync("git rev-parse HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();
      const tagCommit = execSync(`git rev-parse ${tag}^{}`, { cwd: tmpDir, encoding: "utf-8" }).trim();
      expect(headAfter).toBe(tagCommit);
    });
  });

  describe("clean", () => {
    it("删除该 change 所有 checkpoint tag", async () => {
      await checkpointCommand(["create", changeDir]);
      // 模拟"等一秒"再打第二个 tag（用不同时间戳）
      await new Promise(r => setTimeout(r, 1100));
      await checkpointCommand(["create", changeDir]);

      expect(listTags().length).toBe(2);

      await checkpointCommand(["clean", changeDir]);

      expect(listTags().length).toBe(0);
    });

    it("不影响其他 change 的 tag", async () => {
      await checkpointCommand(["create", changeDir]);
      execSync('git tag -a "alloy-checkpoint-other-change-20260101-000000" -m "other"', { cwd: tmpDir, stdio: "pipe" });

      await checkpointCommand(["clean", changeDir]);

      const remaining = listTags();
      expect(remaining.length).toBe(1);
      expect(remaining[0]).toContain("other-change");
    });

    it("传 archive 路径（YYYY-MM-DD-<name>）时正确剥离日期前缀", async () => {
      await checkpointCommand(["create", changeDir]);
      expect(listTags().length).toBe(1);

      // 模拟 finish 阶段传 archive 路径：openspec/changes/archive/YYYY-MM-DD-test-change
      const archiveDir = join(tmpDir, "openspec", "changes", "archive", `2026-06-22-test-change`);
      await mkdir(archiveDir, { recursive: true });

      await checkpointCommand(["clean", archiveDir]);

      expect(listTags().length).toBe(0);
    });

    it("list 传 archive 路径时也正确剥离日期前缀", async () => {
      await checkpointCommand(["create", changeDir]);
      const archiveDir = join(tmpDir, "openspec", "changes", "archive", `2026-06-22-test-change`);
      await mkdir(archiveDir, { recursive: true });

      const logs: string[] = [];
      const spy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

      await checkpointCommand(["list", archiveDir, "--json"]);

      const parsed = JSON.parse(logs[0]);
      expect(parsed.length).toBe(1);
      expect(parsed[0].tag).toContain("test-change");

      spy.mockRestore();
    });

    it("无 tag 时正常完成", async () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

      await checkpointCommand(["clean", changeDir]);

      expect(logs.join("\n")).toContain("无 checkpoint tag 需清理");
      spy.mockRestore();
    });
  });

  describe("路由", () => {
    it("未知子命令 exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await checkpointCommand(["unknown"]);

      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("无参数时 exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await checkpointCommand([]);

      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });
  });
});
