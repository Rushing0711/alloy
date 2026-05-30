// test/cli/internal/record.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { recordCommand } from "../../../src/cli/commands/internal/record.js";
import { readState } from "../../../src/cli/utils/state.js";

describe("alloy _record", () => {
  let tmpDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-record-test-${Date.now()}`);
    changeDir = join(tmpDir, "test-change");
    await mkdir(changeDir, { recursive: true });
    const yaml = [
      "phase: started",
      "schema_version: 1",
      "worktree: null",
      'created_at: "2020-01-01T00:00:00"',
      'updated_at: "2020-01-01T00:00:00"',
      "records: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // 捕获 console.log 输出
  function captureLog(fn: () => Promise<void> | void): Promise<string> {
    return new Promise((resolve, reject) => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      });
      try {
        const result = fn();
        if (result instanceof Promise) {
          result.then(() => {
            spy.mockRestore();
            resolve(logs.join("\n"));
          }).catch((err: unknown) => {
            spy.mockRestore();
            reject(err);
          });
        } else {
          spy.mockRestore();
          resolve(logs.join("\n"));
        }
      } catch (err) {
        spy.mockRestore();
        reject(err);
      }
    });
  }

  describe("write", () => {
    it("写入新 record 到 state", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await recordCommand([
        "write",
        changeDir,
        "proposal",
        "abc123def456",
        "2025-01-15T10:30:00",
        "alice",
      ]);

      const state = await readState(changeDir);
      expect(state.records).toHaveLength(1);
      expect(state.records[0]).toEqual({
        artifact: "proposal",
        hash: "abc123def456",
        approved_at: "2025-01-15T10:30:00",
        approver: "alice",
      });

      exitSpy.mockRestore();
    });

    it("覆盖已有 record 同 artifact", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      // 先写入第一条
      await recordCommand([
        "write",
        changeDir,
        "proposal",
        "hash-v1",
        "2025-01-01T00:00:00",
        "bob",
      ]);

      // 再覆盖写入
      await recordCommand([
        "write",
        changeDir,
        "proposal",
        "hash-v2",
        "2025-02-01T00:00:00",
        "carol",
      ]);

      const state = await readState(changeDir);
      expect(state.records).toHaveLength(1);
      expect(state.records[0]).toEqual({
        artifact: "proposal",
        hash: "hash-v2",
        approved_at: "2025-02-01T00:00:00",
        approver: "carol",
      });

      exitSpy.mockRestore();
    });

    it("写入多个不同 artifact 的 record", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await recordCommand([
        "write",
        changeDir,
        "proposal",
        "hash-p",
        "2025-01-01T00:00:00",
        "alice",
      ]);
      await recordCommand([
        "write",
        changeDir,
        "design",
        "hash-d",
        "2025-01-02T00:00:00",
        "bob",
      ]);

      const state = await readState(changeDir);
      expect(state.records).toHaveLength(2);
      expect(state.records[0].artifact).toBe("proposal");
      expect(state.records[1].artifact).toBe("design");

      exitSpy.mockRestore();
    });

    it("输出 ✓ record 信息", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      const out = await captureLog(() =>
        recordCommand([
          "write",
          changeDir,
          "proposal",
          "abc123",
          "2025-06-01T00:00:00",
          "tester",
        ])
      );

      expect(out).toContain("✓ record: proposal → abc123");

      exitSpy.mockRestore();
    });
  });

  describe("compute", () => {
    it("返回 12 字符 hex hash", async () => {
      await writeFile(join(changeDir, "proposal.md"), "hello world", "utf-8");
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      const out = await captureLog(() =>
        recordCommand(["compute", changeDir, "proposal"])
      );

      expect(out).toMatch(/^[0-9a-f]{12}$/);

      exitSpy.mockRestore();
    });

    it("相同内容产生相同 hash", async () => {
      await writeFile(join(changeDir, "proposal.md"), "hello world", "utf-8");
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      const out1 = await captureLog(() =>
        recordCommand(["compute", changeDir, "proposal"])
      );
      const out2 = await captureLog(() =>
        recordCommand(["compute", changeDir, "proposal"])
      );

      expect(out1).toBe(out2);

      exitSpy.mockRestore();
    });

    it("不同内容产生不同 hash", async () => {
      await writeFile(join(changeDir, "proposal.md"), "hello", "utf-8");
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      const out1 = await captureLog(() =>
        recordCommand(["compute", changeDir, "proposal"])
      );

      // 修改内容
      await writeFile(join(changeDir, "proposal.md"), "world", "utf-8");
      const out2 = await captureLog(() =>
        recordCommand(["compute", changeDir, "proposal"])
      );

      expect(out1).not.toBe(out2);

      exitSpy.mockRestore();
    });

    it("文件不存在时 exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await recordCommand(["compute", changeDir, "proposal"]);

      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("specs 目录 hash 为目录内容排序后拼接", async () => {
      const specsDir = join(changeDir, "specs");
      await mkdir(specsDir, { recursive: true });
      await writeFile(join(specsDir, "alpha.md"), "aaa", "utf-8");
      await writeFile(join(specsDir, "beta.md"), "bbb", "utf-8");
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      const out = await captureLog(() =>
        recordCommand(["compute", changeDir, "specs"])
      );

      expect(out).toMatch(/^[0-9a-f]{12}$/);

      // 排序验证: beta.md 在前, alpha.md 在后产生的 hash 应该相同 (因为按名称排序)
      const changeDir2 = join(tmpDir, "test-change2");
      const specsDir2 = join(changeDir2, "specs");
      await mkdir(specsDir2, { recursive: true });
      // 故意以不同顺序写入
      await writeFile(join(specsDir2, "beta.md"), "bbb", "utf-8");
      await writeFile(join(specsDir2, "alpha.md"), "aaa", "utf-8");

      const out2 = await captureLog(() =>
        recordCommand(["compute", changeDir2, "specs"])
      );

      expect(out).toBe(out2);

      exitSpy.mockRestore();
    });
  });

  describe("check", () => {
    it("所有 records 匹配时 PASS", async () => {
      // 创建制品文件
      await writeFile(join(changeDir, "proposal.md"), "proposal content", "utf-8");
      await writeFile(join(changeDir, "design.md"), "design content", "utf-8");

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      // 先 compute 出 hash
      const hashP = await captureLog(() =>
        recordCommand(["compute", changeDir, "proposal"])
      );
      const hashD = await captureLog(() =>
        recordCommand(["compute", changeDir, "design"])
      );

      // 写入 records
      await recordCommand(["write", changeDir, "proposal", hashP, "2025-01-01T00:00:00", "alice"]);
      await recordCommand(["write", changeDir, "design", hashD, "2025-01-01T00:00:00", "alice"]);

      const out = await captureLog(() =>
        recordCommand(["check", changeDir])
      );

      expect(out).toContain("[PASS] proposal:");
      expect(out).toContain("[PASS] design:");
      exitSpy.mockRestore();
    });

    it("hash 不匹配时 exit 1", async () => {
      await writeFile(join(changeDir, "proposal.md"), "original content", "utf-8");

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      // 写入一个不匹配的 hash
      await recordCommand(["write", changeDir, "proposal", "deadbeef0000", "2025-01-01T00:00:00", "alice"]);

      const out = await captureLog(() =>
        recordCommand(["check", changeDir])
      );

      expect(out).toContain("[FAIL] proposal: hash 不匹配");
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it("文件被删除时 FAIL", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      // 写入 record 但不创建文件
      await recordCommand(["write", changeDir, "proposal", "abc123", "2025-01-01T00:00:00", "alice"]);

      const out = await captureLog(() =>
        recordCommand(["check", changeDir])
      );

      expect(out).toContain("[FAIL] proposal: 文件不存在");
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it("按 artifact 过滤 check", async () => {
      await writeFile(join(changeDir, "proposal.md"), "pc", "utf-8");
      await writeFile(join(changeDir, "design.md"), "dc", "utf-8");

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      const hashP = await captureLog(() =>
        recordCommand(["compute", changeDir, "proposal"])
      );
      const hashD = await captureLog(() =>
        recordCommand(["compute", changeDir, "design"])
      );

      await recordCommand(["write", changeDir, "proposal", hashP, "2025-01-01T00:00:00", "alice"]);
      await recordCommand(["write", changeDir, "design", hashD, "2025-01-01T00:00:00", "alice"]);

      const out = await captureLog(() =>
        recordCommand(["check", changeDir, "proposal"])
      );

      expect(out).toContain("[PASS] proposal:");
      expect(out).not.toContain("design");
      exitSpy.mockRestore();
    });

    it("无 records 时 check 输出 WARN 并 exit 0", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      const out = await captureLog(() =>
        recordCommand(["check", changeDir])
      );

      expect(out).toContain("[WARN] 无 records 可校验");
      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
    });

    it("指定 artifact 但无 record 时 exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      const out = await captureLog(() =>
        recordCommand(["check", changeDir, "nonexistent"])
      );

      expect(out).toContain("[WARN] 未找到制品 'nonexistent' 的 record");
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });
  });

  describe("参数校验", () => {
    it("缺少 action 和 changeDir 时 exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await recordCommand([]);

      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("write 缺少参数时 exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await recordCommand(["write", changeDir]);

      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("compute 缺少 artifact 时 exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await recordCommand(["compute", changeDir]);

      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });

    it("未知 action 时 exit 1", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await recordCommand(["unknown", changeDir]);

      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      errSpy.mockRestore();
    });
  });
});
