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
  detectAgent,
} from "../../src/core/agents.js";

describe("KNOWN_AGENTS", () => {
  it("应包含 4 个 agent 定义", () => {
    expect(KNOWN_AGENTS).toHaveLength(4);
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

  it("应包含 opencode agent（不支持冒号命令）", () => {
    const opencode = KNOWN_AGENTS.find((a) => a.id === "opencode");
    expect(opencode).toBeDefined();
    expect(opencode?.supportsColonCommands).toBe(false);
    expect(opencode?.commandsDir).toBe(".opencode/commands/");
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
      // 模拟 .opencode/skills/alloy-start/SKILL.md 存在
      if (path.toString().includes(".opencode/skills/alloy-start/SKILL.md")) return true;
      return false;
    });

    const agents = detectDeployedAgents("project", "/fake/project");
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe("opencode");
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
    const agent = KNOWN_AGENTS.find((a) => a.id === "opencode")!;
    const dir = getSkillTargetDir(agent, "project", "/fake/project");
    expect(dir).toBe("/fake/project/.opencode/skills");
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

  it("其他 3 个 agent 应为 experimental", () => {
    const experimental = KNOWN_AGENTS.filter((a) => a.id !== "claude-code");
    expect(experimental).toHaveLength(3);
    for (const a of experimental) {
      expect(a.tier).toBe("experimental");
    }
  });
});

describe("detectAgent(运行时 agent 检测)", () => {
  const originalAiAgent = process.env.AI_AGENT;
  const originalClaudecode = process.env.CLAUDECODE;

  afterEach(() => {
    if (originalAiAgent === undefined) delete process.env.AI_AGENT;
    else process.env.AI_AGENT = originalAiAgent;
    if (originalClaudecode === undefined) delete process.env.CLAUDECODE;
    else process.env.CLAUDECODE = originalClaudecode;
  });

  it("AI_AGENT=claude-code_2-1-153_agent -> claude-code", () => {
    process.env.AI_AGENT = "claude-code_2-1-153_agent";
    delete process.env.CLAUDECODE;
    expect(detectAgent()).toBe("claude-code");
  });

  it("AI_AGENT=opencode_1-0-0_agent -> opencode", () => {
    process.env.AI_AGENT = "opencode_1-0-0_agent";
    delete process.env.CLAUDECODE;
    expect(detectAgent()).toBe("opencode");
  });

  it("AI_AGENT=codex_0-5-0_agent -> codex", () => {
    process.env.AI_AGENT = "codex_0-5-0_agent";
    delete process.env.CLAUDECODE;
    expect(detectAgent()).toBe("codex");
  });

  it("AI_AGENT 无 _agent 后缀 -> 原样返回", () => {
    process.env.AI_AGENT = "some-unknown-agent";
    delete process.env.CLAUDECODE;
    expect(detectAgent()).toBe("some-unknown-agent");
  });

  it("无 AI_AGENT + CLAUDECODE=1 -> claude-code(回退)", () => {
    delete process.env.AI_AGENT;
    process.env.CLAUDECODE = "1";
    expect(detectAgent()).toBe("claude-code");
  });

  it("无任何标记环境变量 -> unknown", () => {
    delete process.env.AI_AGENT;
    delete process.env.CLAUDECODE;
    expect(detectAgent()).toBe("unknown");
  });
});
