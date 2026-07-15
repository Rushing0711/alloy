// test/core/infra-commit.test.ts
// 用 tmpdir 真实 git 仓库验证 getInfraCommitTargets + executeInfraCommit。
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { getInfraCommitTargets, executeInfraCommit } from "../../src/core/infra-commit.js";
import { KNOWN_AGENTS } from "../../src/core/agents.js";
import type { AgentInfo } from "../../src/core/types.js";

let tmpDir: string;
let projectDir: string;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `alloy-infra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  projectDir = join(tmpDir, "project");
  await mkdir(projectDir, { recursive: true });
  // 初始化 git 仓库
  execSync("git init -q", { cwd: projectDir });
  execSync('git config user.name "test"', { cwd: projectDir });
  execSync('git config user.email "test@test.com"', { cwd: projectDir });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("getInfraCommitTargets", () => {
  it("动态推导 agent 目录(含 .agents/ 共享目录)", () => {
    const claude = KNOWN_AGENTS.find(a => a.id === "claude-code")!;
    const opencode = KNOWN_AGENTS.find(a => a.id === "opencode")!;
    const targets = getInfraCommitTargets(projectDir, [claude, opencode]);
    expect(targets).toContain(".claude/");
    expect(targets).toContain(".opencode/");
    expect(targets).toContain(".agents/");
    expect(targets).toContain(".gitignore");
    expect(targets).toContain(".gitattributes");
    expect(targets).toContain("openspec/config.yaml");
    expect(targets).toContain("openspec/schemas/");
  });

  it("含 opencode 时加 opencode.json(根目录配置)", () => {
    const opencode = KNOWN_AGENTS.find(a => a.id === "opencode")!;
    const targets = getInfraCommitTargets(projectDir, [opencode]);
    expect(targets).toContain("opencode.json");
  });

  it("不含 opencode 时不加 opencode.json", () => {
    const claude = KNOWN_AGENTS.find(a => a.id === "claude-code")!;
    const targets = getInfraCommitTargets(projectDir, [claude]);
    expect(targets).not.toContain("opencode.json");
  });

  it("CLAUDE.md 存在时加入 targets", async () => {
    await writeFile(join(projectDir, "CLAUDE.md"), "# claude", "utf-8");
    const claude = KNOWN_AGENTS.find(a => a.id === "claude-code")!;
    const targets = getInfraCommitTargets(projectDir, [claude]);
    expect(targets).toContain("CLAUDE.md");
  });

  it("AGENTS.md 存在时加入 targets", async () => {
    await writeFile(join(projectDir, "AGENTS.md"), "# agents", "utf-8");
    const opencode = KNOWN_AGENTS.find(a => a.id === "opencode")!;
    const targets = getInfraCommitTargets(projectDir, [opencode]);
    expect(targets).toContain("AGENTS.md");
  });
});

describe("executeInfraCommit", () => {
  it("逐个 git add + commit(有变更 -> committed=true)", async () => {
    // 创建一些基础设施文件
    await mkdir(join(projectDir, ".claude", "commands"), { recursive: true });
    await writeFile(join(projectDir, ".claude", "commands", "opsx-explore.md"), "# explore", "utf-8");
    await writeFile(join(projectDir, ".gitignore"), "node_modules\n", "utf-8");
    await mkdir(join(projectDir, "openspec", "schemas"), { recursive: true });
    await writeFile(join(projectDir, "openspec", "config.yaml"), "schema: alloy\n", "utf-8");

    const claude = KNOWN_AGENTS.find(a => a.id === "claude-code")!;
    const result = executeInfraCommit(projectDir, [claude], "chore: test infra commit");
    expect(result.committed).toBe(true);
    expect(result.addedTargets.length).toBeGreaterThan(0);

    // 验证 commit 已创建
    const log = execSync("git log --oneline", { cwd: projectDir, encoding: "utf-8" });
    expect(log).toContain("test infra commit");
  });

  it("幂等:无暂存变更 -> committed=false", async () => {
    // 先做一次 commit
    await mkdir(join(projectDir, ".claude", "commands"), { recursive: true });
    await writeFile(join(projectDir, ".claude", "commands", "opsx-explore.md"), "# explore", "utf-8");
    const claude = KNOWN_AGENTS.find(a => a.id === "claude-code")!;
    executeInfraCommit(projectDir, [claude], "chore: first commit");

    // 再调一次,无新变更
    const result = executeInfraCommit(projectDir, [claude], "chore: second commit");
    expect(result.committed).toBe(false);

    // 只有一个 commit
    const log = execSync("git log --oneline", { cwd: projectDir, encoding: "utf-8" });
    expect(log).not.toContain("second commit");
  });

  it("多 agent:opencode.json 也被 add", async () => {
    await mkdir(join(projectDir, ".opencode", "commands"), { recursive: true });
    await writeFile(join(projectDir, ".opencode", "commands", "alloy-start.md"), "# wrapper", "utf-8");
    await writeFile(join(projectDir, "opencode.json"), '{"permission":{}}', "utf-8");

    const opencode = KNOWN_AGENTS.find(a => a.id === "opencode")!;
    const result = executeInfraCommit(projectDir, [opencode], "chore: test opencode");
    expect(result.committed).toBe(true);
    expect(result.addedTargets).toContain("opencode.json");

    // 验证 opencode.json 在 commit 里
    const show = execSync("git show --stat --name-only HEAD", { cwd: projectDir, encoding: "utf-8" });
    expect(show).toContain("opencode.json");
  });

  it("文件不存在的 target 跳过(不报错)", () => {
    const claude = KNOWN_AGENTS.find(a => a.id === "claude-code")!;
    // 没创建任何文件,所有 git add 都失败,但不应抛异常
    const result = executeInfraCommit(projectDir, [claude], "chore: empty");
    expect(result.committed).toBe(false);
  });
});
