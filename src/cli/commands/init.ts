import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { detectEnv } from "../../core/detect.js";
import { runHealthCheck } from "../../core/health.js";
import { installOpenSpecCli, initOpenSpecProject } from "../../core/openspec.js";
import { installSuperpowers } from "../../core/superpowers.js";
import { deployCommands, deploySchema } from "../../core/skills.js";
import { injectClaudeMd } from "../../core/claude-md.js";
import { KNOWN_AGENTS } from "../../core/agents.js";
import type { AgentInfo, DeployOptions } from "../../core/types.js";
import { getPackageRoot } from "../../utils/fs.js";
import { promptSelect, promptMultiSelect } from "../../utils/prompt.js";

export async function selectScope(passedScope?: string): Promise<"global" | "project"> {
  if (passedScope) return passedScope as "global" | "project";

  return promptSelect("Install scope:", [
    { name: "Project (current directory)", value: "project" },
    { name: "Global (home directory)", value: "global" },
  ]) as Promise<"global" | "project">;
}

export async function selectTargetAgents(): Promise<AgentInfo[]> {
  const choices = KNOWN_AGENTS.map((a) => ({ name: a.label, value: a.id }));
  const ids = await promptMultiSelect(
    "请选择要安装的 AI 工具（可多选，至少选一项）：",
    choices,
    {
      validate: (ids: string[]) =>
        ids.length > 0 ? true : "请至少选择一个 AI 工具",
    }
  );
  return KNOWN_AGENTS.filter((a) => ids.includes(a.id));
}

export interface InitOptions extends DeployOptions {}

const GITIGNORE_RULES = ["docs/superpowers/", ".worktrees/", "worktrees/", "*.local.*", ".superpowers/"];

async function ensureGitignore(projectPath: string): Promise<void> {
  const gitignorePath = join(projectPath, ".gitignore");
  let content = "";
  try {
    content = await readFile(gitignorePath, "utf-8");
    if (!content.endsWith("\n")) content += "\n";
  } catch {
    // 文件不存在，稍后创建
  }

  const missing = GITIGNORE_RULES.filter((rule) => !content.includes(rule));
  if (missing.length === 0) return;

  const block = `\n### Alloy + Superpowers 运行时 ###\n${missing.join("\n")}\n`;
  await writeFile(gitignorePath, content + block, "utf-8");
  console.log(`     ✓ .gitignore → 已追加 ${missing.length} 条规则`);
}

