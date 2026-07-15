// test/core/init-matrix.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock 依赖模块
vi.mock("../../src/utils/fs.js", () => ({
  getPackageRoot: vi.fn(),
}));

vi.mock("../../src/core/compat.js", () => ({
  loadCompat: vi.fn(),
}));

vi.mock("../../src/core/skills.js", () => ({
  detectAlloySkillsVersion: vi.fn(),
}));

vi.mock("../../src/core/detect-installations.js", () => ({
  detectSkill: vi.fn(),
}));

// 部分模拟 agent-config:保留 getHookSupportedAgents/getPermissionSupportedAgents 真实实现,
// 仅 mock hasHookConfig/hasPermissionsConfig(避免触碰真实文件系统)
vi.mock("../../src/core/agent-config.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/core/agent-config.js")>(
    "../../src/core/agent-config.js"
  );
  return {
    ...actual,
    hasHookConfig: vi.fn(),
    hasPermissionsConfig: vi.fn(),
  };
});

import { getPackageRoot } from "../../src/utils/fs.js";
import { loadCompat } from "../../src/core/compat.js";
import { detectAlloySkillsVersion } from "../../src/core/skills.js";
import { detectSkill } from "../../src/core/detect-installations.js";
import { hasHookConfig, hasPermissionsConfig } from "../../src/core/agent-config.js";
import { detectInitMatrix } from "../../src/core/init-matrix.js";
import type { AgentInfo } from "../../src/core/types.js";
import type { InitMatrix } from "../../src/core/init-matrix.js";

// compat.yaml 默认 mock(与仓库 compat.yaml 一致)
const MOCK_COMPAT = {
  compatible: {
    node: ">=18.0.0",
    git: ">=2.20.0",
    openspec: ">=1.3.0 <2.0.0",
    superpowers: ">=5.0.0 <7.0.0",
    alloy: ">=0.3.0",
    schema: 1,
  },
  install: {
    openspec: "@fission-ai/openspec@1",
    superpowers: "obra/superpowers@6",
  },
};

const claudeAgent: AgentInfo = {
  id: "claude-code",
  label: "Claude Code",
  supportsColonCommands: true,
  commandsDir: ".claude/commands/",
};

const opencodeAgent: AgentInfo = {
  id: "opencode",
  label: "OpenCode",
  supportsColonCommands: false,
  commandsDir: ".opencode/commands/",
  globalBase: ".config/opencode",
};

const unknownAgent: AgentInfo = {
  id: "unknown-agent",
  label: "Unknown",
  supportsColonCommands: false,
  commandsDir: ".unknown/commands/",
};

