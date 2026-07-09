// test/cli/internal/pre-commit-check.test.ts
import { describe, it, expect } from "vitest";
import { evaluatePreCommit } from "../../../src/cli/commands/internal/pre-commit-check.js";

describe("alloy _pre-commit-check evaluatePreCommit", () => {
  it("ALLOY_FORCE_WRITE=1 逃生阀 -> exit 0", () => {
    const result = evaluatePreCommit(["src/foo.ts"], ["started"], [], { ALLOY_FORCE_WRITE: "1" });
    expect(result.exitCode).toBe(0);
  });

  it("非 alloy 项目(无 phases 无 pendingGates)-> exit 0", () => {
    const result = evaluatePreCommit(["src/foo.ts"], [], [], {});
    expect(result.exitCode).toBe(0);
  });

  it("有 change(started)+ 暂存 src/foo.ts -> exit 1(拦)", () => {
    const result = evaluatePreCommit(["src/foo.ts"], ["started"], [], {});
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("src/foo.ts");
  });

  it("有 change(applying)+ 暂存 src/foo.ts -> exit 0(放行)", () => {
    const result = evaluatePreCommit(["src/foo.ts"], ["applying"], [], {});
    expect(result.exitCode).toBe(0);
  });

  it("有 change(started)+ 暂存 openspec/foo.md -> exit 0(白名单)", () => {
    const result = evaluatePreCommit(["openspec/changes/foo/proposal.md"], ["started"], [], {});
    expect(result.exitCode).toBe(0);
  });

  it("有 pending_gate + 暂存 src/foo.ts -> exit 1(拦)", () => {
    const result = evaluatePreCommit(["src/foo.ts"], ["applying"], ["confirm-gate"], {});
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("user-gate");
  });

  it("无暂存文件 -> exit 0", () => {
    const result = evaluatePreCommit([], ["started"], [], {});
    expect(result.exitCode).toBe(0);
  });

  it("多文件部分拦截 -> exit 1 + 消息含所有被拦文件", () => {
    const result = evaluatePreCommit(["src/a.ts", "openspec/b.md", "src/c.ts"], ["started"], [], {});
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("src/a.ts");
    expect(result.message).toContain("src/c.ts");
    expect(result.message).not.toContain("openspec/b.md");
  });

  it("拦截消息含 ALLOY_FORCE_WRITE 绕过提示", () => {
    const result = evaluatePreCommit(["src/foo.ts"], ["started"], [], {});
    expect(result.message).toContain("ALLOY_FORCE_WRITE");
  });
});
