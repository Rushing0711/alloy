// test/cli/internal/checkpoint.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { checkpointCommand } from "../../../src/cli/commands/internal/checkpoint.js";
import { readState } from "../../../src/cli/utils/state.js";

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
      expect(annotation).toContain("制品: draft");
      expect(annotation).toContain("phase: started");
      expect(annotation).toContain("时间:");
      expect(annotation).toContain("原因:");
    });

    it("无制品时注释显示（无）", async () => {
      await checkpointCommand(["create", changeDir]);

      const tags = listTags();
      const annotation = execSync(`git tag -l "${tags[0]}" --format='%(contents)'`, { cwd: tmpDir, encoding: "utf-8" }).trim();
      expect(annotation).toContain("制品: （无）");
    });

    it("phase 不是 started/planned 时拒绝（PRECONDITION_FAIL）", async () => {
      // 改 phase 为 applied（apply 后禁止检查点）
      await writeFile(join(changeDir, ".alloy.yaml"), [
        "phase: applied",
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

    it("--kind progress 打 progress-<ts> tag", async () => {
      await checkpointCommand(["create", changeDir, "--kind", "progress", "--reason", "回退前快照"]);

      const tags = listTags();
      expect(tags.length).toBe(1);
      expect(tags[0]).toMatch(/^alloy-checkpoint-test-change-progress-\d{8}-\d{6}$/);

      const annotation = execSync(`git tag -l "${tags[0]}" --format='%(contents)'`, { cwd: tmpDir, encoding: "utf-8" }).trim();
      expect(annotation).toContain("原因: 回退前快照");
      expect(annotation).toContain("phase: started");
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

    it("--kind progress 时允许 dirty(越界回退场景)", async () => {
      // 创建脏文件(模拟 user-gate reset 修改 .alloy.yaml + 未锁定制品 untracked)
      await writeFile(join(changeDir, ".alloy.yaml"), "phase: planning\n", "utf-8");
      await writeFile(join(changeDir, "plans.md"), "untracked artifact", "utf-8");
      execSync("git add openspec/changes/test-change/.alloy.yaml", { cwd: tmpDir, stdio: "pipe" });
      await writeFile(join(changeDir, ".alloy.yaml"), "phase: planning\npending_gate: null\n", "utf-8");

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // 应该成功创建 progress 检查点(不报 PRECONDITION_FAIL)
      await checkpointCommand(["create", changeDir, "--kind", "progress", "--reason", "回退前快照"]);

      const tags = listTags();
      expect(tags.length).toBe(1);
      expect(tags[0]).toContain("progress-");

      // 应该输出 dirty 告知信息
      expect(logSpy.mock.calls.some((c) => String(c[0]).includes("progress 检查点允许 dirty"))).toBe(true);

      logSpy.mockRestore();
    });

    it("--kind brainstorming 时仍拒绝非 .alloy.yaml dirty(锚点语义严格)", async () => {
      await writeFile(join(tmpDir, "dirty.txt"), "dirty", "utf-8");

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await checkpointCommand(["create", changeDir, "--kind", "brainstorming"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errSpy.mock.calls.some((c) => String(c[0]).includes("未提交变更"))).toBe(true);
      expect(listTags().length).toBe(0);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("--kind brainstorming 时仅 .alloy.yaml dirty(_skill log 写入)自动 commit 后创建检查点", async () => {
      // 模拟越界回退场景:_skill log 写 .alloy.yaml 不 commit,draft hash 未变 _artifact commit 跳过
      // 先正常锁定 draft(写 records + commit)
      await writeFile(join(changeDir, "draft.md"), "draft content", "utf-8");
      execSync("git add openspec/changes/test-change/draft.md", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -q -m "lock draft"', { cwd: tmpDir, stdio: "pipe" });
      const draftHash = execSync('node -e "const crypto=require(\'crypto\');const fs=require(\'fs\');const c=fs.readFileSync(\'' + join(changeDir, "draft.md") + '\',\'utf-8\').replace(/^> 生成时间:.*$/m,\'\');console.log(crypto.createHash(\'sha256\').update(c).digest(\'hex\').slice(0,12))"', { encoding: "utf-8" }).trim();
      const stateContent = `phase: started\nrecords:\n  - artifact: draft\n    hash: ${draftHash}\n    committed_at: "2026-07-21 08:00:00"\n    approver: emon\n`;
      await writeFile(join(changeDir, ".alloy.yaml"), stateContent, "utf-8");
      execSync("git add openspec/changes/test-change/.alloy.yaml", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -q -m "records"', { cwd: tmpDir, stdio: "pipe" });

      // 模拟 _skill log 写 .alloy.yaml(不 commit)
      const { writeState } = await import("../../../src/cli/utils/state.js");
      const state = await readState(changeDir);
      state.skill_usage = [{
        skill: "superpowers:brainstorming",
        stage: "start",
        used: true,
        called_at: "2026-07-21 09:00:00",
        count: 1,
      }];
      await writeState(changeDir, state);
      // 此时 .alloy.yaml dirty(未 commit),draft.md 未变

      vi.spyOn(console, "log").mockImplementation(() => {});

      await checkpointCommand(["create", changeDir, "--kind", "brainstorming", "--reason", "发起变更后重新生成 draft"]);

      // 应自动 commit .alloy.yaml 后创建检查点
      const tags = listTags();
      expect(tags.length).toBe(1);
      expect(tags[0]).toContain("brainstorming-1");

      // working tree 应 clean(自动 commit 后)
      const status = execSync("git status --porcelain", { cwd: tmpDir, encoding: "utf-8" }).trim();
      expect(status).toBe("");
    });

    it("--kind brainstorming 时 draft hash 不一致 -> PRECONDITION_FAIL(防 agent 跳 _artifact commit)", async () => {
      // 先正常锁定 draft(写 records + commit)
      await writeFile(join(changeDir, "draft.md"), "original draft content", "utf-8");
      execSync("git add openspec/changes/test-change/draft.md", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -q -m "lock draft"', { cwd: tmpDir, stdio: "pipe" });
      // 写 records(含 draft hash)
      const draftHash = execSync('node -e "const crypto=require(\'crypto\');const fs=require(\'fs\');const c=fs.readFileSync(\'' + join(changeDir, "draft.md") + '\',\'utf-8\').replace(/^> 生成时间:.*$/m,\'\');console.log(crypto.createHash(\'sha256\').update(c).digest(\'hex\').slice(0,12))"', { encoding: "utf-8" }).trim();
      const stateContent = `phase: started\nrecords:\n  - artifact: draft\n    hash: ${draftHash}\n    committed_at: "2026-07-21 08:00:00"\n    approver: emon\n`;
      await writeFile(join(changeDir, ".alloy.yaml"), stateContent, "utf-8");
      execSync("git add openspec/changes/test-change/.alloy.yaml", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -q -m "records"', { cwd: tmpDir, stdio: "pipe" });

      // agent 跳过 _artifact commit,直接 Write 修改 draft.md(模拟 Pi 会话 L113)
      await writeFile(join(changeDir, "draft.md"), "modified draft content (agent direct Write)", "utf-8");
      // git add + commit(agent 也跑了 git commit,但 records hash 未更新)
      execSync("git add openspec/changes/test-change/draft.md", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -q -m "agent direct commit"', { cwd: tmpDir, stdio: "pipe" });

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await checkpointCommand(["create", changeDir, "--kind", "brainstorming", "--reason", "发起变更后重新生成 draft"]);

      // 应拒绝:records hash 与 draft.md 文件 hash 不一致
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errSpy.mock.calls.some((c) => String(c[0]).includes("draft hash 不一致"))).toBe(true);
      expect(listTags().length).toBe(0);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("--kind brainstorming 时 draft hash 一致 -> 成功创建", async () => {
      // 正常流程:锁定 draft + 写 records(hash 一致)
      await writeFile(join(changeDir, "draft.md"), "draft content", "utf-8");
      execSync("git add openspec/changes/test-change/draft.md", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -q -m "lock draft"', { cwd: tmpDir, stdio: "pipe" });
      const draftHash = execSync('node -e "const crypto=require(\'crypto\');const fs=require(\'fs\');const c=fs.readFileSync(\'' + join(changeDir, "draft.md") + '\',\'utf-8\').replace(/^> 生成时间:.*$/m,\'\');console.log(crypto.createHash(\'sha256\').update(c).digest(\'hex\').slice(0,12))"', { encoding: "utf-8" }).trim();
      const stateContent = `phase: started\nrecords:\n  - artifact: draft\n    hash: ${draftHash}\n    committed_at: "2026-07-21 08:00:00"\n    approver: emon\n`;
      await writeFile(join(changeDir, ".alloy.yaml"), stateContent, "utf-8");
      execSync("git add openspec/changes/test-change/.alloy.yaml", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -q -m "records"', { cwd: tmpDir, stdio: "pipe" });

      // hash 一致,应成功创建
      await checkpointCommand(["create", changeDir, "--kind", "brainstorming", "--reason", "draft 锁定"]);

      const tags = listTags();
      expect(tags.length).toBe(1);
      expect(tags[0]).toContain("brainstorming-1");
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
      expect(output).toContain("制品:");
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

    it("apply 中后期（worktree 已创建）时拒绝", async () => {
      await checkpointCommand(["create", changeDir]);
      const tag = listTags()[0];

      // phase=applied + worktree 有值 = apply 中后期
      const yamlContent = [
        "phase: applied",
        "schema_version: 1",
        "worktree: .worktrees/test-change",
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

    it("apply 早期（worktree 未创建 + SDD/EP 未启动）允许检查点操作", async () => {
      // 先在 started 阶段创建一个 tag（create 需要 working tree clean）
      await checkpointCommand(["create", changeDir]);
      const tag = listTags()[0];

      // 改 phase=applied + worktree=null + skill_usage=[] = apply 早期
      const yamlContent = [
        "phase: applied",
        "schema_version: 1",
        "worktree: null",
        "feature_branch: feature/test-change",
        'created_at: "2020-01-01 00:00:00"',
        'updated_at: "2020-01-01 00:00:00"',
        "records: []",
        "skill_usage: []",
      ].join("\n");
      await writeFile(join(changeDir, ".alloy.yaml"), yamlContent, "utf-8");

      // switch 应该成功（apply 早期允许，不 exit(1)）
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      await checkpointCommand(["switch", changeDir, tag]);
      expect(exitSpy).not.toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
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

    it("切换前自动清理未提交 tracked 修改(dirty working tree)", async () => {
      await checkpointCommand(["create", changeDir]);
      const tag = listTags()[0];

      // 在 feature 分支做新 commit(让 HEAD 超前 tag)
      await writeFile(join(changeDir, "committed.md"), "committed", "utf-8");
      execSync("git add openspec/", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -q -m "committed"', { cwd: tmpDir, stdio: "pipe" });

      // 制造未 commit 的 tracked 修改
      await writeFile(join(changeDir, "draft.md"), "dirty modification", "utf-8");
      const dirty = execSync("git status --porcelain", { cwd: tmpDir, encoding: "utf-8" }).trim();
      expect(dirty).toContain("draft.md");

      // 切换应自动清理 dirty,不报错
      await checkpointCommand(["switch", changeDir, tag]);

      // HEAD 应指向 tag commit
      const headAfter = execSync("git rev-parse HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();
      const tagCommit = execSync(`git rev-parse ${tag}^{}`, { cwd: tmpDir, encoding: "utf-8" }).trim();
      expect(headAfter).toBe(tagCommit);
    });

    it("切换前自动清理 untracked 制品文件(design.md 等残留)", async () => {
      await checkpointCommand(["create", changeDir]);
      const tag = listTags()[0];

      // 在 feature 分支做新 commit(让 HEAD 超前 tag)
      await writeFile(join(changeDir, "committed.md"), "committed", "utf-8");
      execSync("git add openspec/", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -q -m "committed"', { cwd: tmpDir, stdio: "pipe" });

      // 制造 untracked 制品文件(模拟 plan 阶段生成的 design.md 未锁定就回退)
      await writeFile(join(changeDir, "design.md"), "untracked design content", "utf-8");
      await writeFile(join(changeDir, "proposal.md"), "untracked proposal", "utf-8");
      await mkdir(join(changeDir, "specs"), { recursive: true });
      await writeFile(join(changeDir, "specs", "spec.md"), "untracked spec", "utf-8");

      // 制造用户自定义文件(不应被删)
      await writeFile(join(changeDir, "notes.md"), "user notes", "utf-8");

      // 切换--应清理 untracked 制品,保留 notes.md
      await checkpointCommand(["switch", changeDir, tag]);

      // untracked 制品文件应被删除
      expect(existsSync(join(changeDir, "design.md"))).toBe(false);
      expect(existsSync(join(changeDir, "proposal.md"))).toBe(false);
      expect(existsSync(join(changeDir, "specs"))).toBe(false);

      // 用户自定义文件应保留
      expect(existsSync(join(changeDir, "notes.md"))).toBe(true);
    });

    it("切换前清理 untracked 制品只删当前 change(不误删其他 change)", async () => {
      // 创建第二个 change 目录
      const otherChangeDir = join(tmpDir, "openspec", "changes", "other-change");
      await mkdir(otherChangeDir, { recursive: true });
      await writeFile(join(otherChangeDir, ".alloy.yaml"), "phase: planning\n", "utf-8");
      await writeFile(join(otherChangeDir, "design.md"), "other change design", "utf-8");
      execSync("git add openspec/changes/other-change/", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -q -m "other change"', { cwd: tmpDir, stdio: "pipe" });

      // 在主 change 打 tag + 做新 commit + 制造 untracked 制品
      await checkpointCommand(["create", changeDir]);
      const tag = listTags()[0];
      await writeFile(join(changeDir, "committed.md"), "committed", "utf-8");
      execSync("git add openspec/", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -q -m "committed"', { cwd: tmpDir, stdio: "pipe" });
      await writeFile(join(changeDir, "design.md"), "main change untracked", "utf-8");

      // 切换--应只删主 change 的 design.md,不动 other-change 的 design.md
      await checkpointCommand(["switch", changeDir, tag]);

      expect(existsSync(join(changeDir, "design.md"))).toBe(false);
      expect(existsSync(join(otherChangeDir, "design.md"))).toBe(true);
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

    it("--verify 清理后校验通过(无残留)", async () => {
      await checkpointCommand(["create", changeDir]);
      expect(listTags().length).toBe(1);

      const logs: string[] = [];
      const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

      await checkpointCommand(["clean", changeDir, "--verify"]);

      expect(listTags().length).toBe(0);
      expect(logs.some(l => l.includes("--verify 校验通过"))).toBe(true);

      logSpy.mockRestore();
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
