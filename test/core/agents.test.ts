import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

import { existsSync } from "node:fs";
import {
  KNOWN_AGENTS,
  COMMAND_IDS,
  detectDeployedAgents,
  getSkillTargetDir,
  CLAUDE_CODE_AGENT,
} from "../../src/core/agents.js";

describe("KNOWN_AGENTS", () => {
  it("应包含 8 个 agent 定义", () => {
    expect(KNOWN_AGENTS).toHaveLength(8);
  });

  it("每个 agent 应有必需字段", () => {
    for (const agent of KNOWN_AGENTS) {
      expect(agent.id).toBeDefined();
      expect(agent.label).toBeDefined();
      expect(agent.supportsColonCommands).toBeDefined();
      expect(agent.commandsDir).toBeDefined();
    }
  });

  it("应包含 claude-code agent", () => {
    const claude = KNOWN_AGENTS.find((a) => a.id === "claude-code");
    expect(claude).toBeDefined();
    expect(claude?.supportsColonCommands).toBe(true);
    expect(claude?.commandsDir).toBe(".claude/commands/");
  });

  it("应包含 cursor agent（不支持冒号命令）", () => {
    const cursor = KNOWN_AGENTS.find((a) => a.id === "cursor");
    expect(cursor).toBeDefined();
    expect(cursor?.supportsColonCommands).toBe(false);
    expect(cursor?.commandsDir).toBe(".cursor/commands/");
  });

  it("codex agent 应标记为 globalOnly", () => {
    const codex = KNOWN_AGENTS.find((a) => a.id === "codex");
    expect(codex).toBeDefined();
    expect(codex?.globalOnly).toBe(true);
  });
});

describe("COMMAND_IDS", () => {
  it("应包含 8 个命令 ID", () => {
    expect(COMMAND_IDS).toHaveLength(8);
  });

  it("应包含所有必需的命令", () => {
    const expected = ["start", "plan", "apply", "archive", "finish", "fix", "discard", "status"];
    expect(COMMAND_IDS).toEqual(expected);
  });
});

describe("detectDeployedAgents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("项目级：检测到支持冒号命令的 agent", () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      const pathStr = path.toString();
      // 模拟 .claude/skills/alloy-start/SKILL.md 存在
      if (pathStr.endsWith(".claude/skills/alloy-start/SKILL.md")) return true;
      return false;
    });

    const agents = detectDeployedAgents("project", "/fake/project");
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe("claude-code");
  });

  it("项目级：检测到不支持冒号命令的 agent", () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      // 模拟 .cursor/skills/alloy-start/SKILL.md 存在
      if (path.toString().includes(".cursor/skills/alloy-start/SKILL.md")) return true;
      return false;
    });

    const agents = detectDeployedAgents("project", "/fake/project");
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe("cursor");
  });

  it("项目级：未检测到任何 agent", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const agents = detectDeployedAgents("project", "/fake/project");
    expect(agents).toHaveLength(0);
  });

  it("全局级：应使用 HOME 路径", () => {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    vi.mocked(existsSync).mockImplementation((path) => {
      const pathStr = path.toString();
      // 检查是否使用了 HOME 路径
      if (pathStr.includes(home) && pathStr.endsWith(".claude/skills/alloy-start/SKILL.md")) return true;
      return false;
    });

    const agents = detectDeployedAgents("global", "/fake/project");
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe("claude-code");
  });
});

describe("getSkillTargetDir", () => {
  it("支持冒号命令的 agent：返回 skills 目录", () => {
    const agent = KNOWN_AGENTS.find((a) => a.id === "claude-code")!;
    const dir = getSkillTargetDir(agent, "project", "/fake/project");
    expect(dir).toBe("/fake/project/.claude/skills");
  });

  it("不支持冒号命令的 agent：也返回 skills 目录", () => {
    const agent = KNOWN_AGENTS.find((a) => a.id === "cursor")!;
    const dir = getSkillTargetDir(agent, "project", "/fake/project");
    expect(dir).toBe("/fake/project/.cursor/skills");
  });

  it("全局级：应使用 HOME 路径", () => {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    const agent = KNOWN_AGENTS.find((a) => a.id === "claude-code")!;
    const dir = getSkillTargetDir(agent, "global", "/fake/project");
    expect(dir).toBe(`${home}/.claude/skills`);
  });
});

describe("CLAUDE_CODE_AGENT", () => {
  it("应是 KNOWN_AGENTS 中 id=claude-code 的对象", () => {
    expect(CLAUDE_CODE_AGENT).toBeDefined();
    expect(CLAUDE_CODE_AGENT.id).toBe("claude-code");
    expect(CLAUDE_CODE_AGENT.commandsDir).toBe(".claude/commands/");
  });
});

describe("agent tier", () => {
  it("claude-code 应为 stable", () => {
    const claudeCode = KNOWN_AGENTS.find((a) => a.id === "claude-code");
    expect(claudeCode?.tier).toBe("stable");
  });

  it("其他 7 个 agent 应为 experimental", () => {
    const experimental = KNOWN_AGENTS.filter((a) => a.id !== "claude-code");
    expect(experimental).toHaveLength(7);
    for (const a of experimental) {
      expect(a.tier).toBe("experimental");
    }
  });
});
