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
import { runHealthCheck, checkOpenSpec, checkSuperpowers } from "../../src/core/health.js";

const MOCK_CONFIG = {
  compatible: {
    node: ">=18.0.0",
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
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const osResult = results.find((r) => r.name === "OpenSpec");
    expect(osResult).toBeDefined();
    expect(osResult!.status).toBe("fail");
    expect(osResult!.current).toBe("未安装");
  });

  it("应检查环境（git）", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: false,
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
    expect(spResult!.current).toContain("v5.1.0");
  });

  it("Superpowers 插件文件存在但无对应条目时 fallback 到 npx skills list", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
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
    expect(spResult!.current).toContain("已安装");
  });

  it("Commands: .claude/commands/ 不完整但 commands/ 完整时应返回 pass（来源: commands/）", async () => {
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
    });
    // .claude/commands/ 中 plan.md 缺失，但 commands/ 中完整
    vi.mocked(existsSync).mockImplementation((path: any) => {
      const pathStr = String(path);
      // .claude/commands/alloy/plan.md 缺失
      if (pathStr.includes(".claude/commands/alloy/plan.md")) {
        return false;
      }
      return true;
    });

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const commandsResult = results.find((r) => r.name === "Commands");
    expect(commandsResult).toBeDefined();
    expect(commandsResult!.status).toBe("pass");
    expect(commandsResult!.current).toContain("来源: commands/");
  });

  // Issue 4: Commands fail 状态
  it("Commands 目录缺失时应返回 fail", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
    });
    // existsSync 对特定 command 文件返回 false，模拟缺失
    vi.mocked(existsSync).mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr.includes("plan.md") || pathStr.includes("archive.md")) {
        return false;
      }
      return true;
    });

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const commandsResult = results.find((r) => r.name === "Commands");
    expect(commandsResult).toBeDefined();
    expect(commandsResult!.status).toBe("fail");
    expect(commandsResult!.current).toContain("缺失");
    expect(commandsResult!.message).toContain("plan");
    expect(commandsResult!.message).toContain("archive");
  });

  // Issue 4: Schema 版本不匹配导致 warn
  it("Schema 版本不匹配时应返回 warn", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
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
    expect(spResult!.current).toContain("已安装");
  });

  it("Superpowers 输出缺少关键 skill 时应返回 fail", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
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
    expect(spResult!.status).toBe("fail");
    expect(spResult!.current).toBe("未安装");
  });

  describe("checkOpenSpec", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("已安装且版本兼容时返回 installed=true compatible=true", () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);

      const result = checkOpenSpec(">=1.3.0 <2.0.0");
      expect(result.installed).toBe(true);
      expect(result.version).toBe("1.3.1");
      expect(result.compatible).toBe(true);
    });

    it("已安装但版本不兼容时返回 compatible=false", () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from("1.2.0\n") as any);

      const result = checkOpenSpec(">=1.3.0 <2.0.0");
      expect(result.installed).toBe(true);
      expect(result.compatible).toBe(false);
    });

    it("未安装时返回 installed=false", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("not found");
      });

      const result = checkOpenSpec(">=1.3.0 <2.0.0");
      expect(result.installed).toBe(false);
      expect(result.compatible).toBe(false);
    });
  });

  describe("checkSuperpowers", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("Claude 插件已安装且版本兼容时返回 installed=true", async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          plugins: {
            "superpowers@claude-plugins-official": [{ version: "5.1.0" }],
          },
        })
      );

      const result = await checkSuperpowers(">=5.0.0 <6.0.0");
      expect(result.installed).toBe(true);
      expect(result.version).toBe("5.1.0");
      expect(result.compatible).toBe(true);
    });

    it("Claude 插件版本不兼容时返回 compatible=false", async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          plugins: {
            "superpowers@claude-plugins-official": [{ version: "4.0.0" }],
          },
        })
      );

      const result = await checkSuperpowers(">=5.0.0 <6.0.0");
      expect(result.installed).toBe(true);
      expect(result.compatible).toBe(false);
    });

    it("插件文件不存在时 fallback 到 npx skills list", async () => {
      vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(execSync).mockReturnValue(
        Buffer.from("brainstorming\nusing-git-worktrees\ntdd\n") as any
      );

      const result = await checkSuperpowers(">=5.0.0 <6.0.0");
      expect(result.installed).toBe(true);
      expect(result.compatible).toBe(true);
    });

    it("均未安装时返回 installed=false", async () => {
      vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("not found");
      });

      const result = await checkSuperpowers(">=5.0.0 <6.0.0");
      expect(result.installed).toBe(false);
      expect(result.compatible).toBe(false);
    });
  });
});
