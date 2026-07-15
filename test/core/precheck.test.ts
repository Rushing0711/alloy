// test/core/precheck.test.ts
// 用 tmpdir 真实文件系统验证 evaluatePrecheck + formatPrecheckResult。
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// mock execSync(command -v openspec)
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import { evaluatePrecheck, formatPrecheckResult } from "../../src/core/precheck.js";
import { KNOWN_AGENTS } from "../../src/core/agents.js";
import type { AgentInfo } from "../../src/core/types.js";

const mockedExecSync = vi.mocked(execSync);

let tmpDir: string;
let projectDir: string;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `alloy-precheck-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  projectDir = join(tmpDir, "project");
  await mkdir(projectDir, { recursive: true });
  mockedExecSync.mockReset();
  // 默认 openspec CLI 可用
  mockedExecSync.mockReturnValue(Buffer.from("/usr/local/bin/openspec"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// 辅助:在指定 agent 的 project commands 目录创建 cmd 文件
async function createCmdFile(agent: AgentInfo, cmdName: string, scope: "project" | "global" = "project") {
  const base = scope === "project" ? projectDir : tmpDir;
  const agentBase = agent.commandsDir.split("/")[0];
  const commandsSubdir = agent.commandsDir.split("/")[1] || "commands";
  // 横线格式(所有 agent 通用)
  const hyphenName = cmdName.replace(/\//g, "-") + ".md";
  const dir = join(base, agentBase, commandsSubdir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, hyphenName), "# " + cmdName, "utf-8");
}

// 辅助:在指定 agent 的 project skills 目录创建 skill 目录
async function createSkillDir(agent: AgentInfo, skillName: string) {
  const agentBase = agent.commandsDir.split("/")[0];
  const skillsDir = join(projectDir, agentBase, "skills");
  await mkdir(join(skillsDir, skillName), { recursive: true });
  await writeFile(join(skillsDir, skillName, "SKILL.md"), `---\nname: ${skillName}\n---`, "utf-8");
}

describe("evaluatePrecheck - cmd 检测", () => {
  it("cmd 就绪(横线格式 opsx-explore.md) -> found", async () => {
    const opencode = KNOWN_AGENTS.find(a => a.id === "opencode")!;
    await createCmdFile(opencode, "opsx/explore");
    const result = evaluatePrecheck({
      cmds: ["opsx/explore"],
      skills: [],
      projectPath: projectDir,
      targetAgents: [opencode],
    });
    expect(result.exitCode).toBe(0);
    expect(result.found[0].cmds).toContain("opsx/explore");
    expect(result.missing).toHaveLength(0);
  });

  it("cmd 缺失 -> missing + exit 1", async () => {
    const opencode = KNOWN_AGENTS.find(a => a.id === "opencode")!;
    const result = evaluatePrecheck({
      cmds: ["opsx/explore"],
      skills: [],
      projectPath: projectDir,
      targetAgents: [opencode],
    });
    expect(result.exitCode).toBe(1);
    expect(result.missing[0].cmds).toContain("opsx/explore");
  });

  it("Claude Code 子目录格式 opsx/explore.md 也识别", async () => {
    const claude = KNOWN_AGENTS.find(a => a.id === "claude-code")!;
    // 创建 opsx/explore.md(斜杠子目录格式)
    const dir = join(projectDir, ".claude", "commands", "opsx");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "explore.md"), "# explore", "utf-8");
    const result = evaluatePrecheck({
      cmds: ["opsx/explore"],
      skills: [],
      projectPath: projectDir,
      targetAgents: [claude],
    });
    expect(result.exitCode).toBe(0);
    expect(result.found[0].cmds).toContain("opsx/explore");
  });

  it("global scope 的 cmd 也检测(用户级 commands)", async () => {
    const opencode = KNOWN_AGENTS.find(a => a.id === "opencode")!;
    // 在 HOME 的 .config/opencode/commands/ 创建 cmd
    const fakeHome = join(tmpDir, "home");
    await mkdir(join(fakeHome, ".config", "opencode", "commands"), { recursive: true });
    await writeFile(join(fakeHome, ".config", "opencode", "commands", "opsx-explore.md"), "# explore", "utf-8");
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const result = evaluatePrecheck({
        cmds: ["opsx/explore"],
        skills: [],
        projectPath: projectDir,
        targetAgents: [opencode],
      });
      expect(result.exitCode).toBe(0);
    } finally {
      process.env.HOME = originalHome;
    }
  });
});

describe("evaluatePrecheck - skill 检测", () => {
  it("skill 就绪(project 级) -> found", async () => {
    const opencode = KNOWN_AGENTS.find(a => a.id === "opencode")!;
    await createSkillDir(opencode, "brainstorming");
    const result = evaluatePrecheck({
      cmds: [],
      skills: ["brainstorming"],
      projectPath: projectDir,
      targetAgents: [opencode],
    });
    expect(result.exitCode).toBe(0);
    expect(result.found[0].skills).toContain("brainstorming");
  });

  it("skill 缺失 -> missing + exit 1", async () => {
    const opencode = KNOWN_AGENTS.find(a => a.id === "opencode")!;
    const result = evaluatePrecheck({
      cmds: [],
      skills: ["brainstorming"],
      projectPath: projectDir,
      targetAgents: [opencode],
    });
    expect(result.exitCode).toBe(1);
    expect(result.missing[0].skills).toContain("brainstorming");
  });
});

describe("evaluatePrecheck - 多 agent", () => {
  it("多 agent 各自检测(一个就绪一个缺失) -> exit 1", async () => {
    const claude = KNOWN_AGENTS.find(a => a.id === "claude-code")!;
    const opencode = KNOWN_AGENTS.find(a => a.id === "opencode")!;
    // 只给 claude-code 装 cmd
    await createCmdFile(claude, "opsx/explore");
    const result = evaluatePrecheck({
      cmds: ["opsx/explore"],
      skills: [],
      projectPath: projectDir,
      targetAgents: [claude, opencode],
    });
    expect(result.exitCode).toBe(1);
    expect(result.found.find(f => f.agent === "claude-code")!.cmds).toContain("opsx/explore");
    expect(result.missing.find(m => m.agent === "opencode")!.cmds).toContain("opsx/explore");
  });
});

describe("evaluatePrecheck - openspec CLI 检测", () => {
  it("openspec CLI 不可用 -> exit 1", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("not found");
    });
    const opencode = KNOWN_AGENTS.find(a => a.id === "opencode")!;
    const result = evaluatePrecheck({
      cmds: [],
      skills: [],
      projectPath: projectDir,
      targetAgents: [opencode],
    });
    expect(result.exitCode).toBe(1);
    expect(result.openspecCliReady).toBe(false);
  });
});

describe("formatPrecheckResult", () => {
  it("全部就绪 -> ✓ 清单,无引导", () => {
    const opencode = KNOWN_AGENTS.find(a => a.id === "opencode")!;
    const result = evaluatePrecheck({
      cmds: [],
      skills: [],
      projectPath: projectDir,
      targetAgents: [opencode],
    });
    const text = formatPrecheckResult(result);
    expect(text).toContain("✓ openspec CLI");
    expect(text).not.toContain("alloy init");
  });

  it("有缺失 -> ✗ 清单 + 引导 alloy init", async () => {
    const opencode = KNOWN_AGENTS.find(a => a.id === "opencode")!;
    const result = evaluatePrecheck({
      cmds: ["opsx/explore"],
      skills: ["brainstorming"],
      projectPath: projectDir,
      targetAgents: [opencode],
    });
    const text = formatPrecheckResult(result);
    expect(text).toContain("✗ opencode: opsx/explore - 未找到");
    expect(text).toContain("✗ opencode: brainstorming - 未找到");
    expect(text).toContain("alloy init");
  });
});
