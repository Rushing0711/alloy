// test/core/claude-md.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { injectClaudeMd, CLAUDE_MD_MARKER_START, CLAUDE_MD_MARKER_END } from "../../src/core/claude-md.js";
import { writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DeployOptions } from "../../src/core/types.js";

describe("injectClaudeMd", () => {
  let tmpDir: string;
  let opts: DeployOptions;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-claude-md-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });

    opts = {
      scope: "project",
      injectClaudeMd: true,
      projectPath: tmpDir,
      targetAgents: [],
    };
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("injectClaudeMd 为 false 时返回 false", async () => {
    opts.injectClaudeMd = false;
    const result = await injectClaudeMd(opts);
    expect(result).toBe(false);
  });

  it("CLAUDE.md 不存在时创建并注入标记", async () => {
    const result = await injectClaudeMd(opts);

    expect(result).toBe(true);

    const content = await readFile(join(tmpDir, "CLAUDE.md"), "utf-8");
    expect(content).toContain(CLAUDE_MD_MARKER_START);
    expect(content).toContain(CLAUDE_MD_MARKER_END);
    expect(content).toContain("## Alloy 工作流");
    expect(content).toContain("/alloy-start");
    expect(content).toContain("/alloy-plan");
    expect(content).toContain("/alloy-apply");
  });

  it("CLAUDE.md 存在但无标记时追加标记", async () => {
    const existingContent = "# My Project\n\nThis is my project.";
    await writeFile(join(tmpDir, "CLAUDE.md"), existingContent, "utf-8");

    const result = await injectClaudeMd(opts);

    expect(result).toBe(true);

    const content = await readFile(join(tmpDir, "CLAUDE.md"), "utf-8");
    expect(content).toContain(existingContent);
    expect(content).toContain(CLAUDE_MD_MARKER_START);
    expect(content).toContain(CLAUDE_MD_MARKER_END);
    expect(content).toContain("## Alloy 工作流");
  });

  it("CLAUDE.md 存在且有标记时替换标记", async () => {
    const existingContent = [
      "# My Project",
      "",
      "Some content before.",
      "",
      CLAUDE_MD_MARKER_START,
      "## Old Alloy Section",
      "Old content here.",
      CLAUDE_MD_MARKER_END,
      "",
      "Some content after.",
    ].join("\n");
    await writeFile(join(tmpDir, "CLAUDE.md"), existingContent, "utf-8");

    const result = await injectClaudeMd(opts);

    expect(result).toBe(true);

    const content = await readFile(join(tmpDir, "CLAUDE.md"), "utf-8");
    expect(content).toContain("# My Project");
    expect(content).toContain("Some content before.");
    expect(content).toContain("Some content after.");
    expect(content).toContain(CLAUDE_MD_MARKER_START);
    expect(content).toContain(CLAUDE_MD_MARKER_END);
    expect(content).toContain("## Alloy 工作流");
    expect(content).not.toContain("## Old Alloy Section");
    expect(content).not.toContain("Old content here.");
  });

  it("多次注入不会重复添加标记", async () => {
    // 第一次注入
    await injectClaudeMd(opts);

    // 第二次注入
    const result = await injectClaudeMd(opts);
    expect(result).toBe(true);

    const content = await readFile(join(tmpDir, "CLAUDE.md"), "utf-8");

    // 检查标记只出现一次
    const startMatches = content.match(new RegExp(CLAUDE_MD_MARKER_START, "g"));
    const endMatches = content.match(new RegExp(CLAUDE_MD_MARKER_END, "g"));
    expect(startMatches).toHaveLength(1);
    expect(endMatches).toHaveLength(1);
  });

  it("注入内容包含所有命令", async () => {
    await injectClaudeMd(opts);

    const content = await readFile(join(tmpDir, "CLAUDE.md"), "utf-8");
    expect(content).toContain("/alloy-start");
    expect(content).toContain("/alloy-plan");
    expect(content).toContain("/alloy-apply");
    expect(content).toContain("/alloy-archive");
    expect(content).toContain("/alloy-finish");
    expect(content).toContain("/alloy-fix");
    expect(content).toContain("/alloy-status");
  });

  it("注入内容包含项目链接", async () => {
    await injectClaudeMd(opts);

    const content = await readFile(join(tmpDir, "CLAUDE.md"), "utf-8");
    expect(content).toContain("https://github.com/Rushing0711/alloy");
  });
});
