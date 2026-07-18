#!/usr/bin/env node
import { parseArgs } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { statusCommand, printStatusDetail } from "./commands/status.js";
import { doctorCommand, formatDoctorResult } from "./commands/doctor.js";
import { updateCommand } from "./commands/update.js";
import { generateCompletion } from "./commands/completion.js";
import { stateCommand } from "./commands/internal/state.js";
import { configCommand } from "./commands/internal/config.js";
import { guardCommand } from "./commands/internal/guard.js";

import { recordCommand } from "./commands/internal/record.js";
import { skillUsageCommand } from "./commands/internal/skill-usage.js";
import { progressCommand } from "./commands/internal/progress.js";
import { artifactCommand } from "./commands/internal/artifact.js";
import { specAuditCommand } from "./commands/internal/spec-audit.js";
import { phaseCommand } from "./commands/internal/phase.js";
import { envCheckCommand } from "./commands/internal/env.js";
import { checkpointCommand } from "./commands/internal/checkpoint.js";
import { retroCommand } from "./commands/internal/retro.js";
import type { AgentInfo } from "../core/types.js";

const USAGE = `
alloy <command> [options]

Commands:
  init        [path] [--scope <project|global>] [--agents <id,id,...>] [--force]
              项目初始化：检测环境 → 安装依赖 → 部署 schema + skill
  status      [path|name] [--json]
              查看活跃 change 总览，指定 name 查看详情
  doctor      [path] [--json]
              诊断：版本兼容性、文件一致性
  update      [path] [--force]
              刷新 init 写过的所有产物到当前 alloy 版本
  clean       [path] [--scope <project|global>] [--force]
              清理 init 装的产物(alloy skills/opsx/superpowers/hook/permissions 等)
  completion  [bash|zsh|pwsh|powershell] [--install]
              生成 shell 补全脚本，--install 自动注册

Internal commands (agent 调用,可直接使用):
  _state _skill _guard _phase _verify _artifact _record _config
  _checkpoint _archive _worktree-cleanup _worktree-create _retro _env _progress
  _precheck _infra-commit _pre-commit-check _hook-guard _stop-guard
  _branch _change _start
  详见 skills/alloy-shared/references/cli-reference.md

Options:
  --version, -v  版本号
  --help, -h     帮助（alloy -h 或 alloy <command> -h）
`;

