// test/core/skills.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../../src/utils/fs.js", () => ({
  getPackageRoot: vi.fn(),
}));

import { getPackageRoot } from "../../src/utils/fs.js";
import { deploySkills, deploySchema, detectAlloySkillsVersion, deployOpenCodeCommands } from "../../src/core/skills.js";
import { KNOWN_AGENTS } from "../../src/core/agents.js";
import type { DeployOptions } from "../../src/core/types.js";

describe("deploySkills", () => {
  let tmpDir: string;
  let sourceDir: string; // skills/ 源目录
  let projectPath: string;

  const skillNames = [
    "alloy-start", "alloy-plan", "alloy-apply", "alloy-archive",
    "alloy-finish", "alloy-fix", "alloy-discard", "alloy-status",
    "alloy-shared",
  ];

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-skills-test-${Date.now()}`);
    sourceDir = join(tmpDir, "package", "skills");
    projectPath = join(tmpDir, "project");
    await mkdir(sourceDir, { recursive: true });
    await mkdir(projectPath, { recursive: true });

    // 创建 9 个 skill 目录，每个含 SKILL.md
    for (const name of skillNames) {
      const skillDir = join(sourceDir, name);
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        `---\nname: ${name}\ndescription: test\n---\n# ${name}`,
        "utf-8"
      );
    }

    // alloy-start 含 references/ 子目录（随 skill 目录整体拷贝）
    const startReferencesDir = join(sourceDir, "alloy-start", "references");
    await mkdir(startReferencesDir, { recursive: true });
    await writeFile(join(startReferencesDir, "skill-precheck.md"), "# skill precheck\n", "utf-8");
    await writeFile(join(startReferencesDir, "apply-worktree.md"), "# apply worktree\n", "utf-8");

    vi.mocked(getPackageRoot).mockReturnValue(join(tmpDir, "package"));

    // 创建 package.json(含 version),供 deploySkills 写 .alloy-version 时读取
    await writeFile(
      join(tmpDir, "package", "package.json"),
      JSON.stringify({ name: "@flyin-ai/alloy", version: "0.4.0" }),
      "utf-8"
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("部署 skill 目录到 .claude/skills/", async () => {
    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [{ id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" }],
    };
    const deployed = await deploySkills(opts);
    // 9 个 skill 目录
    expect(deployed.length).toBe(9);
    // 路径：.claude/skills/alloy-start/
    expect(deployed.some(p => p.includes(join(".claude", "skills", "alloy-start")))).toBe(true);
    // SKILL.md 已复制
    const startSkillPath = join(projectPath, ".claude", "skills", "alloy-start", "SKILL.md");
    const content = await readFile(startSkillPath, "utf-8");
    expect(content).toContain("name: alloy-start");
  });

  it("不同 agent 部署到各自 skills 目录", async () => {
    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [{ id: "opencode", label: "OpenCode", supportsColonCommands: false, commandsDir: ".opencode/commands/" }],
    };
    const deployed = await deploySkills(opts);
    expect(deployed.length).toBe(9);
    // opencode 部署到 .opencode/skills/
    expect(deployed.some(p => p.includes(join(".opencode", "skills", "alloy-start")))).toBe(true);
    const startSkillPath = join(projectPath, ".opencode", "skills", "alloy-start", "SKILL.md");
    const content = await readFile(startSkillPath, "utf-8");
    expect(content).toContain("name: alloy-start");
  });

  it("多 agent 同时部署", async () => {
    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [
        { id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" },
        { id: "opencode", label: "OpenCode", supportsColonCommands: false, commandsDir: ".opencode/commands/" },
      ],
    };
    const deployed = await deploySkills(opts);
    // 9 (claude-code) + 9 (opencode) = 18
    expect(deployed.length).toBe(18);
    const claudeFiles = deployed.filter(p => p.includes(join(".claude", "skills")));
    const opencodeFiles = deployed.filter(p => p.includes(join(".opencode", "skills")));
    expect(claudeFiles.length).toBe(9);
    expect(opencodeFiles.length).toBe(9);
  });

  it("检测到已有安装时直接覆盖(不问确认,用户已在 display 阶段确认)", async () => {
    // 预创建目标 skill 目录,模拟已有安装
    await mkdir(join(projectPath, ".claude", "skills", "alloy-start"), { recursive: true });
    await writeFile(join(projectPath, ".claude", "skills", "alloy-start", "SKILL.md"), "existing", "utf-8");

    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [{ id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" }],
    };
    const deployed = await deploySkills(opts);
    expect(deployed.length).toBe(9);
  });

  it("检测到已有安装(user-skill)时正常部署(只检查目标 scope,全局安装不影响)", async () => {
    // 只预创建全局 skill,项目级无安装 → 不应显示"覆盖更新"
    const homeDir = join(tmpDir, "home");
    await mkdir(join(homeDir, ".claude", "skills", "alloy-start"), { recursive: true });
    await writeFile(join(homeDir, ".claude", "skills", "alloy-start", "SKILL.md"), "existing", "utf-8");

    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [{ id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" }],
    };
    const deployed = await deploySkills(opts);
    expect(deployed.length).toBe(9);
  });

  it("force=true 跳过覆盖确认直接部署(不再调用 promptConfirm)", async () => {
    // 预创建目标 skill 目录,模拟已有安装
    await mkdir(join(projectPath, ".claude", "skills", "alloy-start"), { recursive: true });
    await writeFile(join(projectPath, ".claude", "skills", "alloy-start", "SKILL.md"), "existing", "utf-8");

    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [{ id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" }],
      force: true,
    };
    const deployed = await deploySkills(opts);
    expect(deployed.length).toBe(9);
  });

  it("force=true 多 agent 均跳过覆盖确认", async () => {
    // 预创建两个 agent 的目标 skill 目录
    await mkdir(join(projectPath, ".claude", "skills", "alloy-start"), { recursive: true });
    await writeFile(join(projectPath, ".claude", "skills", "alloy-start", "SKILL.md"), "existing", "utf-8");
    await mkdir(join(projectPath, ".opencode", "skills", "alloy-start"), { recursive: true });
    await writeFile(join(projectPath, ".opencode", "skills", "alloy-start", "SKILL.md"), "existing", "utf-8");

    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [
        { id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" },
        { id: "opencode", label: "OpenCode", supportsColonCommands: false, commandsDir: ".opencode/commands/" },
      ],
      force: true,
    };
    const deployed = await deploySkills(opts);
    expect(deployed.length).toBe(18);
  });

  it("未检测到已有安装时正常部署", async () => {
    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [{ id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" }],
    };
    const deployed = await deploySkills(opts);
    expect(deployed.length).toBe(9);
  });

  it("skill 目录含 references/ 整体拷贝", async () => {
    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [{ id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" }],
    };
    await deploySkills(opts);
    // references/ 随 alloy-start 目录整体拷贝到 .claude/skills/alloy-start/references/
    const precheck = await readFile(join(projectPath, ".claude", "skills", "alloy-start", "references", "skill-precheck.md"), "utf-8");
    expect(precheck).toContain("skill precheck");
    const worktree = await readFile(join(projectPath, ".claude", "skills", "alloy-start", "references", "apply-worktree.md"), "utf-8");
    expect(worktree).toContain("apply worktree");
  });

  it("无 references/ 的 skill 正常部署", async () => {
    // alloy-status 无 references/，应正常部署
    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [{ id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" }],
    };
    const deployed = await deploySkills(opts);
    expect(deployed.length).toBe(9);
    const statusSkillPath = join(projectPath, ".claude", "skills", "alloy-status", "SKILL.md");
    const content = await readFile(statusSkillPath, "utf-8");
    expect(content).toContain("name: alloy-status");
  });

  it("deploySkills 写 .alloy-version 到 skills 目录", async () => {
    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [{ id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" }],
    };
    await deploySkills(opts);
    const versionFile = join(projectPath, ".claude", "skills", ".alloy-version");
    const content = await readFile(versionFile, "utf-8");
    // 版本来自 fake package.json(0.4.0)
    expect(content.trim()).toBe("0.4.0");
  });

  it("deploySkills 多 agent 各写 .alloy-version", async () => {
    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [
        { id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" },
        { id: "opencode", label: "OpenCode", supportsColonCommands: false, commandsDir: ".opencode/commands/" },
      ],
    };
    await deploySkills(opts);
    const ccVersion = await readFile(join(projectPath, ".claude", "skills", ".alloy-version"), "utf-8");
    const ocVersion = await readFile(join(projectPath, ".opencode", "skills", ".alloy-version"), "utf-8");
    expect(ccVersion.trim()).toBe("0.4.0");
    expect(ocVersion.trim()).toBe("0.4.0");
  });
});

describe("detectAlloySkillsVersion", () => {
  let tmpDir: string;
  let projectPath: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-version-detect-${Date.now()}`);
    projectPath = join(tmpDir, "project");
    await mkdir(projectPath, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("读 .alloy-version 返回版本", async () => {
    const agent = KNOWN_AGENTS.find(a => a.id === "claude-code")!;
    const skillsDir = join(projectPath, ".claude", "skills");
    await mkdir(skillsDir, { recursive: true });
    await writeFile(join(skillsDir, ".alloy-version"), "0.4.0\n", "utf-8");
    expect(await detectAlloySkillsVersion(projectPath, agent)).toBe("0.4.0");
  });

  it("未装返回 null", async () => {
    const agent = KNOWN_AGENTS.find(a => a.id === "claude-code")!;
    expect(await detectAlloySkillsVersion(projectPath, agent)).toBe(null);
  });

  it("不同 agent 读各自 skills 目录的版本", async () => {
    const ccAgent = KNOWN_AGENTS.find(a => a.id === "claude-code")!;
    const ocAgent = KNOWN_AGENTS.find(a => a.id === "opencode")!;
    await mkdir(join(projectPath, ".claude", "skills"), { recursive: true });
    await writeFile(join(projectPath, ".claude", "skills", ".alloy-version"), "0.3.0\n", "utf-8");
    await mkdir(join(projectPath, ".opencode", "skills"), { recursive: true });
    await writeFile(join(projectPath, ".opencode", "skills", ".alloy-version"), "0.4.0\n", "utf-8");
    expect(await detectAlloySkillsVersion(projectPath, ccAgent)).toBe("0.3.0");
    expect(await detectAlloySkillsVersion(projectPath, ocAgent)).toBe("0.4.0");
  });

  it("global scope 读用户级 skills 目录", async () => {
    const agent = KNOWN_AGENTS.find(a => a.id === "claude-code")!;
    // global scope 用 HOME,模拟写一个临时 HOME
    const fakeHome = join(tmpDir, "home");
    await mkdir(join(fakeHome, ".claude", "skills"), { recursive: true });
    await writeFile(join(fakeHome, ".claude", "skills", ".alloy-version"), "0.2.0\n", "utf-8");
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      expect(await detectAlloySkillsVersion(projectPath, agent, "global")).toBe("0.2.0");
    } finally {
      // 恢复原始 HOME,避免影响其他测试
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  });
});

describe("deploySchema", () => {
  let tmpDir: string;
  let projectPath: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-schema-test-${Date.now()}`);
    projectPath = join(tmpDir, "project");

    // 创建 schema 源
    const schemaDir = join(tmpDir, "package", "openspec", "schemas", "alloy");
    await mkdir(schemaDir, { recursive: true });
    await writeFile(join(schemaDir, "schema.yaml"), "name: alloy\nversion: 1\n", "utf-8");
    await mkdir(join(schemaDir, "instructions"));
    await writeFile(join(schemaDir, "instructions", "draft.md"), "# draft instruction", "utf-8");
    await mkdir(join(schemaDir, "templates"));
    await writeFile(join(schemaDir, "templates", "draft.md"), "# draft template", "utf-8");

    vi.mocked(getPackageRoot).mockReturnValue(join(tmpDir, "package"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("创建 openspec/ 目录并部署 schema", async () => {
    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [],
    };

    const targetPath = await deploySchema(opts);
    expect(targetPath).toContain("openspec/schemas/alloy");

    // openspec/config.yaml 写了 schema: alloy
    const { readFile: rf } = await import("node:fs/promises");
    const configContent = await rf(join(projectPath, "openspec", "config.yaml"), "utf-8");
    expect(configContent).toContain("schema: alloy");

    // schema.yaml 已复制
    const schemaContent = await rf(join(projectPath, "openspec", "schemas", "alloy", "schema.yaml"), "utf-8");
    expect(schemaContent).toContain("name: alloy");
  });

  it("已有 config.yaml 时追加 schema 行", async () => {
    // 先创建已有 config.yaml
    const openspecDir = join(projectPath, "openspec");
    await mkdir(openspecDir, { recursive: true });
    await writeFile(join(openspecDir, "config.yaml"), "existing: true\n", "utf-8");

    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [],
    };

    await deploySchema(opts);
    const { readFile: rf } = await import("node:fs/promises");
    const configContent = await rf(join(projectPath, "openspec", "config.yaml"), "utf-8");
    expect(configContent).toContain("existing: true");
    expect(configContent).toContain("schema: alloy");
  });

  it("已有 config.yaml 包含 schema: alloy 时不重复追加", async () => {
    const openspecDir = join(projectPath, "openspec");
    await mkdir(openspecDir, { recursive: true });
    await writeFile(join(openspecDir, "config.yaml"), "schema: alloy\n", "utf-8");

    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [],
    };

    await deploySchema(opts);
    const { readFile: rf } = await import("node:fs/promises");
    const configContent = await rf(join(projectPath, "openspec", "config.yaml"), "utf-8");
    // schema: alloy 只出现一次
    const matches = configContent.match(/schema: alloy/g);
    expect(matches?.length).toBe(1);
  });

  it("创建 specs/ 和 changes/ 子目录", async () => {
    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [],
    };

    await deploySchema(opts);
    const { stat } = await import("node:fs/promises");
    const specsStat = await stat(join(projectPath, "openspec", "specs"));
    expect(specsStat.isDirectory()).toBe(true);
    const changesStat = await stat(join(projectPath, "openspec", "changes"));
    expect(changesStat.isDirectory()).toBe(true);
  });
});

describe("deployOpenCodeCommands", () => {
  let tmpDir: string;
  let sourceDir: string;
  let projectPath: string;

  // deployOpenCodeCommands 覆盖的 8 个流程 id(不含 alloy-shared,shared 不直接调用)
  const commandIds = ["start", "plan", "apply", "archive", "finish", "fix", "status", "discard"];

  // 用 KNOWN_AGENTS 的真实 opencode agent(含 globalBase,路径推导与生产一致)
  const opencodeAgent = KNOWN_AGENTS.find((a) => a.id === "opencode")!;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-oc-cmd-test-${Date.now()}`);
    sourceDir = join(tmpDir, "package", "skills");
    projectPath = join(tmpDir, "project");
    await mkdir(sourceDir, { recursive: true });
    await mkdir(projectPath, { recursive: true });

    // 创建 8 个 skill 目录,每个 SKILL.md 含 description
    for (const id of commandIds) {
      const skillDir = join(sourceDir, `alloy-${id}`);
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        `---\nname: alloy-${id}\ndescription: Alloy ${id} 流程--测试描述\n---\n# alloy-${id}`,
        "utf-8"
      );
    }

    vi.mocked(getPackageRoot).mockReturnValue(join(tmpDir, "package"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("project scope:生成 8 个 wrapper 到 .opencode/commands/", async () => {
    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [opencodeAgent],
    };
    const paths = await deployOpenCodeCommands(opts);
    expect(paths.length).toBe(8);
    for (const id of commandIds) {
      const expected = join(projectPath, ".opencode", "commands", `alloy-${id}.md`);
      expect(paths).toContain(expected);
    }
  });

  it("global scope:生成到 ~/.config/opencode/commands/", async () => {
    const fakeHome = join(tmpDir, "home");
    await mkdir(fakeHome, { recursive: true });
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const opts: DeployOptions = {
        scope: "global",
        projectPath,
        targetAgents: [opencodeAgent],
      };
      const paths = await deployOpenCodeCommands(opts);
      expect(paths.length).toBe(8);
      for (const id of commandIds) {
        const expected = join(fakeHome, ".config", "opencode", "commands", `alloy-${id}.md`);
        expect(paths).toContain(expected);
      }
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("wrapper 内容含 skill({ name }) 调用 + description", async () => {
    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [opencodeAgent],
    };
    await deployOpenCodeCommands(opts);
    const startWrapper = await readFile(join(projectPath, ".opencode", "commands", "alloy-start.md"), "utf-8");
    // 含 frontmatter description(从 SKILL.md 读)
    expect(startWrapper).toContain("description: Alloy start 流程--测试描述");
    // 含 skill 工具调用指示
    expect(startWrapper).toContain('skill({ name: "alloy-start" })');
  });

  it("非 opencode agent 不生成 wrapper(返回空)", async () => {
    const claudeAgent = KNOWN_AGENTS.find((a) => a.id === "claude-code")!;
    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [claudeAgent],
    };
    const paths = await deployOpenCodeCommands(opts);
    expect(paths.length).toBe(0);
  });

  it("多 agent 时只对 opencode 生成 wrapper", async () => {
    const claudeAgent = KNOWN_AGENTS.find((a) => a.id === "claude-code")!;
    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [claudeAgent, opencodeAgent],
    };
    const paths = await deployOpenCodeCommands(opts);
    expect(paths.length).toBe(8);
    // 全部在 .opencode/commands/
    expect(paths.every(p => p.includes(join(".opencode", "commands")))).toBe(true);
  });

  it("SKILL.md 缺 description 时用默认描述", async () => {
    // 覆盖 alloy-start 的 SKILL.md,去掉 description
    await writeFile(
      join(sourceDir, "alloy-start", "SKILL.md"),
      `---\nname: alloy-start\n---\n# alloy-start`,
      "utf-8"
    );
    const opts: DeployOptions = {
      scope: "project",
      projectPath,
      targetAgents: [opencodeAgent],
    };
    await deployOpenCodeCommands(opts);
    const startWrapper = await readFile(join(projectPath, ".opencode", "commands", "alloy-start.md"), "utf-8");
    // 使用默认 description
    expect(startWrapper).toContain("description: Alloy start 流程");
  });
});
