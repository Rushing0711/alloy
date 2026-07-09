// test/cli/pre-commit-hook.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { ensurePreCommitHook } from "../../src/cli/commands/init.js";

describe("ensurePreCommitHook", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "alloy-precommit-"));
    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it(".git/hooks/pre-commit 不存在 -> 创建 + 可执行", async () => {
    await ensurePreCommitHook(tmpDir);
    const hookPath = join(tmpDir, ".git", "hooks", "pre-commit");
    expect(existsSync(hookPath)).toBe(true);
    const content = await readFile(hookPath, "utf-8");
    expect(content).toContain("_pre-commit-check");
    expect(content).toContain("node");
    // 可执行位
    const mode = statSync(hookPath).mode;
    expect(mode & 0o111).toBeTruthy();
  });

  it("已存在且含 _pre-commit-check -> 幂等跳过(内容不变)", async () => {
    await ensurePreCommitHook(tmpDir);
    const hookPath = join(tmpDir, ".git", "hooks", "pre-commit");
    const content1 = await readFile(hookPath, "utf-8");

    await ensurePreCommitHook(tmpDir);
    const content2 = await readFile(hookPath, "utf-8");

    expect(content2).toBe(content1);
  });

  it("已存在但不含 _pre-commit-check(用户自己的 hook)-> 追加 alloy 检查", async () => {
    const hookPath = join(tmpDir, ".git", "hooks", "pre-commit");
    await writeFile(hookPath, "#!/bin/sh\necho 'user hook'\n", "utf-8");

    await ensurePreCommitHook(tmpDir);

    const content = await readFile(hookPath, "utf-8");
    expect(content).toContain("echo 'user hook'");
    expect(content).toContain("_pre-commit-check");
  });

  it("hook 内容含绝对路径(node <path>/dist/cli/index.js)", async () => {
    await ensurePreCommitHook(tmpDir);
    const hookPath = join(tmpDir, ".git", "hooks", "pre-commit");
    const content = await readFile(hookPath, "utf-8");
    expect(content).toMatch(/node\s+\S+\/dist\/cli\/index\.js\s+_pre-commit-check/);
  });
});
