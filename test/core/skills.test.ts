// test/core/skills.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../../src/utils/fs.js", () => ({
  getPackageRoot: vi.fn(),
}));

import { getPackageRoot } from "../../src/utils/fs.js";
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

    vi.mocked(getPackageRoot).mockReturnValue(join(tmpDir, "package"));
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
    expect(deployed.length).toBe(8);
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
    expect(deployed.length).toBe(8);
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
    // 8 个冒号版 + 8 个横线版
    expect(deployed.length).toBe(16);
    const colonFiles = deployed.filter(p => p.includes(".claude/commands/alloy/"));
    const dashFiles = deployed.filter(p => p.includes(".cursor/commands/"));
    expect(colonFiles.length).toBe(8);
    expect(dashFiles.length).toBe(8);
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
