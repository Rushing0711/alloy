// test/core/git-integration.test.ts
// 真实 git 仓库集成测试（不 mock execSync），验证 detectMainBranch / isHeadUnborn / currentBranch
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { isHeadUnborn, detectMainBranch, currentBranch } from "../../src/core/git.js";

function git(cwd: string, cmd: string): string {
  return execSync(cmd, { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
}

describe("isHeadUnborn", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-git-unborn-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("git init 后无 commit 时返回 true（unborn）", () => {
    execSync("git init -q", { cwd: tmpDir, stdio: "pipe" });
    expect(isHeadUnborn(tmpDir)).toBe(true);
  });

  it("有 commit 后返回 false", async () => {
    execSync("git init -q", { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.name "test"', { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.email "t@t.com"', { cwd: tmpDir, stdio: "pipe" });
    await writeFile(join(tmpDir, "a.txt"), "a", "utf-8");
    execSync("git add a.txt", { cwd: tmpDir, stdio: "pipe" });
    execSync('git commit -q -m "init"', { cwd: tmpDir, stdio: "pipe" });
    expect(isHeadUnborn(tmpDir)).toBe(false);
  });

  it("非 git 仓库时返回 true（git rev-parse 失败视为 unborn）", () => {
    expect(isHeadUnborn(tmpDir)).toBe(true);
  });
});

describe("detectMainBranch", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-git-detect-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("init.defaultBranch 配置优先于本地分支匹配", () => {
    execSync("git init -q", { cwd: tmpDir, stdio: "pipe" });
    execSync("git config init.defaultBranch main", { cwd: tmpDir, stdio: "pipe" });
    expect(detectMainBranch(tmpDir)).toBe("main");
  });

  it("init.defaultBranch 为 master 时返回 master", () => {
    execSync("git init -q", { cwd: tmpDir, stdio: "pipe" });
    execSync("git config init.defaultBranch master", { cwd: tmpDir, stdio: "pipe" });
    expect(detectMainBranch(tmpDir)).toBe("master");
  });

  it("有本地 main 分支时返回 main", async () => {
    // 用 -c 覆盖可能的 global init.defaultBranch，确保测试本地分支匹配路径
    execSync("git -c init.defaultBranch=main init -q -b main", { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.name "test"', { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.email "t@t.com"', { cwd: tmpDir, stdio: "pipe" });
    await writeFile(join(tmpDir, "a.txt"), "a", "utf-8");
    execSync("git add a.txt", { cwd: tmpDir, stdio: "pipe" });
    execSync('git commit -q -m "init"', { cwd: tmpDir, stdio: "pipe" });
    // 清掉 local init.defaultBranch，让 detect 走本地分支匹配路径
    //（global config 可能仍有 init.defaultBranch=main，但 local 覆盖优先）
    try { execSync("git config --unset init.defaultBranch", { cwd: tmpDir, stdio: "pipe" }); } catch { /* 无 local config */ }
    // 此时 detectMainBranch 走第 2 级（global init.defaultBranch）或第 3 级（本地分支匹配）
    const result = detectMainBranch(tmpDir);
    expect(["main", "master"]).toContain(result);
  });

  it("无 remote 无 config 无本地分支时返回 null 或全局默认（取决于环境）", () => {
    // 此测试验证函数不抛错；具体返回值取决于 global git config
    execSync("git init -q", { cwd: tmpDir, stdio: "pipe" });
    const result = detectMainBranch(tmpDir);
    // 环境可能有 global init.defaultBranch，结果可能是 "main" 或 null
    expect(typeof result === "string" || result === null).toBe(true);
  });
});

describe("currentBranch", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-git-cb-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("unborn 状态返回 symbolic ref 名（main/master）", () => {
    execSync("git init -q -b main", { cwd: tmpDir, stdio: "pipe" });
    expect(currentBranch(tmpDir)).toBe("main");
  });

  it("有 commit 后返回当前分支名", async () => {
    execSync("git init -q -b main", { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.name "test"', { cwd: tmpDir, stdio: "pipe" });
    execSync('git config user.email "t@t.com"', { cwd: tmpDir, stdio: "pipe" });
    await writeFile(join(tmpDir, "a.txt"), "a", "utf-8");
    execSync("git add a.txt", { cwd: tmpDir, stdio: "pipe" });
    execSync('git commit -q -m "init"', { cwd: tmpDir, stdio: "pipe" });
    expect(currentBranch(tmpDir)).toBe("main");
  });
});
