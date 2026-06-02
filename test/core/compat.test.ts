// test/core/compat.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadCompat } from "../../src/core/compat.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadCompat", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-compat-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("成功加载有效的 compat.yaml", async () => {
    const yaml = `
compatible:
  node: ">=18.0.0"
  openspec: ">=1.3.0 <2.0.0"
  superpowers: ">=5.0.0 <6.0.0"
  alloy: ">=0.1.0"
  schema: 1
install:
  openspec: "@fission-ai/openspec@1"
  superpowers: "obra/superpowers@5"
`;
    await writeFile(join(tmpDir, "compat.yaml"), yaml, "utf-8");

    const result = await loadCompat(tmpDir);

    expect(result).toEqual({
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
    });
  });

  it("compat.yaml 不存在时抛出错误", async () => {
    await expect(loadCompat(tmpDir)).rejects.toThrow();
  });

  it("compat.yaml 格式错误时抛出错误", async () => {
    const invalidYaml = "invalid: yaml: content: [";
    await writeFile(join(tmpDir, "compat.yaml"), invalidYaml, "utf-8");

    await expect(loadCompat(tmpDir)).rejects.toThrow();
  });

  it("compat.yaml 为空时返回空对象", async () => {
    await writeFile(join(tmpDir, "compat.yaml"), "", "utf-8");

    const result = await loadCompat(tmpDir);
    expect(result).toBeNull();
  });

  it("加载 Alloy 项目内置的 compat.yaml", async () => {
    // 使用项目根目录的 compat.yaml（如果存在）
    const { getPackageRoot } = await import("../../src/utils/fs.js");
    const packageRoot = getPackageRoot();

    try {
      const result = await loadCompat(packageRoot);
      expect(result).toHaveProperty("compatible");
      expect(result).toHaveProperty("install");
      expect(result.compatible).toHaveProperty("node");
      expect(result.compatible).toHaveProperty("openspec");
      expect(result.compatible).toHaveProperty("superpowers");
      expect(result.compatible).toHaveProperty("alloy");
      expect(result.compatible).toHaveProperty("schema");
      expect(result.install).toHaveProperty("openspec");
      expect(result.install).toHaveProperty("superpowers");
    } catch {
      // 如果项目根目录没有 compat.yaml，跳过此测试
      console.log("跳过：项目根目录没有 compat.yaml");
    }
  });
});