export async function initCommand(opts: InitOptions): Promise<void> {
  console.log("\n  🔍 检测环境...");

  // 1. 环境检测
  const env = detectEnv();
  console.log(`     Node.js ${env.nodeVersion} ✓`);
  console.log(`     git ${env.gitInstalled ? "✓" : "✗ 未安装"}`);
  console.log(`     Claude Code ${env.claudeCodeInstalled ? "✓" : "⚠ 未检测到 CLI，请确保已安装"}`);

  if (!env.gitInstalled) {
    console.error("\n  ❌ 缺少必要依赖，请先安装 git");
    process.exit(1);
  }

  // 2. 安装 OpenSpec CLI（npm 全局包）
  console.log("\n  📥 OpenSpec CLI...");
  const openspecResult = await installOpenSpecCli();
  if (openspecResult === "installed") {
    console.log("     ✓ @fission-ai/openspec@1 已安装");
  } else if (openspecResult === "failed") {
    console.error("     ✗ OpenSpec CLI 安装失败");
    process.exit(1);
  }
  // "skipped" — 函数内部已输出跳过信息

  // 3. 初始化 OpenSpec 项目结构（openspec/ 目录 + .claude/commands/opsx/）
  console.log("\n  📂 初始化 OpenSpec 项目结构...");
  const initResult = await initOpenSpecProject(opts.projectPath, opts.scope);
  if (initResult === "failed") {
    console.error("     ✗ OpenSpec 项目初始化失败");
    process.exit(1);
  }

  // 4. 安装 Superpowers
  console.log("\n  📥 Superpowers...");
  const superpowersResult = await installSuperpowers(opts.scope);
  if (superpowersResult === "installed") {
    console.log("     ✓ obra/superpowers@5 已安装");
  } else if (superpowersResult === "skipped") {
    console.log("     ✓ Superpowers 已安装，跳过");
  } else {
    console.log("     ⚠ Superpowers 安装失败，请稍后手动运行 alloy init 重试");
  }

  // 5. 部署 Alloy commands
  console.log("\n  🚀 部署 Alloy commands...");
  if (opts.targetAgents.length === 0) {
    console.log("     ⚠ 未选择任何 AI 工具，跳过 command 部署");
  } else {
    try {
      const paths = await deployCommands(opts);
      for (const p of paths) {
        console.log(`     ✓ ${p}`);
      }
    } catch (e) {
      console.error(`     ✗ command 部署失败: ${(e as Error).message}`);
      process.exit(1);
    }
  }
  const schemaPath = await deploySchema(opts);
  console.log(`     ✓ 项目 schema → ${schemaPath}`);

  // 6. 确保 .gitignore 包含 Alloy 运行时目录
  await ensureGitignore(opts.projectPath);

  // 7. 注入 CLAUDE.md
  const injected = await injectClaudeMd(opts);
  if (injected) {
    console.log("     ✓ CLAUDE.md → 已追加 Alloy 工作流提示");
  }

  // 8. 兼容性检查
  console.log("\n  🩺 兼容性检查...");
  const packageDir = getPackageRoot();
  const results = await runHealthCheck(packageDir, opts.projectPath, opts.scope);
  for (const r of results) {
    const mark = r.status === "pass" ? "✓" : r.status === "warn" ? "⚠️" : "✗";
    console.log(
      `     ${mark} ${r.name} ${r.current}（要求 ${r.required}）`
    );
  }

  // 9. 自动注册 shell 补全（失败不阻断 init）
  console.log("\n  🐚 注册 shell 补全...");
  try {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    const shell = process.env.SHELL || "";
    let completionLine = "source <(alloy completion bash)";
    let rcFile: string | null = null;

    if (shell.includes("zsh")) {
      rcFile = join(home, ".zshrc");
      completionLine = "source <(alloy completion zsh)";
    } else if (shell.includes("bash")) {
      rcFile = join(home, ".bashrc");
      completionLine = "source <(alloy completion bash)";
    }

    if (rcFile) {
      let rcContent = "";
      try {
        rcContent = await readFile(rcFile, "utf-8");
      } catch {
        // 文件不存在，稍后创建
      }
      if (!rcContent.includes("alloy completion")) {
        const block = [
          "",
          "# Alloy shell 补全 — Tab 自动补全 alloy 命令",
          completionLine,
          "",
        ].join("\n");
        await writeFile(
          rcFile,
          rcContent.trimEnd() + block,
          "utf-8"
        );
        console.log(`     ✓ shell 补全已注册 → ${rcFile}`);
      } else {
        console.log("     ✓ shell 补全已存在，跳过");
      }
    } else {
      console.log("     ⚠ 未检测到 bash/zsh，跳过补全注册");
    }
  } catch {
    // 注册失败不阻断 init，静默忽略
  }

  // 10. Git 初始提交（仅 project scope）
  if (opts.scope === "project") {
    console.log("\n  📝 Git 初始提交...");
    try {
      const gitDir = join(opts.projectPath, ".git");
      try {
        execSync("git rev-parse --git-dir", {
          cwd: opts.projectPath,
          stdio: "pipe",
        });
      } catch {
        execSync("git init", { cwd: opts.projectPath, stdio: "pipe" });
        console.log("     ✓ git init");
      }

      const addPaths = [
        ".claude/",
        ".gitignore",
        "openspec/config.yaml",
        "openspec/schemas/",
      ];
      if (injected) addPaths.push("CLAUDE.md");

      execSync(`git add -- ${addPaths.join(" ")}`, {
        cwd: opts.projectPath,
        stdio: "pipe",
      });

      // 有变更才 commit
      try {
        execSync("git diff --cached --quiet", {
          cwd: opts.projectPath,
          stdio: "pipe",
        });
      } catch {
        execSync(
          'git commit -m "chore: alloy init 项目初始化"',
          { cwd: opts.projectPath, stdio: "pipe" },
        );
        console.log("     ✓ 初始提交完成");
      }
    } catch {
      console.log("     ⚠ git 提交失败，请手动提交");
    }
  }

  console.log("\n  ✅ Alloy 就绪！");
  console.log("     在 Claude Code 中输入 /alloy:start <topic> 开始工作\n");
}
