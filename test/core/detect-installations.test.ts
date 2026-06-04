// test/core/detect-installations.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// 部分 mock：只 mock existsSync，readdirSync 保持真实（源码用 require("node:fs") 访问）
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});
vi.mock("node:os", async () => {
  const actual = await vi.importActual("node:os");
  return {
    ...actual,
    homedir: vi.fn(),
  };
});

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { detectCommand, detectSkill } from "../../src/core/detect-installations.js";
import type { AgentInfo } from "../../src/core/types.js";

const claudeAgent: AgentInfo = {
  id: "claude-code",
  label: "Claude Code",
  supportsColonCommands: true,
  commandsDir: ".claude/commands/",
};

const cursorAgent: AgentInfo = {
  id: "cursor",
  label: "Cursor",
  supportsColonCommands: false,
  commandsDir: ".cursor/commands/",
};

const PROJECT = "/test/project";
const HOME = "/home/user";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(homedir).mockReturnValue(HOME);
});

// ---------------------------------------------------------------------------
// detectCommand
// ---------------------------------------------------------------------------
describe("detectCommand", () => {
  it("找到项目级 command 时返回 project-command", () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      p === `${PROJECT}/.claude/commands/start.md`
    );

    const result = detectCommand("start", claudeAgent, PROJECT);

    expect(result).toEqual({
      found: true,
      location: "project-command",
      path: `${PROJECT}/.claude/commands/start.md`,
      version: null,
    });
    expect(existsSync).toHaveBeenCalledWith(`${PROJECT}/.claude/commands/start.md`);
  });

  it("找到用户级 command 时返回 user-command", () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      p === `${HOME}/.claude/commands/start.md`
    );

    const result = detectCommand("start", claudeAgent, PROJECT);

    expect(result).toEqual({
      found: true,
      location: "user-command",
      path: `${HOME}/.claude/commands/start.md`,
      version: null,
    });
    expect(existsSync).toHaveBeenCalledWith(`${HOME}/.claude/commands/start.md`);
  });

  it("项目级和用户级都存在时，优先返回项目级", () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const result = detectCommand("start", claudeAgent, PROJECT);

    expect(result.found).toBe(true);
    expect(result.location).toBe("project-command");
    expect(result.path).toBe(`${PROJECT}/.claude/commands/start.md`);
  });

  it("都不存在时返回 NOT_FOUND", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = detectCommand("start", claudeAgent, PROJECT);

    expect(result).toEqual({
      found: false,
      location: null,
      path: null,
      version: null,
    });
  });

  it("Cursor agent 使用 .cursor/commands/ 路径", () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      p === `${PROJECT}/.cursor/commands/plan.md`
    );

    const result = detectCommand("plan", cursorAgent, PROJECT);

    expect(result).toEqual({
      found: true,
      location: "project-command",
      path: `${PROJECT}/.cursor/commands/plan.md`,
      version: null,
    });
    expect(existsSync).toHaveBeenCalledWith(`${PROJECT}/.cursor/commands/plan.md`);
  });

  it("Cursor agent 未找到时检查用户级路径", () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      p === `${HOME}/.cursor/commands/plan.md`
    );

    const result = detectCommand("plan", cursorAgent, PROJECT);

    expect(result).toEqual({
      found: true,
      location: "user-command",
      path: `${HOME}/.cursor/commands/plan.md`,
      version: null,
    });
  });
});

// ---------------------------------------------------------------------------
// detectSkill
// ---------------------------------------------------------------------------
describe("detectSkill", () => {
  it("非 Claude Code agent 直接返回 NOT_FOUND", () => {
    const result = detectSkill("superpowers", cursorAgent, PROJECT);

    expect(result).toEqual({
      found: false,
      location: null,
      path: null,
      version: null,
    });
    expect(existsSync).not.toHaveBeenCalled();
  });

  it("找到项目级 skill 时返回 project-skill", () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      p === `${PROJECT}/.claude/skills/superpowers`
    );

    const result = detectSkill("superpowers", claudeAgent, PROJECT);

    expect(result).toEqual({
      found: true,
      location: "project-skill",
      path: `${PROJECT}/.claude/skills/superpowers`,
      version: null,
    });
  });

  it("找到用户级 skill 时返回 user-skill", () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      p === `${HOME}/.claude/skills/superpowers`
    );

    const result = detectSkill("superpowers", claudeAgent, PROJECT);

    expect(result).toEqual({
      found: true,
      location: "user-skill",
      path: `${HOME}/.claude/skills/superpowers`,
      version: null,
    });
  });

  it("项目级和用户级 skill 都存在时，优先返回项目级", () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      p === `${PROJECT}/.claude/skills/superpowers` ||
      p === `${HOME}/.claude/skills/superpowers`
    );

    const result = detectSkill("superpowers", claudeAgent, PROJECT);

    expect(result.found).toBe(true);
    expect(result.location).toBe("project-skill");
  });

  it("都不存在时返回 NOT_FOUND", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = detectSkill("superpowers", claudeAgent, PROJECT);

    expect(result).toEqual({
      found: false,
      location: null,
      path: null,
      version: null,
    });
  });
});