function commandHelp(cmd: string): string {
  switch (cmd) {
    case "init":
      return `
alloy init [path] [options]

选项:
  --scope <project|global>  安装范围，默认 project
  --agents <id,id,...>      非交互式模式，指定要安装的 AI 工具（逗号分隔）
                            可用的 agent: claude-code, opencode, pi
  --force                   强制覆盖已装产物,跳过执行清单确认(breaking change 也直接执行)
  --help, -h                显示本帮助
`;
    case "status":
      return `
alloy status [path|name] [options]

参数:
  path  项目路径（默认当前目录）
  name  change 名称（查看详情）

选项:
  --json    JSON 格式输出
  --help, -h    显示本帮助
`;
    case "doctor":
      return `
alloy doctor [path] [options]

选项:
  --json    JSON 格式输出
  --help, -h    显示本帮助
`;
    case "update":
      return `
alloy update [path] [options]

刷新 init 写过的所有产物到当前 alloy 版本。从 openspec/config.yaml 读 install_scope + target_agents,复用 init 的矩阵展示 + execute 流程。用户模式额外升级 alloy CLI + OpenSpec CLI + Superpowers;开发模式跳过 npm/npx 升级。

选项:
  --force, -f    跳过确认（执行清单 / 升级 alloy CLI），自动化场景使用
  --help, -h     显示本帮助
`;
    case "clean":
      return `
alloy clean [path] [options]

清理 alloy init 装的产物。交互问 scope(project/global),按 scope 清理所有 init 装的产物
(alloy skills / OpenSpec Commands / Superpowers / Shell 补全 / hook / permissions / .gitignore 等)。
展示将删除/修改的清单 + 确认,--force 跳过。只清 alloy 注入的部分,保留用户配置。

选项:
  --scope <project|global>  清理范围,不传则交互式选择
  --force, -f               跳过确认
  --help, -h                显示本帮助
`;
    case "completion":
      return `
alloy completion [shell] [options]

参数:
  shell  目标 shell（bash / zsh / pwsh / powershell，默认从 $SHELL 检测）

选项:
  --install    自动注册到 shell 配置文件（永久生效）
  --help, -h   显示本帮助

行为说明:
  alloy completion <shell>        仅输出补全脚本（不安装）
  alloy completion --install      自动安装到 rc 文件（永久生效，支持 bash/zsh/powershell）
  source <(alloy completion)      临时启用（当前 session）

示例:
  alloy completion --install              # 自动安装（推荐）
  source <(alloy completion zsh)          # 临时启用 zsh 补全
  source <(alloy completion bash)         # 临时启用 bash 补全
`;
    case "_spec-audit":
      return `
alloy _spec-audit [选项]

检测 skill 文件与 spec 文件的 behaviors frontmatter 差异。
对账方向：skill → spec（skill 是真相源）

选项:
  --fix       交互式修复：逐条确认后用 skill 的值更新 spec frontmatter
  --help, -h  显示本帮助

退出码:
  0  全部一致（或 --fix 修复后全部对齐）
  1  存在不一致
`;
    default:
      // internal 命令(_ 前缀)在 main switch 注册但无独立 help 文档
      // 不报"未知命令"--避免 agent 用 --help 探测时误判命令不存在
      if (cmd.startsWith("_")) {
        return `alloy ${cmd}\n\n此命令为 internal 命令,无独立 help 文档。详细用法见 skills/alloy-shared/references/cli-reference.md。\n运行 alloy ${cmd}(不带参数)可看简要用法。`;
      }
      return `未知命令: ${cmd}\n使用 alloy --help 查看可用命令。`;
  }
}

