// test/core/hook-guard.test.ts
import { describe, it, expect } from "vitest";
import { guardCheck } from "../../src/core/hook-guard.js";

describe("hook-guard guardCheck", () => {
  describe("非 alloy 项目(phases 空)", () => {
    it("无 .alloy.yaml 时放行任意路径", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: [], isAlloyProject: false });
      expect(result.allowed).toBe(true);
    });

    it("无 .alloy.yaml 时放行 scripts/", () => {
      const result = guardCheck({ filePath: "scripts/hello.sh", phases: [], isAlloyProject: false });
      expect(result.allowed).toBe(true);
    });
  });

  describe("alloy 项目无活跃 change(核心修复:防绕过)", () => {
    it("alloy 项目 + phases 空 + 非白名单 -> 拦截(强制先 _phase start)", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: [], isAlloyProject: true });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("无活跃 change");
    });

    it("alloy 项目 + phases 空 + scripts/ -> 拦截", () => {
      const result = guardCheck({ filePath: "scripts/hello.sh", phases: [], isAlloyProject: true });
      expect(result.allowed).toBe(false);
    });

    it("alloy 项目 + phases 空 + 白名单 openspec/ -> 放行", () => {
      const result = guardCheck({ filePath: "openspec/changes/foo/proposal.md", phases: [], isAlloyProject: true });
      expect(result.allowed).toBe(true);
    });

    it("alloy 项目 + phases 空 + .md -> 放行(白名单)", () => {
      const result = guardCheck({ filePath: "README.md", phases: [], isAlloyProject: true });
      expect(result.allowed).toBe(true);
    });

    it("alloy 项目 + phases 空 + pendingGates 非空 + 非白名单 -> 拦截(pending_gate 优先)", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: [], pendingGates: ["gate-a"], isAlloyProject: true });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("user-gate");
    });
  });

  describe("apply 阶段(放行源码)", () => {
    it("applying 阶段放行 src/", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["applying"] });
      expect(result.allowed).toBe(true);
    });

    it("applied 阶段放行 src/", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["applied"] });
      expect(result.allowed).toBe(true);
    });

    it("apply 阶段放行 scripts/hello.sh", () => {
      const result = guardCheck({ filePath: "scripts/hello.sh", phases: ["applying"] });
      expect(result.allowed).toBe(true);
    });
  });

  describe("finishing/finished 阶段(finish 合入 main 的 commit 放行)", () => {
    it("finishing 阶段放行 src/", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["finishing"] });
      expect(result.allowed).toBe(true);
    });

    it("finished 阶段放行 src/", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["finished"] });
      expect(result.allowed).toBe(true);
    });

    it("finishing 阶段放行 scripts/hello.sh(squash merge 暂存)", () => {
      const result = guardCheck({ filePath: "scripts/hello.sh", phases: ["finishing"] });
      expect(result.allowed).toBe(true);
    });

    it("archived 阶段拦截 src/(归档后不应写源码)", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["archived"] });
      expect(result.allowed).toBe(false);
    });
  });

  describe("非 apply 阶段(白名单放行)", () => {
    it("started 阶段放行 openspec/", () => {
      const result = guardCheck({ filePath: "openspec/changes/foo/proposal.md", phases: ["started"] });
      expect(result.allowed).toBe(true);
    });

    it("planned 阶段放行 .alloy.yaml", () => {
      const result = guardCheck({ filePath: ".alloy.yaml", phases: ["planned"] });
      expect(result.allowed).toBe(true);
    });

    it("planning 阶段放行 .claude/", () => {
      const result = guardCheck({ filePath: ".claude/settings.json", phases: ["planning"] });
      expect(result.allowed).toBe(true);
    });

    it("放行 .md 文件(任意位置)", () => {
      const result = guardCheck({ filePath: "README.md", phases: ["started"] });
      expect(result.allowed).toBe(true);
    });

    it("放行 docs/", () => {
      const result = guardCheck({ filePath: "docs/guide.md", phases: ["started"] });
      expect(result.allowed).toBe(true);
    });

    it("放行 .gitignore", () => {
      const result = guardCheck({ filePath: ".gitignore", phases: ["started"] });
      expect(result.allowed).toBe(true);
    });

    it("放行 .gitattributes", () => {
      const result = guardCheck({ filePath: ".gitattributes", phases: ["started"] });
      expect(result.allowed).toBe(true);
    });

    it("放行 opencode.json(OpenCode 配置在项目根,alloy init 注入 permissions)", () => {
      const result = guardCheck({ filePath: "opencode.json", phases: ["started"] });
      expect(result.allowed).toBe(true);
    });

    it("放行 CLAUDE.md", () => {
      const result = guardCheck({ filePath: "CLAUDE.md", phases: ["started"] });
      expect(result.allowed).toBe(true);
    });

    it("放行 AGENTS.md", () => {
      const result = guardCheck({ filePath: "AGENTS.md", phases: ["started"] });
      expect(result.allowed).toBe(true);
    });
  });

  describe("非 apply 阶段(非白名单拦截)", () => {
    it("started 阶段拦截 src/foo.ts", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["started"] });
      expect(result.allowed).toBe(false);
    });

    it("started 阶段拦截 scripts/hello.sh(用户痛点:explore 里写代码)", () => {
      const result = guardCheck({ filePath: "scripts/hello.sh", phases: ["started"] });
      expect(result.allowed).toBe(false);
    });

    it("planned 阶段拦截 src/", () => {
      const result = guardCheck({ filePath: "src/index.ts", phases: ["planned"] });
      expect(result.allowed).toBe(false);
    });

    it("planning 阶段拦截 src/", () => {
      const result = guardCheck({ filePath: "src/index.ts", phases: ["planning"] });
      expect(result.allowed).toBe(false);
    });

    it("archived 阶段拦截 src/", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["archived"] });
      expect(result.allowed).toBe(false);
    });

    it("archiving 阶段拦截 src/", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["archiving"] });
      expect(result.allowed).toBe(false);
    });

    it("拦截原因包含 phase 和路径", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["planned"] });
      expect(result.reason).toContain("planned");
      expect(result.reason).toContain("src/foo.ts");
    });

    it("拦截 .json 配置(非白名单)", () => {
      const result = guardCheck({ filePath: "package.json", phases: ["started"] });
      expect(result.allowed).toBe(false);
    });

    it("拦截 .yml(非白名单)", () => {
      const result = guardCheck({ filePath: "config.yml", phases: ["started"] });
      expect(result.allowed).toBe(false);
    });
  });

  describe("多 change 并行", () => {
    it("一个 apply 一个 plan -> 放行(有 apply)", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["planning", "applying"] });
      expect(result.allowed).toBe(true);
    });

    it("两个都 plan -> 拦截 src/", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["planning", "planned"] });
      expect(result.allowed).toBe(false);
    });

    it("一个 apply 一个 finished -> 放行(有 apply)", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["finished", "applied"] });
      expect(result.allowed).toBe(true);
    });
  });

  describe("路径标准化", () => {
    it("./ 前缀正确匹配(拦截)", () => {
      const result = guardCheck({ filePath: "./src/foo.ts", phases: ["started"] });
      expect(result.allowed).toBe(false);
    });

    it("./ 前缀正确匹配(放行)", () => {
      const result = guardCheck({ filePath: "./openspec/foo.md", phases: ["started"] });
      expect(result.allowed).toBe(true);
    });

    it("深层路径匹配白名单(openspec/)", () => {
      const result = guardCheck({ filePath: "openspec/changes/foo-bar/specs/baz/spec.md", phases: ["planning"] });
      expect(result.allowed).toBe(true);
    });
  });

  describe("pending_gate(user-gate 期间)", () => {
    it("pendingGates 非空 + 非白名单 -> 拦截", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["started"], pendingGates: ["confirm-main-branch"] });
      expect(result.allowed).toBe(false);
    });

    it("pendingGates 非空 + 白名单 -> 放行", () => {
      const result = guardCheck({ filePath: "openspec/changes/foo/proposal.md", phases: ["started"], pendingGates: ["confirm-main-branch"] });
      expect(result.allowed).toBe(true);
    });

    it("pendingGates 非空 + apply 阶段 + 非白名单 -> 拦截(pending_gate 优先于 apply)", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["applying"], pendingGates: ["confirm-execution"] });
      expect(result.allowed).toBe(false);
    });

    it("拦截原因含 user-gate + gate-id", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["started"], pendingGates: ["confirm-main-branch"] });
      expect(result.reason).toContain("user-gate");
      expect(result.reason).toContain("confirm-main-branch");
    });

    it("拦截原因含 _guard user-gate pass 降级提示", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["started"], pendingGates: ["confirm-main-branch"] });
      expect(result.reason).toContain("alloy _guard user-gate pass");
    });

    it("phases 空 + pendingGates 非空 -> 拦截(有 pending_gate 说明是 alloy 项目)", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: [], pendingGates: ["confirm-main-branch"], isAlloyProject: true });
      expect(result.allowed).toBe(false);
    });

    it("pendingGates 空数组 + 非 apply -> 现有逻辑(拦截 src/)", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["started"], pendingGates: [] });
      expect(result.allowed).toBe(false);
    });

    it("pendingGates 多个 gate -> 原因含全部", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["started"], pendingGates: ["gate-a", "gate-b"] });
      expect(result.reason).toContain("gate-a");
      expect(result.reason).toContain("gate-b");
    });
  });

  describe("main 分支检测(禁止在 main 分支直接改代码)", () => {
    it("main 分支 + 非白名单 src/ -> 拦截", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["applying"], currentBranch: "main", mainBranch: "main" });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("main 分支");
      expect(result.reason).toContain("feature/<name>");
    });

    it("main 分支 + 非白名单 scripts/ -> 拦截", () => {
      const result = guardCheck({ filePath: "scripts/hello.sh", phases: ["applying"], currentBranch: "main", mainBranch: "main" });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("main 分支");
    });

    it("main 分支 + 白名单 .alloy.yaml -> 放行(状态文件允许)", () => {
      const result = guardCheck({ filePath: ".alloy.yaml", phases: [], currentBranch: "main", mainBranch: "main" });
      expect(result.allowed).toBe(true);
    });

    it("main 分支 + 白名单 docs/foo.md -> 放行(文档允许)", () => {
      const result = guardCheck({ filePath: "docs/guide.md", phases: [], currentBranch: "main", mainBranch: "main" });
      expect(result.allowed).toBe(true);
    });

    it("main 分支 + 白名单 openspec/ -> 放行(制品允许)", () => {
      const result = guardCheck({ filePath: "openspec/changes/foo/proposal.md", phases: [], currentBranch: "main", mainBranch: "main" });
      expect(result.allowed).toBe(true);
    });

    it("main 分支 + apply 阶段 + 非白名单 -> 仍拦截(main 分支检测优先级最高)", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["applying"], currentBranch: "main", mainBranch: "main" });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("main 分支");
    });

    it("feature 分支 + 非白名单 + apply 阶段 -> 放行(不触发 main 分支检测)", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["applying"], currentBranch: "feature/foo", mainBranch: "main" });
      expect(result.allowed).toBe(true);
    });

    it("currentBranch undefined -> 不触发 main 分支检测(走原有逻辑)", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["applying"], mainBranch: "main" });
      expect(result.allowed).toBe(true);
    });

    it("mainBranch undefined -> 不触发 main 分支检测(走原有逻辑)", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: ["applying"], currentBranch: "main" });
      expect(result.allowed).toBe(true);
    });

    it("main 分支 + 自定义 main_branch 名(master)-> 拦截", () => {
      const result = guardCheck({ filePath: "src/foo.ts", phases: [], currentBranch: "master", mainBranch: "master" });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("master");
    });
  });
});