let tmpDir: string;
let projectPath: string;
let fakePackageDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  tmpDir = join(tmpdir(), `alloy-init-matrix-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  projectPath = join(tmpDir, "project");
  fakePackageDir = join(tmpDir, "package");
  await mkdir(projectPath, { recursive: true });
  await mkdir(fakePackageDir, { recursive: true });
  // 写假 package.json,版本 0.4.0(供 readPackageVersion 读取)
  await writeFile(
    join(fakePackageDir, "package.json"),
    JSON.stringify({ name: "@flyin-ai/alloy", version: "0.4.0" }),
    "utf-8"
  );
  vi.mocked(getPackageRoot).mockReturnValue(fakePackageDir);
  // 默认 mock:所有检测返回未装
  vi.mocked(loadCompat).mockResolvedValue(MOCK_COMPAT);
  vi.mocked(detectAlloySkillsVersion).mockResolvedValue(null);
  vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
  vi.mocked(hasHookConfig).mockResolvedValue(false);
  vi.mocked(hasPermissionsConfig).mockResolvedValue(false);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 基础结构
// ---------------------------------------------------------------------------
describe("detectInitMatrix - 基础结构", () => {
  it("返回 InitMatrix 结构,agents 数组长度与输入一致", async () => {
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    expect(matrix).toHaveProperty("agents");
    expect(matrix.agents).toHaveLength(1);
    expect(matrix.agents[0].agentId).toBe("claude-code");
    expect(matrix.agents[0].agentLabel).toBe("Claude Code");
  });

  it("多 agent 输入返回多行状态", async () => {
    const matrix = await detectInitMatrix(projectPath, [claudeAgent, opencodeAgent], "project");
    expect(matrix.agents).toHaveLength(2);
    expect(matrix.agents[0].agentId).toBe("claude-code");
    expect(matrix.agents[1].agentId).toBe("opencode");
  });

  it("空 agent 列表返回空 agents 数组", async () => {
    const matrix = await detectInitMatrix(projectPath, [], "project");
    expect(matrix.agents).toHaveLength(0);
  });

  it("包含全部 4 类产物字段 + 项目级 opsx 汇总", async () => {
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const status = matrix.agents[0];
    expect(status).toHaveProperty("alloySkills");
    expect(status).toHaveProperty("hook");
    expect(status).toHaveProperty("permissions");
    expect(status).toHaveProperty("superpowers");
    // 项目级 opsx 汇总(不按 agent 维度)
    expect(matrix).toHaveProperty("opsxCommands");
    expect(matrix.opsxCommands).toHaveProperty("installed");
    expect(matrix.opsxCommands).toHaveProperty("paths");
    // alloySkills 子字段
    expect(status.alloySkills).toHaveProperty("installed");
    expect(status.alloySkills).toHaveProperty("version");
    expect(status.alloySkills).toHaveProperty("canUpgrade");
    expect(status.alloySkills).toHaveProperty("breaking");
    // superpowers 子字段
    expect(status.superpowers).toHaveProperty("installed");
    expect(status.superpowers).toHaveProperty("version");
    expect(status.superpowers).toHaveProperty("canUpgrade");
    expect(status.superpowers).toHaveProperty("breaking");
  });
});

// ---------------------------------------------------------------------------
// alloy skills 检测
// ---------------------------------------------------------------------------
describe("detectInitMatrix - alloy skills", () => {
  it("所有产物未装时返回全 false", async () => {
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].alloySkills;
    expect(s.installed).toBe(false);
    expect(s.version).toBe(null);
    expect(s.canUpgrade).toBe(false);
    expect(s.breaking).toBe(false);
  });

  it("alloy 0.3 -> 0.4 是兼容升级(0.3 满足 compat.yaml >=0.3.0),canUpgrade=true, breaking=false", async () => {
    vi.mocked(detectAlloySkillsVersion).mockResolvedValue("0.3.0");
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].alloySkills;
    expect(s.installed).toBe(true);
    expect(s.version).toBe("0.3.0");
    expect(s.canUpgrade).toBe(true);
    expect(s.breaking).toBe(false);
  });

  it("alloy 0.2 -> 0.4 是 breaking(0.2 不满足 compat.yaml >=0.3.0)", async () => {
    vi.mocked(detectAlloySkillsVersion).mockResolvedValue("0.2.0");
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].alloySkills;
    expect(s.installed).toBe(true);
    expect(s.version).toBe("0.2.0");
    expect(s.canUpgrade).toBe(true);
    expect(s.breaking).toBe(true);
  });

  it("alloy skills 已装当前版本时 canUpgrade=false, breaking=false", async () => {
    vi.mocked(detectAlloySkillsVersion).mockResolvedValue("0.4.0");
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].alloySkills;
    expect(s.installed).toBe(true);
    expect(s.version).toBe("0.4.0");
    expect(s.canUpgrade).toBe(false);
    expect(s.breaking).toBe(false);
  });

  it("alloy skills 已装高版本时 canUpgrade=false", async () => {
    vi.mocked(detectAlloySkillsVersion).mockResolvedValue("0.5.0");
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].alloySkills;
    expect(s.installed).toBe(true);
    expect(s.canUpgrade).toBe(false);
    expect(s.breaking).toBe(false);
  });

  it("detectAlloySkillsVersion 接收正确的 scope 参数", async () => {
    await detectInitMatrix(projectPath, [claudeAgent], "global");
    expect(detectAlloySkillsVersion).toHaveBeenCalledWith(projectPath, claudeAgent, "global");
  });

  it("多 agent 各自独立检测 alloy skills 版本", async () => {
    vi.mocked(detectAlloySkillsVersion).mockImplementation(async (_p, agent) => {
      if (agent.id === "claude-code") return "0.3.0";
      if (agent.id === "opencode") return "0.4.0";
      return null;
    });
    const matrix = await detectInitMatrix(projectPath, [claudeAgent, opencodeAgent], "project");
    expect(matrix.agents[0].alloySkills.version).toBe("0.3.0");
    expect(matrix.agents[1].alloySkills.version).toBe("0.4.0");
    expect(matrix.agents[0].alloySkills.canUpgrade).toBe(true);
    expect(matrix.agents[1].alloySkills.canUpgrade).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// superpowers 检测
// ---------------------------------------------------------------------------
describe("detectInitMatrix - superpowers", () => {
  it("superpowers 未装时 installed=false", async () => {
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].superpowers;
    expect(s.installed).toBe(false);
    expect(s.version).toBe(null);
    expect(s.canUpgrade).toBe(false);
    expect(s.breaking).toBe(false);
  });

  it("Superpowers 5.x 满足 compat.yaml(>=5.0.0 <7.0.0),canUpgrade=true, breaking=false", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/fake/skills/brainstorming", version: "5.2.0",
    });
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].superpowers;
    expect(s.installed).toBe(true);
    expect(s.version).toBe("5.2.0");
    expect(s.canUpgrade).toBe(true);
    expect(s.breaking).toBe(false);
  });

  it("Superpowers 4.x 不满足 compat.yaml(>=5.0.0),breaking=true", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/fake/skills/brainstorming", version: "4.2.0",
    });
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].superpowers;
    expect(s.installed).toBe(true);
    expect(s.version).toBe("4.2.0");
    expect(s.canUpgrade).toBe(true);
    expect(s.breaking).toBe(true);
  });

  it("Superpowers 7.x 不满足 compat.yaml(<7.0.0),breaking=true", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/fake/skills/brainstorming", version: "7.1.0",
    });
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].superpowers;
    expect(s.installed).toBe(true);
    expect(s.version).toBe("7.1.0");
    // 7.x 高于 6.0.0,spCanUpgrade=false(当前 install.superpowers 锁 6.x)
    expect(s.canUpgrade).toBe(false);
    expect(s.breaking).toBe(true);
  });

  it("superpowers 已装 v6 时 canUpgrade=false, breaking=false", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/fake/skills/brainstorming", version: "6.1.0",
    });
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].superpowers;
    expect(s.installed).toBe(true);
    expect(s.version).toBe("6.1.0");
    expect(s.canUpgrade).toBe(false);
    expect(s.breaking).toBe(false);
  });

  it("superpowers 已装但无版本号(手动安装)时 canUpgrade=false", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "project-skill", path: "/fake/skills/brainstorming", version: null,
    });
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].superpowers;
    expect(s.installed).toBe(true);
    expect(s.version).toBe(null);
    expect(s.canUpgrade).toBe(false);
    expect(s.breaking).toBe(false);
  });

  it("非 claude-code agent superpowers 始终未装(detectSkill 内部过滤)", async () => {
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    const matrix = await detectInitMatrix(projectPath, [opencodeAgent], "project");
    expect(matrix.agents[0].superpowers.installed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hook / permissions / opsx 检测
// ---------------------------------------------------------------------------
describe("detectInitMatrix - hook / permissions / opsx", () => {
  it("hook 已装时 installed=true", async () => {
    vi.mocked(hasHookConfig).mockResolvedValue(true);
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    expect(matrix.agents[0].hook.installed).toBe(true);
  });

  it("hook 未装时 installed=false", async () => {
    vi.mocked(hasHookConfig).mockResolvedValue(false);
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    expect(matrix.agents[0].hook.installed).toBe(false);
  });

  it("hook 不支持的 agent 返回 false 且不调用 hasHookConfig", async () => {
    const matrix = await detectInitMatrix(projectPath, [unknownAgent], "project");
    expect(matrix.agents[0].hook.installed).toBe(false);
    expect(hasHookConfig).not.toHaveBeenCalled();
  });

  it("permissions 已装时 installed=true", async () => {
    vi.mocked(hasPermissionsConfig).mockResolvedValue(true);
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    expect(matrix.agents[0].permissions.installed).toBe(true);
  });

  it("permissions 未装时 installed=false", async () => {
    vi.mocked(hasPermissionsConfig).mockResolvedValue(false);
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    expect(matrix.agents[0].permissions.installed).toBe(false);
  });

  it("permissions 不支持的 agent 返回 null 且不调用 hasPermissionsConfig", async () => {
    const matrix = await detectInitMatrix(projectPath, [unknownAgent], "project");
    expect(matrix.agents[0].permissions.installed).toBe(null);
    expect(hasPermissionsConfig).not.toHaveBeenCalled();
  });

  it("opsxCommands 未装时 installed=false", async () => {
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    expect(matrix.opsxCommands.installed).toBe(false);
  });

  it("opsxCommands 已装时 installed=true(project scope, claude-code)", async () => {
    await mkdir(join(projectPath, ".claude", "commands", "opsx"), { recursive: true });
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    expect(matrix.opsxCommands.installed).toBe(true);
  });

  it("opsxCommands 已装时 installed=true(project scope, opencode)", async () => {
    await mkdir(join(projectPath, ".opencode", "commands", "opsx"), { recursive: true });
    const matrix = await detectInitMatrix(projectPath, [opencodeAgent], "project");
    expect(matrix.opsxCommands.installed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// scope 行为
// ---------------------------------------------------------------------------
describe("detectInitMatrix - scope 行为", () => {
  it("global scope 用 HOME 作为 base 检测 opsx(claude-code 无 globalBase)", async () => {
    const fakeHome = join(tmpDir, "home-cc");
    await mkdir(join(fakeHome, ".claude", "commands", "opsx"), { recursive: true });
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const matrix = await detectInitMatrix(projectPath, [claudeAgent], "global");
      expect(matrix.opsxCommands.installed).toBe(true);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  it("global scope 用 commandsDir 推导 agentBase(opencode 非 globalBase)", async () => {
    const fakeHome = join(tmpDir, "home-oc");
    // opencode 的 commandsDir = ".opencode/commands/",OpenSpec CLI 部署到 ~/.opencode/commands/opsx-*.md
    await mkdir(join(fakeHome, ".opencode", "commands", "opsx"), { recursive: true });
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const matrix = await detectInitMatrix(projectPath, [opencodeAgent], "global");
      expect(matrix.opsxCommands.installed).toBe(true);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  it("project scope 不读 HOME 下的 opsx", async () => {
    const fakeHome = join(tmpDir, "home-not-used");
    await mkdir(join(fakeHome, ".claude", "commands", "opsx"), { recursive: true });
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
      expect(matrix.opsxCommands.installed).toBe(false);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  it("global scope 跳过项目级 Superpowers(项目级已装也只查用户级)", async () => {
    // 项目级已装 Superpowers
    await mkdir(join(projectPath, ".claude", "skills", "brainstorming"), { recursive: true });
    await writeFile(
      join(projectPath, ".claude", "skills", "brainstorming", "SKILL.md"),
      "---\nname: brainstorming\nversion: 6.1.0\n---\n",
      "utf-8"
    );
    // 用户级未装 -> scope=global 应返回未装(不受项目级影响)
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "global");
    expect(matrix.agents[0].superpowers.installed).toBe(false);
    // 确认传了 scope=global 给 detectSkill
    expect(detectSkill).toHaveBeenCalledWith("brainstorming", claudeAgent, projectPath, "global");
  });
});

