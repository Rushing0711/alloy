// test/core/artifacts.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { computeArtifactHash, computeHash } from "../../src/core/artifacts.js";

describe("computeArtifactHash", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-hash-test-${Date.now()}`);
    changeDir = join(tmpDir, "change");
    await mkdir(changeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("单文件制品：返回内容 hash", async () => {
    await writeFile(join(changeDir, "draft.md"), "# draft", "utf-8");
    const hash = await computeArtifactHash(changeDir, "draft");
    expect(hash).toBe(computeHash("# draft"));
  });

  it("未知制品返回 null", async () => {
    const hash = await computeArtifactHash(changeDir, "bogus");
    expect(hash).toBeNull();
  });

  it("文件不存在返回 null", async () => {
    const hash = await computeArtifactHash(changeDir, "draft");
    expect(hash).toBeNull();
  });

  it("specs 目录制品：递归读取子目录文件（N1 回归）", async () => {
    // 模拟 OpenSpec specs 结构：specs/<capability>/spec.md
    const specsDir = join(changeDir, "specs");
    await mkdir(join(specsDir, "todo-management"), { recursive: true });
    await mkdir(join(specsDir, "todo-completion"), { recursive: true });
    await writeFile(join(specsDir, "todo-management", "spec.md"), "management spec", "utf-8");
    await writeFile(join(specsDir, "todo-completion", "spec.md"), "completion spec", "utf-8");

    const hash = await computeArtifactHash(changeDir, "specs");

    // 不应是 sha256("") 的前缀（旧 bug）
    expect(hash).not.toBe("e3b0c44298fc");
    expect(hash).toMatch(/^[a-f0-9]{12}$/);

    // 应等于两个文件内容拼接的 hash（按文件路径排序：todo-completion 在前）
    const expected = computeHash("completion spec" + "management spec");
    expect(hash).toBe(expected);
  });

  it("specs 多层嵌套目录也能读取", async () => {
    const specsDir = join(changeDir, "specs");
    await mkdir(join(specsDir, "a", "deep", "path"), { recursive: true });
    await writeFile(join(specsDir, "a", "deep", "path", "spec.md"), "deep", "utf-8");
    await writeFile(join(specsDir, "top.md"), "top", "utf-8");

    const hash = await computeArtifactHash(changeDir, "specs");
    expect(hash).not.toBe("e3b0c44298fc");
    expect(hash).toMatch(/^[a-f0-9]{12}$/);
  });

  it("specs 空目录返回 sha256('') 的前缀（边界，但不是 bug）", async () => {
    await mkdir(join(changeDir, "specs"), { recursive: true });
    const hash = await computeArtifactHash(changeDir, "specs");
    // 空目录确实无文件，hash 为 sha256("") 是预期行为
    expect(hash).toBe("e3b0c44298fc");
  });

  it("内容稳定：相同文件不同写入顺序产生相同 hash", async () => {
    // 第一组
    const specsA = join(changeDir, "specs");
    await mkdir(join(specsA, "b-cap"), { recursive: true });
    await mkdir(join(specsA, "a-cap"), { recursive: true });
    await writeFile(join(specsA, "b-cap", "spec.md"), "B", "utf-8");
    await writeFile(join(specsA, "a-cap", "spec.md"), "A", "utf-8");
    const hashA = await computeArtifactHash(changeDir, "specs");

    // 第二组（另一目录，相同内容）
    const changeDir2 = join(tmpDir, "change2");
    await mkdir(join(changeDir2, "specs", "b-cap"), { recursive: true });
    await mkdir(join(changeDir2, "specs", "a-cap"), { recursive: true });
    await writeFile(join(changeDir2, "specs", "b-cap", "spec.md"), "B", "utf-8");
    await writeFile(join(changeDir2, "specs", "a-cap", "spec.md"), "A", "utf-8");
    const hashB = await computeArtifactHash(changeDir2, "specs");

    expect(hashA).toBe(hashB);
  });
});