async function installCompletion(shell: string): Promise<void> {
  const home = process.env.HOME || process.env.USERPROFILE || "~";

  let rcFile: string | null = null;
  let completionLine = "";

  if (shell.includes("zsh")) {
    rcFile = join(home, ".zshrc");
    completionLine = "source <(alloy completion zsh)";
  } else if (shell.includes("bash")) {
    rcFile = join(home, ".bashrc");
    completionLine = "source <(alloy completion bash)";
  } else if (shell.includes("pwsh") || shell.includes("powershell")) {
    // PowerShell 补全需要写入 $PROFILE 文件
    const profileDir = join(home, "Documents", "PowerShell");
    rcFile = join(profileDir, "Microsoft.PowerShell_profile.ps1");
    // PowerShell 直接写入补全脚本内容
    completionLine = generateCompletion("pwsh");

    // 确保目录存在
    const { mkdirSync, existsSync } = await import("node:fs");
    if (!existsSync(profileDir)) {
      mkdirSync(profileDir, { recursive: true });
      console.log(`     ✓ 创建目录: ${profileDir}`);
    }
  }

  if (!rcFile) {
    console.error("无法确定 shell 配置文件路径");
    process.exit(1);
  }

  let content = "";
  try {
    content = await readFile(rcFile, "utf-8");
  } catch {
    // 文件不存在
  }

  if (content.includes("alloy completion")) {
    console.log(`✓ shell 补全已存在 → ${rcFile}`);
    return;
  }

  // PowerShell 直接写入补全脚本，bash/zsh 写入 source 命令
  const isPowerShell = shell.includes("pwsh") || shell.includes("powershell");
  const block = isPowerShell
    ? completionLine  // PowerShell: 直接写入补全脚本
    : ["", "# Alloy shell 补全 — Tab 自动补全 alloy 命令", completionLine, ""].join("\n");

  await writeFile(rcFile, content.trimEnd() + block, "utf-8");
  console.log(`✓ shell 补全已注册 → ${rcFile}`);

  if (isPowerShell) {
    console.log(`  运行 '. $PROFILE' 或重启 PowerShell 使其生效`);
  } else {
    console.log(`  运行 'source ${rcFile}' 或重新打开终端使其生效`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  const isHelp = (a: string[]) => a.includes("--help") || a.includes("-h");
  const isVersion = (a: string[]) => a.includes("--version") || a.includes("-v");

  if (args.length === 0 || (args.length === 1 && isHelp(args))) {
    console.log(USAGE);
    process.exit(0);
  }

  if (args.length === 1 && isVersion(args)) {
    try {
      const pkg = JSON.parse(
        readFileSync(
          join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"),
          "utf-8"
        )
      );
      console.log(`alloy v${pkg.version}`);
    } catch {
      console.log("alloy v0.1.0");
    }
    process.exit(0);
  }

  const command = args[0];
  const restArgs = args.slice(1);

  if (isHelp(restArgs)) {
    console.log(commandHelp(command));
    process.exit(0);
  }

  switch (command) {
    case "init": {
      const { values, positionals } = parseArgs({
        args: restArgs,
        options: {
          scope: { type: "string" },
          agents: { type: "string" },
          force: { type: "boolean", default: false },
        },
        strict: true,
        allowPositionals: true,
      });
      const projectPath = positionals[0] ?? process.cwd();
      const { initCommand } = await import("./commands/init/init.js");

      // --agents 非交互式解析:把逗号分隔的 id 转成 AgentInfo[](空则交给 initCommand 交互式选择)
      let targetAgents: AgentInfo[] = [];
      if (values.agents) {
        const { KNOWN_AGENTS } = await import("../core/agents.js");
        const agentIds = (values.agents as string).split(",").map((s: string) => s.trim());
        targetAgents = KNOWN_AGENTS.filter((a: { id: string }) => agentIds.includes(a.id));
        if (targetAgents.length === 0) {
          console.error(`未知的 agent: ${values.agents}`);
          console.error(`可用的 agent: ${KNOWN_AGENTS.map((a: { id: string }) => a.id).join(", ")}`);
          process.exit(1);
        }
      }

      await initCommand({
        scope: values.scope as "global" | "project" | undefined,
        projectPath,
        targetAgents,
        force: values.force as boolean,
      });
      break;
    }
    case "status": {
      const { positionals } = parseArgs({
        args: restArgs,
        options: { json: { type: "boolean", default: false } },
        strict: true,
        allowPositionals: true,
      });
      const useJson = restArgs.includes("--json");

      let projectPath: string;
      let changeName: string | undefined;

      if (positionals.length === 1 && !existsSync(positionals[0])) {
        // 单个参数且非路径 → 视为 change name
        projectPath = process.cwd();
        changeName = positionals[0];
      } else {
        projectPath = positionals[0] ?? process.cwd();
        changeName = positionals[1];
      }

      if (useJson) {
        const result = await statusCommand(projectPath, changeName);
        console.log(JSON.stringify({ output: result }, null, 2));
      } else if (changeName) {
        await printStatusDetail(projectPath, changeName);
      } else {
        const result = await statusCommand(projectPath);
        console.log(result);
      }
      break;
    }
    case "doctor": {
      const { positionals } = parseArgs({
        args: restArgs,
        options: { json: { type: "boolean", default: false } },
        strict: true,
        allowPositionals: true,
      });
      const useJson = restArgs.includes("--json");
      const result = await doctorCommand(positionals[0] ?? process.cwd());
      console.log(formatDoctorResult(result, useJson));
      break;
    }
    case "update": {
      const { values, positionals } = parseArgs({
        args: restArgs,
        options: {
          force: { type: "boolean", default: false },
        },
        short: {
          f: "force",
        },
        strict: true,
        allowPositionals: true,
      });
      const results = await updateCommand(
        positionals[0] ?? process.cwd(),
        values.force
      );
      for (const r of results) console.log(`  ${r}`);
      break;
    }
    case "clean": {
      const { values, positionals } = parseArgs({
        args: restArgs,
        options: {
          scope: { type: "string" },
          force: { type: "boolean", default: false },
        },
        short: {
          f: "force",
        },
        strict: true,
        allowPositionals: true,
      });
      const { cleanCommand } = await import("./commands/clean.js");
      await cleanCommand({
        projectPath: positionals[0] ?? process.cwd(),
        scope: values.scope as "global" | "project" | undefined,
        force: values.force as boolean,
      });
      break;
    }
    case "completion": {
      const { values, positionals } = parseArgs({
        args: restArgs,
        options: {
          install: { type: "boolean", default: false },
        },
        strict: true,
        allowPositionals: true,
      });

      if (values.install) {
        const shell = positionals[0] ?? process.env.SHELL ?? "bash";
        await installCompletion(shell);
        break;
      }

      // 指定了 shell → 输出补全脚本（用于管道/重定向）
      if (positionals[0]) {
        console.log(generateCompletion(positionals[0]));
        break;
      }

      // 无参数 → 显示友好使用说明
      console.log("生成 shell 补全脚本，获取 Tab 自动补全能力。\n");
      console.log("用法：");
      console.log("  alloy completion --install              # 自动安装（推荐，支持 bash/zsh/powershell）");
      console.log("  source <(alloy completion zsh)          # 临时启用 zsh 补全");
      console.log("  source <(alloy completion bash)         # 临时启用 bash 补全");
      break;
    }
    case "_state": {
      await stateCommand(restArgs);
      break;
    }
    case "_config": {
      await configCommand(restArgs);
      break;
    }
    case "_guard": {
      await guardCommand(restArgs);
      break;
    }

    case "_skill": {
      await skillUsageCommand(restArgs);
      break;
    }
    case "_record": {
      await recordCommand(restArgs);
      break;
    }
    case "_progress": {
      await progressCommand(restArgs);
      break;
    }
    case "_artifact": {
      await artifactCommand(restArgs);
      break;
    }
    case "_spec-audit": {
      await specAuditCommand(restArgs);
      break;
    }
    case "_phase": {
      await phaseCommand(restArgs);
      break;
    }
    case "_env": {
      const sub = restArgs[0];
      if (sub === "check") {
        await envCheckCommand();
      } else {
        console.error("用法: alloy _env check");
        process.exit(1);
      }
      break;
    }
    case "_checkpoint": {
      await checkpointCommand(restArgs);
      break;
    }
    case "_retro": {
      await retroCommand(restArgs);
      break;
    }
    case "_archive": {
      const { archiveCommand } = await import("./commands/internal/archive.js");
      await archiveCommand(restArgs);
      break;
    }
    case "_worktree-cleanup": {
      const { worktreeCleanupCommand } = await import("./commands/internal/worktree-cleanup.js");
      await worktreeCleanupCommand(restArgs);
      break;
    }
    case "_worktree-create": {
      const { worktreeCreateCommand } = await import("./commands/internal/worktree-create.js");
      await worktreeCreateCommand(restArgs);
      break;
    }
    case "_verify": {
      const { verifyCommand } = await import("./commands/internal/verify.js");
      await verifyCommand(restArgs);
      break;
    }
    case "_hook-guard": {
      const { hookGuardCommand } = await import("./commands/internal/hook-guard.js");
      await hookGuardCommand(restArgs);
      break;
    }
    case "_pre-commit-check": {
      const { preCommitCheckCommand } = await import("./commands/internal/pre-commit-check.js");
      await preCommitCheckCommand(restArgs);
      break;
    }
    case "_stop-guard": {
      const { stopGuardCommand } = await import("./commands/internal/stop-guard.js");
      await stopGuardCommand(restArgs);
      break;
    }
    case "_precheck": {
      const { precheckCommand } = await import("./commands/internal/precheck.js");
      await precheckCommand(restArgs);
      break;
    }
    case "_infra-commit": {
      const { infraCommitCommand } = await import("./commands/internal/infra-commit.js");
      await infraCommitCommand(restArgs);
      break;
    }
    case "_branch": {
      const { branchCommand } = await import("./commands/internal/branch.js");
      await branchCommand(restArgs);
      break;
    }
    case "_change": {
      const { changeCommand } = await import("./commands/internal/change.js");
      await changeCommand(restArgs);
      break;
    }
    case "_start": {
      const { startCommand } = await import("./commands/internal/start.js");
      await startCommand(restArgs);
      break;
    }
    default:
      console.error(`未知命令: ${command}`);
      console.log(USAGE);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
