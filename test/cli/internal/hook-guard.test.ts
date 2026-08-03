// test/cli/internal/hook-guard.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => { throw new Error("不应被调用"); },
}));

import { evaluateHook, collectPhases, collectPendingGates, clearAllPendingGates, collectWorktreePaths } from "../../../src/cli/commands/internal/hook-guard.js";
import { writeState, createInitialState, readState } from "../../../src/cli/utils/state.js";

describe("alloy _hook-guard", () => {
  describe("evaluateHook(纯逻辑)", () => {
    it("ALLOY_FORCE_WRITE=1 逃生阀 -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], { ALLOY_FORCE_WRITE: "1" });
      expect(result.exitCode).toBe(0);
    });

    it("空 stdin -> exit 0(非 hook 场景)", () => {
      const result = evaluateHook("", ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("非 JSON stdin -> exit 0", () => {
      const result = evaluateHook("not json", ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("非 Write/Edit 工具 -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("Bash cat heredoc 写文件 -> exit 2", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "cat << EOF > file.txt" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("cat heredoc");
    });

    it("Bash > file 重定向 -> exit 0(不拦重定向,只拦 heredoc)", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "echo hello > file.txt" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("Bash > /dev/null 丢弃输出 -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "alloy _record check && echo done > /dev/null" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("Bash git reset --hard -> exit 2", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git reset --hard HEAD~1" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("git 自救");
    });

    it("Bash git checkout . -> exit 2", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git checkout ." } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("git 自救");
    });

    it("Bash git stash drop -> exit 2", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git stash drop stash@{0}" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("git 自救");
    });

    it("Bash git merge --abort -> exit 2", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git merge --abort" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("git 自救");
    });

    it("Bash git clean -fd -> exit 2", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git clean -fd" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("git 自救");
    });

    it("Bash echo 字符串含 'git reset --hard' 文本 -> exit 0(不误拦 echo 内容)", () => {
      const cmd = `echo "  禁止:agent 自动运行 git reset --hard origin/<main_branch> 强制对齐。"`;
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: cmd } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("Bash finish SKILL.md 的 git pull 完整块(含 echo 'git reset --hard' 文本)-> exit 0", () => {
      const cmd = `REMOTE=$(git remote -v | head -1)
if [ -z "$REMOTE" ]; then
  echo "ℹ️ 无 remote 配置--跳过 git pull"
else
  if ! git pull --ff-only; then
    echo "  禁止:agent 自动运行 git reset --hard origin/<main_branch> 强制对齐。"
    exit 1
  fi
fi`;
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: cmd } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("Bash && git reset --hard -> exit 2(命令分隔符后是实际命令,拦)", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "echo foo && git reset --hard HEAD~1" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("git 自救");
    });

    it("Bash $(git reset --hard) 命令替换内 -> exit 2(子shell 内也拦)", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "RESULT=$(git reset --hard HEAD~1)" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("git 自救");
    });

    it("Bash git branch -D <feature> -> exit 2(下沉到 _finish-cleanup,agent 禁直接跑)", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git branch -D feature/add-hello-script" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("git 自救");
    });

    it("Bash && git branch -D -> exit 2(命令分隔符后是实际命令,拦)", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "echo done && git branch -D feature/test" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("git 自救");
    });

    it("Bash git branch -d (小写,-d 不是 -D) -> exit 0(不拦,小写 -d 是安全删除)", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git branch -d feature/test" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("Bash echo 'git branch -D' 文本 -> exit 0(不误拦 echo 内容)", () => {
      const cmd = `echo "禁止:agent 自动运行 git branch -D feature/test 强删分支。"`;
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: cmd } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("Bash 普通命令(git status / ls / echo)-> exit 0", () => {
      const commands = ["git status", "ls -la", "echo hello", "git log --oneline"];
      for (const cmd of commands) {
        const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: cmd } });
        const result = evaluateHook(stdin, ["started"], {});
        expect(result.exitCode).toBe(0);
      }
    });

    it("Bash git commit -> 返回 checkUnlockedArtifact: true(交 hookGuardCommand 检查)", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git commit -m 'test'" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(0);
      expect(result.checkUnlockedArtifact).toBe(true);
    });

    it("Bash git commit -a -> 返回 checkUnlockedArtifact: true", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git commit -am 'test'" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(0);
      expect(result.checkUnlockedArtifact).toBe(true);
    });

    it("Bash 非 git commit 命令 -> checkUnlockedArtifact 未设置", () => {
      const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git status" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.checkUnlockedArtifact).toBeUndefined();
    });

    it("Read 工具 -> exit 0(只拦写)", () => {
      const stdin = JSON.stringify({ tool_name: "Read", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("Write 工具 + apply phases -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["applying"], {});
      expect(result.exitCode).toBe(0);
    });

    it("Write 工具 + 非 apply phases + src/ -> exit 2 + 拦截消息", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("src/foo.ts");
      expect(result.message).toContain("started");
    });

    it("Edit 工具 + 非 apply phases + src/ -> exit 2", () => {
      const stdin = JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["planned"], {});
      expect(result.exitCode).toBe(2);
    });

    it("Write 工具 + 非 apply phases + openspec/ -> exit 0(白名单)", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "openspec/changes/foo/proposal.md" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("Write 工具 + 空 phases(非 alloy 项目) -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, [], {}, undefined, [], false);
      expect(result.exitCode).toBe(0);
    });

    it("Write 工具 + alloy 项目 + 空 phases -> exit 2(核心修复:防绕过)", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, [], {}, undefined, [], true);
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("无活跃 change");
    });

    it("Write 工具 + alloy 项目 + 空 phases + 白名单 -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "openspec/foo.md" } });
      const result = evaluateHook(stdin, [], {}, undefined, [], true);
      expect(result.exitCode).toBe(0);
    });

    it("Write 工具 + 无 file_path -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: {} });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.exitCode).toBe(0);
    });

    it("Write 工具 + 绝对路径 -> 正确转相对路径判定", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/project/src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], {}, "/project");
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("src/foo.ts");
    });

    it("Write 工具 + 绝对路径 + apply -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/project/src/foo.ts" } });
      const result = evaluateHook(stdin, ["applied"], {}, "/project");
      expect(result.exitCode).toBe(0);
    });

    it("拦截消息不含逃生阀字样(防 agent 读输出后照做绕过)", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], {});
      // 实测(2026-08-02 OpenCode session):hook 输出提示 ALLOY_FORCE_WRITE=1,
      // agent 读到后下一轮就 `ALLOY_FORCE_WRITE=1 git branch -D` 绕过禁令。
      // 对 agent 可见的逃生阀 = 对 agent 可用的逃生阀,拦截输出不得提及逃生阀。
      expect(result.message).not.toContain("ALLOY_FORCE_WRITE");
      expect(result.message).toContain("由用户在终端处理");
    });

    it("拦截消息包含 apply 阶段进入提示", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], {});
      expect(result.message).toContain("alloy _phase start");
    });

    it("AskUserQuestion 工具 + pendingGates 非空 -> clearPendingGates: true, exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "AskUserQuestion", tool_input: {} });
      const result = evaluateHook(stdin, ["started"], {}, undefined, ["confirm-main-branch"]);
      expect(result.exitCode).toBe(0);
      expect(result.clearPendingGates).toBe(true);
    });

    it("AskUserQuestion + pendingGates 空 -> clearPendingGates falsy", () => {
      const stdin = JSON.stringify({ tool_name: "AskUserQuestion", tool_input: {} });
      const result = evaluateHook(stdin, ["started"], {}, undefined, []);
      expect(result.exitCode).toBe(0);
      expect(result.clearPendingGates).toBeFalsy();
    });

    it("question 工具(OpenCode)+ pendingGates 非空 -> clearPendingGates: true", () => {
      const stdin = JSON.stringify({ tool_name: "question", tool_input: {} });
      const result = evaluateHook(stdin, ["started"], {}, undefined, ["gate-a"]);
      expect(result.exitCode).toBe(0);
      expect(result.clearPendingGates).toBe(true);
    });

    it("Write + pendingGates 非空 + 非白名单 -> exit 2(拦截)", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["applying"], {}, undefined, ["confirm-execution"]);
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("user-gate");
    });

    it("Write + pendingGates 非空 + 白名单 -> exit 0", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "openspec/foo.md" } });
      const result = evaluateHook(stdin, ["started"], {}, undefined, ["gate-a"]);
      expect(result.exitCode).toBe(0);
    });

    it("Write + pendingGates 非空 + apply 阶段 -> exit 2(pending_gate 优先于 apply)", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["applying"], {}, undefined, ["gate-a"]);
      expect(result.exitCode).toBe(2);
    });

    it("Write + pendingGates 非空 + 拦截消息含 _guard user-gate pass", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], {}, undefined, ["gate-a"]);
      expect(result.message).toContain("alloy _guard user-gate pass");
    });

    it("Claude Code(CLAUDECODE=1)拦截消息含 AskUserQuestion", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], { CLAUDECODE: "1" }, undefined, ["gate-a"]);
      expect(result.message).toContain("AskUserQuestion");
    });

    it("OpenCode(OPENCODE=1)拦截消息含 question", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], { OPENCODE: "1" }, undefined, ["gate-a"]);
      expect(result.message).toContain("question");
    });

    it("Pi(PI_CODING_AGENT=true)拦截消息含 alloy-question", () => {
      const stdin = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/foo.ts" } });
      const result = evaluateHook(stdin, ["started"], { PI_CODING_AGENT: "true" }, undefined, ["gate-a"]);
      expect(result.message).toContain("alloy-question");
    });
  });

  describe("collectPhases(文件系统扫描)", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = join(tmpdir(), `alloy-hook-guard-${Date.now()}`);
      await mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("无 openspec/changes/ -> []", () => {
      expect(collectPhases(tmpDir)).toEqual([]);
    });

    it("有 change + .alloy.yaml -> [phase]", async () => {
      const changeDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, ".alloy.yaml"), "phase: started\nworktree: null\n", "utf-8");
      expect(collectPhases(tmpDir)).toEqual(["started"]);
    });

    it("有 change 无 .alloy.yaml -> []", async () => {
      const changeDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(changeDir, { recursive: true });
      expect(collectPhases(tmpDir)).toEqual([]);
    });

    it("多个 change -> [phase1, phase2]", async () => {
      const fooDir = join(tmpDir, "openspec", "changes", "foo");
      const barDir = join(tmpDir, "openspec", "changes", "bar");
      await mkdir(fooDir, { recursive: true });
      await mkdir(barDir, { recursive: true });
      await writeFile(join(fooDir, ".alloy.yaml"), "phase: started\n", "utf-8");
      await writeFile(join(barDir, ".alloy.yaml"), "phase: applying\n", "utf-8");
      const phases = collectPhases(tmpDir);
      expect(phases).toContain("started");
      expect(phases).toContain("applying");
      expect(phases).toHaveLength(2);
    });

    it(".alloy.yaml 无 phase 字段 -> 跳过", async () => {
      const changeDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, ".alloy.yaml"), "worktree: null\n", "utf-8");
      expect(collectPhases(tmpDir)).toEqual([]);
    });

    it("phase 值带引号 -> 正确提取", async () => {
      const changeDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, ".alloy.yaml"), 'phase: "planned"\n', "utf-8");
      expect(collectPhases(tmpDir)).toEqual(["planned"]);
    });

    it("扫描 archive/ 下的 archived change -> [archived]", async () => {
      const archiveChangeDir = join(tmpDir, "openspec", "changes", "archive", "2026-07-10-foo");
      await mkdir(archiveChangeDir, { recursive: true });
      await writeFile(join(archiveChangeDir, ".alloy.yaml"), "phase: archived\n", "utf-8");
      expect(collectPhases(tmpDir)).toEqual(["archived"]);
    });

    it("扫描 archive/ 下的 finished change -> [](已完成,跳过)", async () => {
      const archiveChangeDir = join(tmpDir, "openspec", "changes", "archive", "2026-07-10-foo");
      await mkdir(archiveChangeDir, { recursive: true });
      await writeFile(join(archiveChangeDir, ".alloy.yaml"), "phase: finished\n", "utf-8");
      expect(collectPhases(tmpDir)).toEqual([]);
    });

    it("collectPhases(includeFinished=true) 含 finished(放行 squash merge commit)", async () => {
      const archiveChangeDir = join(tmpDir, "openspec", "changes", "archive", "2026-07-10-foo");
      await mkdir(archiveChangeDir, { recursive: true });
      await writeFile(join(archiveChangeDir, ".alloy.yaml"), "phase: finished\n", "utf-8");
      expect(collectPhases(tmpDir, true)).toEqual(["finished"]);
    });

    it("同时扫描活跃 + 归档 change(归档非 finished 仍收集)", async () => {
      const activeDir = join(tmpDir, "openspec", "changes", "bar");
      const archiveDir = join(tmpDir, "openspec", "changes", "archive", "2026-07-10-foo");
      await mkdir(activeDir, { recursive: true });
      await mkdir(archiveDir, { recursive: true });
      await writeFile(join(activeDir, ".alloy.yaml"), "phase: applying\n", "utf-8");
      await writeFile(join(archiveDir, ".alloy.yaml"), "phase: archived\n", "utf-8");
      const phases = collectPhases(tmpDir);
      expect(phases).toContain("applying");
      expect(phases).toContain("archived");
    });
  });

  describe("collectPendingGates(文件系统扫描)", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = join(tmpdir(), `alloy-hook-pending-${Date.now()}`);
      await mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("无 openspec/changes/ -> []", () => {
      expect(collectPendingGates(tmpDir)).toEqual([]);
    });

    it("有 change + pending_gate -> [gate-id]", async () => {
      const changeDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, ".alloy.yaml"), "phase: started\npending_gate: confirm-main-branch\n", "utf-8");
      expect(collectPendingGates(tmpDir)).toEqual(["confirm-main-branch"]);
    });

    it("有 change + pending_gate: null -> []", async () => {
      const changeDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, ".alloy.yaml"), "phase: started\npending_gate: null\n", "utf-8");
      expect(collectPendingGates(tmpDir)).toEqual([]);
    });

    it("有 change 无 pending_gate 字段 -> []", async () => {
      const changeDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, ".alloy.yaml"), "phase: started\n", "utf-8");
      expect(collectPendingGates(tmpDir)).toEqual([]);
    });

    it("多个 change + 部分有 pending_gate -> [gate-id]", async () => {
      const fooDir = join(tmpDir, "openspec", "changes", "foo");
      const barDir = join(tmpDir, "openspec", "changes", "bar");
      await mkdir(fooDir, { recursive: true });
      await mkdir(barDir, { recursive: true });
      await writeFile(join(fooDir, ".alloy.yaml"), "phase: started\npending_gate: gate-a\n", "utf-8");
      await writeFile(join(barDir, ".alloy.yaml"), "phase: planning\n", "utf-8");
      expect(collectPendingGates(tmpDir)).toEqual(["gate-a"]);
    });
  });

  describe("clearAllPendingGates", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = join(tmpdir(), `alloy-hook-clear-${Date.now()}`);
      await mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("清所有 change 的 pending_gate", async () => {
      const fooDir = join(tmpDir, "openspec", "changes", "foo");
      const barDir = join(tmpDir, "openspec", "changes", "bar");
      await mkdir(fooDir, { recursive: true });
      await mkdir(barDir, { recursive: true });

      const fooState = createInitialState();
      fooState.pending_gate = "gate-a";
      fooState.phase = "started";
      await writeState(fooDir, fooState);

      const barState = createInitialState();
      barState.pending_gate = "gate-b";
      barState.phase = "planning";
      await writeState(barDir, barState);

      await clearAllPendingGates(tmpDir);

      expect(collectPendingGates(tmpDir)).toEqual([]);
    });

    it("无 change -> 不报错", async () => {
      await expect(clearAllPendingGates(tmpDir)).resolves.not.toThrow();
    });

    it("pending_gate 已 null -> 幂等", async () => {
      const fooDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(fooDir, { recursive: true });
      const fooState = createInitialState();
      fooState.phase = "started";
      await writeState(fooDir, fooState);

      await clearAllPendingGates(tmpDir);

      expect(collectPendingGates(tmpDir)).toEqual([]);
    });

    it("worktree 路径不存在时,只 clear 主仓(不报错)", async () => {
      const mainChangeDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(mainChangeDir, { recursive: true });
      const mainState = createInitialState();
      mainState.phase = "applying";
      mainState.worktree = ".worktrees/foo"; // worktree 路径不存在
      mainState.pending_gate = "apply:lock-verify";
      await writeState(mainChangeDir, mainState);

      await clearAllPendingGates(tmpDir);

      const mainAfter = await readState(mainChangeDir);
      expect(mainAfter.pending_gate).toBeNull();
    });

    it(".alloy.yaml 有 YAML 重复键时输出 stderr(不静默吞错)", async () => {
      // 模拟 setPendingGate 旧 bug 产生的损坏:.alloy.yaml 有两处 pending_gate 行
      // 旧 hook-guard catch 块静默吞 YAMLParseError,bug 沿时间线传播
      // 修复后应输出 stderr 提示,不阻断 hook exit code
      const fooDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(fooDir, { recursive: true });
      const brokenYaml = [
        "phase: applying",
        "schema_version: 1",
        "pending_gate: apply:sdd-ep-choice",
        "gate_history: []",
        "phase_timings:",
        "  apply:",
        "    completed_at: null",
        "pending_gate: null",  // 重复键(YAML 不允许)
      ].join("\n");
      await writeFile(join(fooDir, ".alloy.yaml"), brokenYaml, "utf-8");

      // 捕获 stderr
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      // 不抛错(hook 不能因 .alloy.yaml 损坏阻塞工具调用)
      await expect(clearAllPendingGates(tmpDir)).resolves.not.toThrow();

      // stderr 有输出提示
      expect(stderrSpy).toHaveBeenCalled();
      const stderrOutput = stderrSpy.mock.calls.map(c => String(c[0])).join("");
      expect(stderrOutput).toContain("hook-guard clearAllPendingGates 失败");
      expect(stderrOutput).toContain("foo");

      stderrSpy.mockRestore();
    });

    // 注意:worktree 内 .alloy.yaml 兜底扫描的测试在 hook-guard.integration.test.ts
    // (用真实 git worktree 验证 listGitWorktrees 的 git worktree list 调用)
  });


  describe("worktree 路径拦截", () => {
    it("worktree 模式 + 相对路径写源码 -> 拦截 exit 2", () => {
      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: "scripts/hello.sh" },
      });
      const result = evaluateHook(stdin, ["applying"], {}, "/project", [], true, ["/project/.worktrees/foo"]);
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("worktree 绝对路径");
    });

    it("worktree 模式 + 相对路径写制品 -> 拦截 exit 2", () => {
      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: "openspec/changes/foo/verify.md" },
      });
      const result = evaluateHook(stdin, ["applying"], {}, "/project", [], true, ["/project/.worktrees/foo"]);
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("worktree 绝对路径");
    });

    it("worktree 模式 + worktree 绝对路径写源码 -> 放行", () => {
      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: "/project/.worktrees/foo/scripts/hello.sh" },
      });
      const result = evaluateHook(stdin, ["applying"], {}, "/project", [], true, ["/project/.worktrees/foo"]);
      expect(result.exitCode).toBe(0);
    });

    it("worktree 模式 + 主仓绝对路径写源码 -> 拦截", () => {
      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: "/project/scripts/hello.sh" },
      });
      const result = evaluateHook(stdin, ["applying"], {}, "/project", [], true, ["/project/.worktrees/foo"]);
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("worktree 绝对路径");
    });

    it("worktree 模式 + 写 .alloy.yaml(非制品) -> 放行(白名单)", () => {
      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: "openspec/changes/foo/.alloy.yaml" },
      });
      // .alloy.yaml 在白名单,不被 worktree 路径拦截(sourcePattern 排除 .alloy.yaml)
      const result = evaluateHook(stdin, ["applying"], {}, "/project", [], true, ["/project/.worktrees/foo"]);
      expect(result.exitCode).toBe(0);
    });

    it("无 worktree 模式 change + 相对路径写源码 -> 放行(apply 阶段)", () => {
      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: "scripts/hello.sh" },
      });
      const result = evaluateHook(stdin, ["applying"], {}, "/project", [], true, []);
      expect(result.exitCode).toBe(0);
    });

    it("worktree 模式 + ALLOY_FORCE_WRITE=1 -> 放行(逃生阀)", () => {
      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: "scripts/hello.sh" },
      });
      const result = evaluateHook(stdin, ["applying"], { ALLOY_FORCE_WRITE: "1" }, "/project", [], true, ["/project/.worktrees/foo"]);
      expect(result.exitCode).toBe(0);
    });

    it("collectWorktreePaths 收集 worktree 路径", async () => {
      const tmpDir = join(tmpdir(), `alloy-wt-paths-${Date.now()}`);
      const fooDir = join(tmpDir, "openspec", "changes", "foo");
      const barDir = join(tmpDir, "openspec", "changes", "bar");
      await mkdir(fooDir, { recursive: true });
      await mkdir(barDir, { recursive: true });

      const fooState = createInitialState();
      fooState.phase = "applying";
      fooState.worktree = "/tmp/.worktrees/foo" as any;
      await writeState(fooDir, fooState);

      const barState = createInitialState();
      barState.phase = "planning";
      barState.worktree = null;
      await writeState(barDir, barState);

      const paths = collectWorktreePaths(tmpDir);
      expect(paths).toContain("/tmp/.worktrees/foo");
      expect(paths).not.toContain(null as any);
      expect(paths.length).toBe(1);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("collectWorktreePaths 相对路径归一化为绝对路径(复现 bug:agent 误用 .worktrees/<name>)", async () => {
      // bug 现场:agent 用相对路径 .claude/worktrees/<name> 写入 worktree 字段
      // (套用 SKILL.md 文档示例字面字符串,而非 worktree.md 期望的 pwd -P 绝对路径)
      // hook-guard 用绝对路径 startsWith 匹配相对路径字符串,永远 false,误拦所有 Write/Edit
      // 修复:collectWorktreePaths 把相对路径归一化为绝对路径(以主仓 root 为基准)
      const tmpDir = join(tmpdir(), `alloy-wt-rel-${Date.now()}`);
      const fooDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(fooDir, { recursive: true });

      const fooState = createInitialState();
      fooState.phase = "applying";
      fooState.worktree = ".claude/worktrees/foo" as any;  // 相对路径(agent 误用)
      await writeState(fooDir, fooState);

      const paths = collectWorktreePaths(tmpDir);
      // 归一化后是绝对路径:tmpDir/.claude/worktrees/foo
      // (测试环境 mock execSync,getMainRepoRoot 回退到 projectRoot=tmpDir)
      expect(paths).toEqual([join(tmpDir, ".claude/worktrees/foo")]);
      // 不再返回相对路径(否则 startsWith 匹配失败)
      expect(paths).not.toContain(".claude/worktrees/foo");

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("collectWorktreePaths OpenCode .worktrees/<name> 相对路径也归一化", async () => {
      // OpenCode 的 _worktree-create 命令也写相对路径 .worktrees/<name>
      // (src/cli/commands/internal/worktree-create.ts:61)
      const tmpDir = join(tmpdir(), `alloy-wt-opencode-${Date.now()}`);
      const fooDir = join(tmpDir, "openspec", "changes", "foo");
      await mkdir(fooDir, { recursive: true });

      const fooState = createInitialState();
      fooState.phase = "applying";
      fooState.worktree = ".worktrees/foo" as any;  // OpenCode 相对路径
      await writeState(fooDir, fooState);

      const paths = collectWorktreePaths(tmpDir);
      expect(paths).toEqual([join(tmpDir, ".worktrees/foo")]);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("evaluateHook: 相对路径 worktree 字段 + 写文件在 worktree 内 -> 放行(修复后)", () => {
      // 修复前:wtPaths=["/project/.worktrees/foo"] 时,agent 写绝对路径在 worktree 内 -> 放行
      //         但 wtPaths=[".worktrees/foo"](相对)时,startsWith 匹配失败 -> 拦截
      // 修复后:collectWorktreePaths 归一化为绝对路径,evaluateHook 接收的 wtPaths 都是绝对路径,
      //         原有 startsWith 逻辑正确工作
      // 此测试用绝对路径 wtPaths 模拟修复后的 collectWorktreePaths 输出
      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: "/project/.worktrees/foo/scripts/hello.sh" },
      });
      const result = evaluateHook(stdin, ["applying"], {}, "/project", [], true, ["/project/.worktrees/foo"]);
      expect(result.exitCode).toBe(0);
    });

    it("evaluateHook: 相对路径 worktree 字段 + 写文件在主仓 -> 拦截(防止落主仓)", () => {
      // worktree 模式下,相对路径写源码应拦截(避免文件落主仓)
      // 此场景在 OpenCode 下:agent bash 传 workdir 但 write/edit 独立进程不共享 cwd
      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: "scripts/hello.sh" },  // 相对路径 -> 按主仓 cwd 解析
      });
      const result = evaluateHook(stdin, ["applying"], {}, "/project", [], true, ["/project/.worktrees/foo"]);
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain("worktree 绝对路径");
    });
  });
});

