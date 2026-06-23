// test/cli/gitignore.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureGitignore } from "../../src/cli/commands/init.js";

describe("ensureGitignore", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-gitignore-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function readGitignore(): Promise<string> {
    return readFile(join(tmpDir, ".gitignore"), "utf-8");
  }

  it("无 .gitignore 时创建并写入运行时规则 + AI 工具产物", async () => {
    await ensureGitignore(tmpDir);

    const content = await readGitignore();
    expect(content).toContain("### Alloy + Superpowers 运行时 ###");
    expect(content).toContain("docs/superpowers/");
    expect(content).toContain(".claude/worktrees/");
    expect(content).toContain("*.local.*");

    expect(content).toContain("### AI 开发工具产物 ###");
    expect(content).toContain(".idea/");
    expect(content).toContain(".vscode/*");
    expect(content).toContain("!.vscode/extensions.json");
    expect(content).toContain(".playwright-mcp/");
    expect(content).toContain(".DS_Store");
    expect(content).toContain("*.log");
    expect(content).toContain("logs/");
  });

  it("已有部分运行时规则时只追加缺失项", async () => {
    await writeFile(join(tmpDir, ".gitignore"), "docs/superpowers/\nnode_modules/\n", "utf-8");

    await ensureGitignore(tmpDir);

    const content = await readGitignore();
    // 已有的不重复
    const superpowersCount = (content.match(/docs\/superpowers\//g) || []).length;
    expect(superpowersCount).toBe(1);
    // 缺失的已补
    expect(content).toContain(".claude/worktrees/");
    expect(content).toContain("*.local.*");
    // AI 工具产物整组追加
    expect(content).toContain("### AI 开发工具产物 ###");
  });

  it("已有 AI 工具产物标记时不重复追加", async () => {
    const existing = "### AI 开发工具产物 ###\n.idea/\n.vscode/*\n!.vscode/extensions.json\n";
    await writeFile(join(tmpDir, ".gitignore"), existing, "utf-8");

    await ensureGitignore(tmpDir);

    const content = await readGitignore();
    // AI 标记只出现一次
    const markerCount = (content.match(/### AI 开发工具产物 ###/g) || []).length;
    expect(markerCount).toBe(1);
    // 运行时规则仍会追加（因为缺失）
    expect(content).toContain("docs/superpowers/");
  });

  it("两类规则都已存在时跳过写入（幂等）", async () => {
    // 第一次写入
    await ensureGitignore(tmpDir);
    const firstContent = await readGitignore();

    // 第二次调用——应跳过
    await ensureGitignore(tmpDir);
    const secondContent = await readGitignore();

    expect(secondContent).toBe(firstContent);
  });

  it("已有 .gitignore 无尾换行时正确拼接", async () => {
    await writeFile(join(tmpDir, ".gitignore"), "node_modules/", "utf-8"); // 无尾换行

    await ensureGitignore(tmpDir);

    const content = await readGitignore();
    // 原有内容与新增块之间应有换行分隔（content 补 \n + block 前 \n，至少一个换行）
    expect(content).toMatch(/node_modules\/\n+###/);
  });

  it("包含 .vscode/* 但无取反规则时：因标记缺失会整组追加（用户需手动合并）", async () => {
    // 用户已有 .vscode/* 但没有 AI 工具标记——会追加整组
    await writeFile(join(tmpDir, ".gitignore"), ".vscode/*\n", "utf-8");

    await ensureGitignore(tmpDir);

    const content = await readGitignore();
    expect(content).toContain("### AI 开发工具产物 ###");
    // 取反规则被追加（用户后续可手动去重 .vscode/*）
    expect(content).toContain("!.vscode/extensions.json");
  });
});
