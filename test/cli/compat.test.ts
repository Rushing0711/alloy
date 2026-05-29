import { describe, it, expect, vi } from "vitest";
import type { CompatConfig } from "../../src/core/types.js";

const CONFIG: CompatConfig = {
  compatible: {
    openspec: ">=1.3.0 <2.0.0",
    superpowers: ">=5.0.0 <6.0.0",
  },
  install: {
    openspec: "@fission-ai/openspec@1",
    superpowers: "obra/superpowers@5",
  },
};

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import { checkCompat } from "../../src/core/compat.js";

function findResult(results: any[], name: string): any {
  return results.find((r) => r.name === name)!;
}

describe("checkCompat", () => {
  it("reports OpenSpec version within range as compatible", () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.5.0\n") as any);
    const results = checkCompat(CONFIG);
    const r = findResult(results, "OpenSpec");
    expect(r.compatible).toBe(true);
    expect(r.current).toBe("1.5.0");
  });

  it("reports OpenSpec below minimum as incompatible", () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.2.0\n") as any);
    const results = checkCompat(CONFIG);
    const r = findResult(results, "OpenSpec");
    expect(r.compatible).toBe(false);
  });

  it("reports OpenSpec prerelease as incompatible if outside range", () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("2.0.0-alpha.1\n") as any);
    const results = checkCompat(CONFIG);
    const r = findResult(results, "OpenSpec");
    expect(r.compatible).toBe(false);
  });

  it("reports OpenSpec not installed", () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("not found");
    });
    const results = checkCompat(CONFIG);
    const r = findResult(results, "OpenSpec");
    expect(r.current).toBe("未安装");
    expect(r.compatible).toBe(false);
  });

  it("reports Superpowers installed if skills command succeeds", () => {
    vi.mocked(execSync)
      .mockReturnValueOnce(Buffer.from("1.5.0\n") as any)
      .mockReturnValueOnce(Buffer.from("") as any);
    const results = checkCompat(CONFIG);
    const r = findResult(results, "Superpowers");
    expect(r.current).toBe("已安装");
    expect(r.compatible).toBe(true);
  });

  it("reports Superpowers not installed if skills command fails", () => {
    vi.mocked(execSync)
      .mockReturnValueOnce(Buffer.from("1.5.0\n") as any)
      .mockImplementationOnce(() => {
        throw new Error("not found");
      });
    const results = checkCompat(CONFIG);
    const r = findResult(results, "Superpowers");
    expect(r.current).toBe("未安装");
    expect(r.compatible).toBe(false);
  });
});