// ---------------------------------------------------------------------------
// detectSkill — plugin 检测（使用真实临时目录，因为源码用 require("node:fs") 访问 readdirSync）
// ---------------------------------------------------------------------------
describe("detectSkill — plugin 检测", () => {
  let tmpHome: string;

  beforeEach(async () => {
    tmpHome = join(tmpdir(), `alloy-detect-test-${Date.now()}`);
    vi.mocked(homedir).mockReturnValue(tmpHome);
  });

  afterEach(async () => {
    await rm(tmpHome, { recursive: true, force: true });
  });

  it("找到用户级 plugin 时返回 user-plugin 并附带版本", async () => {
    // 创建 plugin 目录结构
    const pluginBase = join(tmpHome, ".claude", "plugins", "cache", "superpowers-marketplace", "superpowers");
    const skillDir = join(pluginBase, "5.2.0", "skills", "superpowers");
    await mkdir(skillDir, { recursive: true });

    vi.mocked(existsSync).mockImplementation((p) => {
      // 项目级和用户级 skill 不存在，plugin base 和 skill 存在
      const str = String(p);
      return str === pluginBase || str === skillDir;
    });

    const result = detectSkill("superpowers", claudeAgent, PROJECT);

    expect(result).toEqual({
      found: true,
      location: "user-plugin",
      path: skillDir,
      version: "5.2.0",
    });
  });

  it("plugin 目录中多个版本时返回其中一个", async () => {
    const pluginBase = join(tmpHome, ".claude", "plugins", "cache", "superpowers-marketplace", "superpowers");
    const skillDir1 = join(pluginBase, "5.1.0", "skills", "superpowers");
    const skillDir2 = join(pluginBase, "5.2.0", "skills", "superpowers");
    await mkdir(skillDir1, { recursive: true });
    await mkdir(skillDir2, { recursive: true });

    vi.mocked(existsSync).mockImplementation((p) => {
      const str = String(p);
      return str === pluginBase || str === skillDir1 || str === skillDir2;
    });

    const result = detectSkill("superpowers", claudeAgent, PROJECT);

    expect(result.location).toBe("user-plugin");
    // readdirSync 返回的顺序取决于文件系统，但 version 应该是 5.1.0 或 5.2.0
    expect(["5.1.0", "5.2.0"]).toContain(result.version);
    expect(result.path).toContain(result.version!);
  });

  it("plugin 目录中跳过非目录条目", async () => {
    const pluginBase = join(tmpHome, ".claude", "plugins", "cache", "superpowers-marketplace", "superpowers");
    // 创建一个普通文件（非目录）
    await mkdir(pluginBase, { recursive: true });
    await writeFile(join(pluginBase, "readme.txt"), "");
    // 创建版本目录
    const skillDir = join(pluginBase, "5.2.0", "skills", "superpowers");
    await mkdir(skillDir, { recursive: true });

    vi.mocked(existsSync).mockImplementation((p) => {
      const str = String(p);
      return str === pluginBase || str === skillDir;
    });

    const result = detectSkill("superpowers", claudeAgent, PROJECT);

    expect(result.location).toBe("user-plugin");
    expect(result.version).toBe("5.2.0");
    expect(result.path).toBe(skillDir);
  });

  it("plugin 目录存在但目标 skill 不存在时返回 NOT_FOUND", async () => {
    const pluginBase = join(tmpHome, ".claude", "plugins", "cache", "superpowers-marketplace", "superpowers");
    // 创建版本目录但不创建 skill 子目录
    await mkdir(join(pluginBase, "5.2.0", "skills"), { recursive: true });

    vi.mocked(existsSync).mockImplementation((p) => {
      const str = String(p);
      return str === pluginBase;
    });

    const result = detectSkill("nonexistent", claudeAgent, PROJECT);

    expect(result).toEqual({
      found: false,
      location: null,
      path: null,
      version: null,
    });
  });
});
