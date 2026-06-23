// test/core/skills.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../../src/utils/fs.js", () => ({
  getPackageRoot: vi.fn(),
}));
vi.mock("../../src/core/detect-installations.js", () => ({
  detectCommand: vi.fn(),
}));
vi.mock("../../src/utils/prompt.js", () => ({
  promptConfirm: vi.fn(),
}));

import { getPackageRoot } from "../../src/utils/fs.js";
import { detectCommand } from "../../src/core/detect-installations.js";
import { promptConfirm } from "../../src/utils/prompt.js";
import { deployCommands, deploySchema } from "../../src/core/skills.js";
import type { DeployOptions } from "../../src/core/types.js";

describe("deployCommands", () => {
  let tmpDir: string;
  let sourceDir: string;
  let projectPath: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-skills-test-${Date.now()}`);
    sourceDir = join(tmpDir, "package", "commands", "alloy");
    projectPath = join(tmpDir, "project");
    await mkdir(sourceDir, { recursive: true });
    await mkdir(projectPath, { recursive: true });

    // 创建冒号版源文件
    const commandIds = ["start", "plan", "apply", "archive", "finish", "fix", "discard", "status"];
    for (const id of commandIds) {
      await writeFile(
        join(sourceDir, `${id}.md`),
        `---\nname: "Alloy: ${id.charAt(0).toUpperCase() + id.slice(1)}"\ndescription: test\n---\n# alloy-${id}`,
        "utf-8"
      );
    }

    // 创建 references/ 子目录源文件（skill md 运行时按相对路径读取）
    const referencesDir = join(sourceDir, "references");
    await mkdir(referencesDir, { recursive: true });
    await writeFile(join(referencesDir, "skill-precheck.md"), "# skill precheck\n", "utf-8");
    await writeFile(join(referencesDir, "apply-worktree.md"), "# apply worktree\n", "utf-8");

    vi.mocked(getPackageRoot).mockReturnValue(join(tmpDir, "package"));
    vi.mocked(detectCommand).mockReturnValue({ found: false, location: null, path: null, version: null });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("冒号版 agent 部署到 alloy/ 子目录", async () => {
    const opts: DeployOptions = {
      scope: "project",
      injectClaudeMd: false,
      projectPath,
      targetAgents: [{ id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" }],
    };
    const deployed = await deployCommands(opts);
    // 8 个 skill md + 1 个 references 目录
    expect(deployed.length).toBe(9);
    // 冒号版路径：.claude/commands/alloy/start.md
    expect(deployed.some(p => p.includes(".claude/commands/alloy/start.md"))).toBe(true);
    const startFile = deployed.find(p => p.includes("start.md"))!;
    const content = await readFile(startFile, "utf-8");
    expect(content).toContain('name: "Alloy: Start"');
  });

  it("横线版 agent 部署到根 commands 目录", async () => {
    const opts: DeployOptions = {
      scope: "project",
      injectClaudeMd: false,
      projectPath,
      targetAgents: [{ id: "cursor", label: "Cursor", supportsColonCommands: false, commandsDir: ".cursor/commands/" }],
    };
    const deployed = await deployCommands(opts);
    // 8 个横线 skill md + 1 个 references 目录
    expect(deployed.length).toBe(9);
    // 横线版路径：.cursor/commands/alloy-start.md
    expect(deployed.some(p => p.includes(".cursor/commands/alloy-start.md"))).toBe(true);
    const startFile = deployed.find(p => p.includes("alloy-start.md"))!;
    const content = await readFile(startFile, "utf-8");
    expect(content).toContain('name: "Alloy-Start"');
  });

  it("Codex project 模式跳过部署", async () => {
    const opts: DeployOptions = {
      scope: "project",
      injectClaudeMd: false,
      projectPath,
      targetAgents: [{ id: "codex", label: "Codex", supportsColonCommands: false, commandsDir: ".codex/prompts/", globalOnly: true }],
    };
    const deployed = await deployCommands(opts);
    expect(deployed.length).toBe(0);
  });

  it("多 agent 同时部署", async () => {
    const opts: DeployOptions = {
      scope: "project",
      injectClaudeMd: false,
      projectPath,
      targetAgents: [
        { id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" },
        { id: "cursor", label: "Cursor", supportsColonCommands: false, commandsDir: ".cursor/commands/" },
      ],
    };
    const deployed = await deployCommands(opts);
    // (8 冒号 + 1 references) + (8 横线 + 1 references) = 18
    expect(deployed.length).toBe(18);
    const colonFiles = deployed.filter(p => p.includes(".claude/commands/alloy/") && !p.includes("references"));
    const dashFiles = deployed.filter(p => p.includes(".cursor/commands/") && !p.includes("references"));
    expect(colonFiles.length).toBe(8);
    expect(dashFiles.length).toBe(8);
  });

  it("检测到已有安装且用户拒绝覆盖时跳过该 agent", async () => {
    vi.mocked(detectCommand).mockReturnValue({
      found: true, location: "project-command", path: `${projectPath}/.claude/commands/alloy/start.md`, version: null,
    });
    vi.mocked(promptConfirm).mockResolvedValue(false);

    const opts: DeployOptions = {
      scope: "project",
      injectClaudeMd: false,
      projectPath,
      targetAgents: [{ id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" }],
    };
    const deployed = await deployCommands(opts);
    expect(deployed.length).toBe(0);
    expect(promptConfirm).toHaveBeenCalledWith("     是否覆盖 CC 的 Alloy commands？", false);
  });

  it("检测到已有安装且用户确认覆盖时继续部署", async () => {
    vi.mocked(detectCommand).mockReturnValue({
      found: true, location: "user-command", path: "/home/.claude/commands/alloy/start.md", version: null,
    });
    vi.mocked(promptConfirm).mockResolvedValue(true);

    const opts: DeployOptions = {
      scope: "project",
      injectClaudeMd: false,
      projectPath,
      targetAgents: [{ id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" }],
    };
    const deployed = await deployCommands(opts);
    expect(deployed.length).toBe(9);
  });

  it("未检测到已有安装时正常部署", async () => {
    vi.mocked(detectCommand).mockReturnValue({ found: false, location: null, path: null, version: null });

    const opts: DeployOptions = {
      scope: "project",
      injectClaudeMd: false,
      projectPath,
      targetAgents: [{ id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" }],
    };
    const deployed = await deployCommands(opts);
    expect(deployed.length).toBe(9);
    expect(promptConfirm).not.toHaveBeenCalled();
  });

  it("冒号版部署 references/ 子目录到 alloy/references/", async () => {
    const opts: DeployOptions = {
      scope: "project",
      injectClaudeMd: false,
      projectPath,
      targetAgents: [{ id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" }],
    };
    await deployCommands(opts);
    const precheck = await readFile(join(projectPath, ".claude", "commands", "alloy", "references", "skill-precheck.md"), "utf-8");
    expect(precheck).toContain("skill precheck");
    const worktree = await readFile(join(projectPath, ".claude", "commands", "alloy", "references", "apply-worktree.md"), "utf-8");
    expect(worktree).toContain("apply worktree");
  });

  it("横线版部署 references/ 子目录到 commands/references/", async () => {
    const opts: DeployOptions = {
      scope: "project",
      injectClaudeMd: false,
      projectPath,
      targetAgents: [{ id: "cursor", label: "Cursor", supportsColonCommands: false, commandsDir: ".cursor/commands/" }],
    };
    await deployCommands(opts);
    // 横线版 targetDir 是 .cursor/commands/（无 alloy/ 子目录），references 部署到 .cursor/commands/references/
    // 注意：横线版 skill md 内的 references 路径转换是后续适配项，此处只验证部署动作
    const precheck = await readFile(join(projectPath, ".cursor", "commands", "references", "skill-precheck.md"), "utf-8");
    expect(precheck).toContain("skill precheck");
  });

  it("源目录无 references/ 时不报错（向后兼容）", async () => {
    // 删除 references 源目录模拟旧版包
    await rm(join(sourceDir, "references"), { recursive: true, force: true });
    const opts: DeployOptions = {
      scope: "project",
      injectClaudeMd: false,
      projectPath,
      targetAgents: [{ id: "claude-code", label: "CC", supportsColonCommands: true, commandsDir: ".claude/commands/" }],
    };
    const deployed = await deployCommands(opts);
    // 只部署 8 个 skill md，无 references
    expect(deployed.length).toBe(8);
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
      injectClaudeMd: false,
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
      injectClaudeMd: false,
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
      injectClaudeMd: false,
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
      injectClaudeMd: false,
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