describe("alloy _hook-guard - apply_patch(Codex 写文件工具)", () => {
  it("apply_patch 写源码在非 apply 阶段 -> exit 2", () => {
    const stdin = JSON.stringify({
      tool_name: "apply_patch",
      tool_input: { command: "*** Begin Patch\n*** Add File: scripts/hello.sh\n+echo hi\n*** End Patch" },
    });
    const result = evaluateHook(stdin, ["started"], {});
    expect(result.exitCode).toBe(2);
  });

  it("apply_patch 写 docs/ 白名单 -> exit 0", () => {
    const stdin = JSON.stringify({
      tool_name: "apply_patch",
      tool_input: { command: "*** Begin Patch\n*** Add File: docs/guide.md\n+# doc\n*** End Patch" },
    });
    const result = evaluateHook(stdin, ["started"], {});
    expect(result.exitCode).toBe(0);
  });

  it("apply_patch 写多个文件,任一非白名单 -> exit 2", () => {
    const stdin = JSON.stringify({
      tool_name: "apply_patch",
      tool_input: { command: "*** Begin Patch\n*** Add File: docs/guide.md\n+# doc\n*** Add File: src/app.ts\n+code\n*** End Patch" },
    });
    const result = evaluateHook(stdin, ["started"], {});
    expect(result.exitCode).toBe(2);
  });

  it("apply_patch 无 Add/Update/Delete File 行 -> exit 0(非文件操作 patch)", () => {
    const stdin = JSON.stringify({
      tool_name: "apply_patch",
      tool_input: { command: "*** Begin Patch\n+纯文本内容无 File 操作\n*** End Patch" },
    });
    const result = evaluateHook(stdin, ["started"], {});
    expect(result.exitCode).toBe(0);
  });

  it("apply_patch worktree 模式下相对路径写源码 -> exit 2(防落主仓)", () => {
    const stdin = JSON.stringify({
      tool_name: "apply_patch",
      tool_input: { command: "*** Begin Patch\n*** Add File: scripts/hello.sh\n+echo hi\n*** End Patch" },
    });
    const result = evaluateHook(stdin, ["applying"], {}, "/project", [], true, ["/project/.worktrees/foo"]);
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain("worktree 绝对路径");
  });

  it("apply_patch worktree 模式下绝对路径写 worktree 内 -> exit 0", () => {
    const stdin = JSON.stringify({
      tool_name: "apply_patch",
      tool_input: { command: "*** Begin Patch\n*** Add File: /project/.worktrees/foo/scripts/hello.sh\n+echo hi\n*** End Patch" },
    });
    const result = evaluateHook(stdin, ["applying"], {}, "/project", [], true, ["/project/.worktrees/foo"]);
    expect(result.exitCode).toBe(0);
  });

  it("apply_patch 调 request_user_input 不清 gate(对照:ASK_TOOLS 检测的是 tool_name)", () => {
    // apply_patch 本身不是问答工具,不应触发 clearPendingGates
    const stdin = JSON.stringify({
      tool_name: "apply_patch",
      tool_input: { command: "*** Begin Patch\n*** Add File: docs/a.md\n+x\n*** End Patch" },
    });
    const result = evaluateHook(stdin, ["started"], {});
    expect(result.exitCode).toBe(0);
  });
});
