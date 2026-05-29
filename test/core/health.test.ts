import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock 必须在 import 之前声明（ESM hoisting）
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
}));
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));
vi.mock("../../src/core/compat.js", () => ({
  loadCompat: vi.fn(),
}));
vi.mock("../../src/core/detect.js", () => ({
  detectEnv: vi.fn(),
}));

import { execSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { loadCompat } from "../../src/core/compat.js";
import { detectEnv } from "../../src/core/detect.js";
import { runHealthCheck } from "../../src/core/health.js";

const MOCK_CONFIG = {
  compatible: {
    node: ">=18.0.0 <22.0.0",
    openspec: ">=1.3.0 <2.0.0",
    superpowers: ">=5.0.0 <6.0.0",
    alloy: ">=0.1.0",
    schema: 1,
  },
  install: {
    openspec: "@fission-ai/openspec@1",
    superpowers: "obra/superpowers@5",
  },
};

describe("runHealthCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 7 项检查结果", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    expect(results).toHaveLength(7);
  });

  it("Node.js 版本不满足约束时应返回 fail", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "16.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const nodeResult = results.find((r) => r.name === "Node.js");
    expect(nodeResult).toBeDefined();
    expect(nodeResult!.status).toBe("fail");
  });

  it("Node.js 版本满足约束时应返回 pass", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const nodeResult = results.find((r) => r.name === "Node.js");
    expect(nodeResult!.status).toBe("pass");
  });

  it("OpenSpec 未安装时应返回 fail", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === "openspec --version") throw new Error("not found");
      return Buffer.from("");
    });
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const osResult = results.find((r) => r.name === "OpenSpec");
    expect(osResult).toBeDefined();
    expect(osResult!.status).toBe("fail");
    expect(osResult!.current).toBe("未安装");
  });

  it("应检查环境（git + Claude Code）", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: false,
      claudeCodeInstalled: true,
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const envResult = results.find((r) => r.name === "Environment");
    expect(envResult).toBeDefined();
    expect(envResult!.status).toBe("warn");
  });

  // Superpowers 通过 Claude 插件路径检测
  it("Superpowers 通过 Claude 插件路径检测到安装时应返回 pass", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });
    vi.mocked(existsSync).mockReturnValue(true);
    // readFile: installed_plugins.json 返回有效插件数据，package.json 返回版本
    vi.mocked(readFile).mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr.includes("installed_plugins.json")) {
        return Promise.resolve(JSON.stringify({
          version: 2,
          plugins: {
            "superpowers@claude-plugins-official": [
              {
                scope: "user",
                installPath: "/home/user/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0",
                version: "5.1.0",
              },
            ],
          },
        }));
      }
      return Promise.resolve(JSON.stringify({ version: "0.1.0" }));
    });

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const spResult = results.find((r) => r.name === "Superpowers");
    expect(spResult).toBeDefined();
    expect(spResult!.status).toBe("pass");
    expect(spResult!.current).toContain("Claude 插件 v5.1.0");
  });

  it("Superpowers 插件文件存在但无对应条目时 fallback 到 npx skills list", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });
    vi.mocked(existsSync).mockReturnValue(true);
    // readFile: installed_plugins.json 无 superpowers 条目 → fallback
    vi.mocked(readFile).mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr.includes("installed_plugins.json")) {
        return Promise.resolve(JSON.stringify({
          version: 2,
          plugins: { "some-other-plugin@official": [] },
        }));
      }
      return Promise.resolve(JSON.stringify({ version: "0.1.0" }));
    });
    // fallback: npx skills list 返回含关键 skill 的输出
    vi.mocked(execSync).mockImplementation((cmd: any) => {
      if (String(cmd).startsWith("npx skills list")) {
        return Buffer.from("brainstorming\nusing-git-worktrees\n");
      }
      return Buffer.from("1.3.1\n");
    });

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const spResult = results.find((r) => r.name === "Superpowers");
    expect(spResult).toBeDefined();
    expect(spResult!.status).toBe("pass");
    expect(spResult!.current).toContain("brainstorming");
  });

  it("Skills: .claude/skills/ 不完整但 skills/ 完整时应返回 pass（来源: skills/）", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);
    vi.mocked(readFile).mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr.includes("installed_plugins.json")) {
        return Promise.resolve(JSON.stringify({
          version: 2,
          plugins: {
            "superpowers@claude-plugins-official": [
              { version: "5.1.0" },
            ],
          },
        }));
      }
      return Promise.resolve(JSON.stringify({ version: "0.1.0" }));
    });
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });
    // .claude/skills/ 中 alloy-plan 缺失，但 skills/ 中完整
    vi.mocked(existsSync).mockImplementation((path: any) => {
      const pathStr = String(path);
      // .claude/skills/alloy-plan 缺失
      if (pathStr.includes(".claude/skills/alloy-plan")) {
        return false;
      }
      return true;
    });

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const skillsResult = results.find((r) => r.name === "Skills");
    expect(skillsResult).toBeDefined();
    expect(skillsResult!.status).toBe("pass");
    expect(skillsResult!.current).toContain("来源: skills/");
  });

  // Issue 4: Skills fail 状态
  it("Skills 目录缺失时应返回 fail", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });
    // existsSync 对特定 skill 目录返回 false，模拟缺失
    vi.mocked(existsSync).mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr.includes("alloy-plan") || pathStr.includes("alloy-archive")) {
        return false;
      }
      return true;
    });

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const skillsResult = results.find((r) => r.name === "Skills");
    expect(skillsResult).toBeDefined();
    expect(skillsResult!.status).toBe("fail");
    expect(skillsResult!.current).toContain("缺失");
    expect(skillsResult!.message).toContain("alloy-plan");
    expect(skillsResult!.message).toContain("alloy-archive");
  });

  // Issue 4: Schema 版本不匹配导致 warn
  it("Schema 版本不匹配时应返回 warn", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });
    vi.mocked(existsSync).mockReturnValue(true);
    // readdir 返回一个 change 目录
    vi.mocked(readdir).mockResolvedValue([
      { name: "test-change", isDirectory: () => true },
      { name: "some-file.txt", isDirectory: () => false },
    ] as any);
    // readFile 根据路径返回不同内容
    vi.mocked(readFile).mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr.includes("package.json")) {
        return Promise.resolve(JSON.stringify({ version: "0.1.0" }));
      }
      if (pathStr.includes(".alloy.yaml")) {
        return Promise.resolve("schema_version: 2\n");
      }
      return Promise.resolve("");
    });

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const schemaResult = results.find((r) => r.name === "Schema");
    expect(schemaResult).toBeDefined();
    expect(schemaResult!.status).toBe("warn");
    expect(schemaResult!.message).toBeDefined();
    expect(schemaResult!.message).toContain("schema_version 不匹配");
    expect(schemaResult!.current).toContain("test-change=2");
  });

  // Issue 4: Superpowers 输出内容解析
  it("Superpowers 输出含关键 skill 时应返回 pass", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });
    vi.mocked(existsSync).mockReturnValue(true);
    // execSync 返回含关键 skill 的输出
    vi.mocked(execSync).mockImplementation((cmd: any) => {
      if (String(cmd).startsWith("npx skills list")) {
        return Buffer.from("brainstorming\nusing-git-worktrees\ntest-driven-development\n");
      }
      return Buffer.from("1.3.1\n");
    });

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const spResult = results.find((r) => r.name === "Superpowers");
    expect(spResult).toBeDefined();
    expect(spResult!.status).toBe("pass");
    expect(spResult!.current).toContain("brainstorming");
  });

  it("Superpowers 输出缺少关键 skill 时应返回 warn", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });
    vi.mocked(existsSync).mockReturnValue(true);
    // execSync 返回不含关键 skill 的输出
    vi.mocked(execSync).mockImplementation((cmd: any) => {
      if (String(cmd).startsWith("npx skills list")) {
        return Buffer.from("some-other-skill\n");
      }
      return Buffer.from("1.3.1\n");
    });

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const spResult = results.find((r) => r.name === "Superpowers");
    expect(spResult).toBeDefined();
    expect(spResult!.status).toBe("warn");
    expect(spResult!.current).toContain("缺失");
    expect(spResult!.message).toContain("brainstorming");
    expect(spResult!.message).toContain("using-git-worktrees");
  });
});
