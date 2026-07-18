// test/cli/internal/pre-commit-check.test.ts
import { describe, it, expect } from "vitest";
import { evaluatePreCommit } from "../../../src/cli/commands/internal/pre-commit-check.js";

describe("alloy _pre-commit-check evaluatePreCommit", () => {
  it("ALLOY_FORCE_WRITE=1 逃生阀 -> exit 0", () => {
    const result = evaluatePreCommit(["src/foo.ts"], ["started"], [], { ALLOY_FORCE_WRITE: "1" }, true);
    expect(result.exitCode).toBe(0);
  });

  it("非 alloy 项目(无 openspec/changes/)-> exit 0", () => {
    const result = evaluatePreCommit(["src/foo.ts"], [], [], {}, false);
    expect(result.exitCode).toBe(0);
  });

  it("有 change(started)+ 暂存 src/foo.ts -> exit 1(拦)", () => {
    const result = evaluatePreCommit(["src/foo.ts"], ["started"], [], {}, true);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("src/foo.ts");
  });

  it("有 change(applying)+ 暂存 src/foo.ts -> exit 0(放行)", () => {
    const result = evaluatePreCommit(["src/foo.ts"], ["applying"], [], {}, true);
    expect(result.exitCode).toBe(0);
  });

  it("有 change(started)+ 暂存 openspec/foo.md -> exit 0(白名单)", () => {
    const result = evaluatePreCommit(["openspec/changes/foo/proposal.md"], ["started"], [], {}, true);
    expect(result.exitCode).toBe(0);
  });

  it("有 pending_gate + 暂存 src/foo.ts -> exit 1(拦)", () => {
    const result = evaluatePreCommit(["src/foo.ts"], ["applying"], ["confirm-gate"], {}, true);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("user-gate");
  });

  it("无暂存文件 -> exit 0", () => {
    const result = evaluatePreCommit([], ["started"], [], {}, true);
    expect(result.exitCode).toBe(0);
  });

  it("多文件部分拦截 -> exit 1 + 消息含所有被拦文件", () => {
    const result = evaluatePreCommit(["src/a.ts", "openspec/b.md", "src/c.ts"], ["started"], [], {}, true);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("src/a.ts");
    expect(result.message).toContain("src/c.ts");
    expect(result.message).not.toContain("openspec/b.md");
  });

  it("拦截消息含 ALLOY_FORCE_WRITE 绕过提示", () => {
    const result = evaluatePreCommit(["src/foo.ts"], ["started"], [], {}, true);
    expect(result.message).toContain("ALLOY_FORCE_WRITE");
  });

  it("alloy 项目 + 空 phases + 暂存 src/ -> exit 1(核心修复:防绕过)", () => {
    const result = evaluatePreCommit(["src/foo.ts"], [], [], {}, true);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("无活跃 change");
  });

  it("alloy 项目 + 空 phases + 暂存 openspec/ -> exit 0(白名单)", () => {
    const result = evaluatePreCommit(["openspec/changes/foo/proposal.md"], [], [], {}, true);
    expect(result.exitCode).toBe(0);
  });

  it("alloy 项目 + 空 phases + 无暂存 -> exit 0", () => {
    const result = evaluatePreCommit([], [], [], {}, true);
    expect(result.exitCode).toBe(0);
  });

  it("finish 阶段(phases=[finished])+ 暂存 src/ -> exit 0(放行 squash merge commit)", () => {
    const result = evaluatePreCommit(["src/foo.ts"], ["finished"], [], {}, true);
    expect(result.exitCode).toBe(0);
  });

  it("finishing 阶段 + 暂存 scripts/hello.sh -> exit 0(放行 squash merge 暂存)", () => {
    const result = evaluatePreCommit(["scripts/hello.sh"], ["finishing"], [], {}, true);
    expect(result.exitCode).toBe(0);
  });

  it("archived 阶段 + 暂存 src/ -> exit 1(归档后不应写源码)", () => {
    const result = evaluatePreCommit(["src/foo.ts"], ["archived"], [], {}, true);
    expect(result.exitCode).toBe(1);
  });

  it("merge 进行中(mergeInProgress=true)+ 暂存 src/ -> exit 0(放行 merge commit)", () => {
    // archive 阶段 worktree-cleanup 的 git merge 带过来的 apply 产物,
    // 已在 worktree 分支审查过,pre-commit 不应拦截
    const result = evaluatePreCommit(["src/foo.ts", "scripts/hello.sh"], ["archiving"], [], {}, true, true);
    expect(result.exitCode).toBe(0);
  });

  it("merge 进行中 + ALLOY_FORCE_WRITE=1 -> exit 0(逃生阀优先)", () => {
    const result = evaluatePreCommit(["src/foo.ts"], ["archiving"], [], { ALLOY_FORCE_WRITE: "1" }, true, true);
    expect(result.exitCode).toBe(0);
  });

  it("非 merge 场景(mergeInProgress=false)+ 暂存 src/ -> exit 1(正常拦截)", () => {
    const result = evaluatePreCommit(["src/foo.ts"], ["archiving"], [], {}, true, false);
    expect(result.exitCode).toBe(1);
  });
});
