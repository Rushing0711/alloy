import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/core/health.js", () => ({
  runHealthCheck: vi.fn(),
}));

import { runHealthCheck } from "../../src/core/health.js";
import { doctorCommand, formatDoctorResult } from "../../src/cli/commands/doctor.js";
import type { HealthCheckResult } from "../../src/core/types.js";

describe("doctorCommand", () => {
  it("应返回 healthResults 和 consistencyWarnings", async () => {
    vi.mocked(runHealthCheck).mockResolvedValue([
      {
        name: "Node.js",
        status: "pass",
        current: "20.0.0",
        required: ">=18.0.0 <22.0.0",
      },
    ]);

    const result = await doctorCommand("/fake/project");
    expect(result.healthResults).toBeDefined();
    expect(result.healthResults).toHaveLength(1);
    expect(result.consistencyWarnings).toBeDefined();
  });
});

describe("formatDoctorResult", () => {
  it("应以文本格式输出 pass/warn/fail 三种状态", () => {
    const result = {
      healthResults: [
        {
          name: "Node.js",
          status: "pass" as const,
          current: "20.0.0",
          required: ">=18.0.0 <22.0.0",
        },
        {
          name: "OpenSpec",
          status: "fail" as const,
          current: "未安装",
          required: ">=1.3.0 <2.0.0",
        },
        {
          name: "Alloy",
          status: "warn" as const,
          current: "0.1.0",
          required: ">=0.1.0",
        },
      ],
      consistencyWarnings: [],
    };

    const output = formatDoctorResult(result, false);
    expect(output).toContain("✓");
    expect(output).toContain("✗");
    expect(output).toContain("⚠");
    expect(output).toContain("Node.js");
    expect(output).toContain("OpenSpec");
  });

  it("JSON 模式应输出有效 JSON", () => {
    const result = {
      healthResults: [] as HealthCheckResult[],
      consistencyWarnings: [],
    };

    const json = formatDoctorResult(result, true);
    const parsed = JSON.parse(json);
    expect(parsed.healthResults).toEqual([]);
    expect(parsed.consistencyWarnings).toEqual([]);
  });

  it("应显示文件一致性警告", () => {
    const result = {
      healthResults: [],
      consistencyWarnings: ["test-change: worktree 路径不可达"],
    };

    const output = formatDoctorResult(result, false);
    expect(output).toContain("test-change");
    expect(output).toContain("worktree");
  });
});
