import { describe, it, expect } from "vitest";
import { checkCompat, CompatConfig } from "../../src/cli/utils/compat.js";

describe("compat utils", () => {
  const mockConfig: CompatConfig = {
    compatible: {
      openspec: ">=1.3.0 <2.0.0",
      superpowers: ">=5.0.0 <6.0.0",
    },
    install: {
      openspec: "@fission-ai/openspec@1",
      superpowers: "obra/superpowers@5",
    },
  };

  it("checkCompat 返回两条结果", () => {
    const results = checkCompat(mockConfig);
    expect(results.length).toBe(2);
    expect(results[0].name).toBe("OpenSpec");
    expect(results[1].name).toBe("Superpowers");
  });

  it("checkCompat 每个结果包含 required 字段", () => {
    const results = checkCompat(mockConfig);
    for (const r of results) {
      expect(r.required).toBeTruthy();
      expect(typeof r.compatible).toBe("boolean");
    }
  });
});
