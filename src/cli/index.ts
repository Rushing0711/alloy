#!/usr/bin/env node
import { parseArgs } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { statusCommand } from "./commands/status.js";
import { doctorCommand, formatDoctorResult } from "./commands/doctor.js";
import { updateCommand } from "./commands/update.js";
import { generateCompletion } from "./commands/completion.js";
import { stateCommand } from "./commands/internal/state.js";
import { configCommand } from "./commands/internal/config.js";
import { guardCommand } from "./commands/internal/guard.js";

import { recordCommand } from "./commands/internal/record.js";

const USAGE = `
alloy <command> [options]

Commands:
  init        [path] [--scope <project|global>] [--inject-claude-md]
              项目初始化：检测环境 → 安装依赖 → 部署 schema + skill
  status      [path|name] [--json]
              查看活跃 change 总览，指定 name 查看详情
  doctor      [path] [--json]
              诊断：版本兼容性、文件一致性
  update      [path]
              从 alloy 包重新部署 skill + schema
  completion  [bash|zsh|pwsh|powershell] [--install]
              生成 shell 补全脚本，--install 自动注册

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
  --inject-claude-md        注入 CLAUDE.md 工作流标记（默认关闭）
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

自动检测 scope（project/global），从 alloy 包重新部署 skill + schema。
用户模式下会检查 npm registry 是否有新版本。

选项:
  --help, -h    显示本帮助
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
    default:
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
          "inject-claude-md": { type: "boolean", default: false },
        },
        strict: true,
        allowPositionals: true,
      });
      const projectPath = positionals[0] ?? process.cwd();
      const { initCommand, selectScope, selectTargetAgents } = await import("./commands/init.js");
      const scope = await selectScope(values.scope as string | undefined);
      const targetAgents = await selectTargetAgents();
      await initCommand({
        scope,
        injectClaudeMd: (values["inject-claude-md"] as boolean) || false,
        projectPath,
        targetAgents,
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

      const result = await statusCommand(projectPath, changeName);
      if (useJson) {
        console.log(JSON.stringify({ output: result }, null, 2));
      } else {
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
      const { positionals } = parseArgs({
        args: restArgs,
        options: {},
        strict: true,
        allowPositionals: true,
      });
      const results = await updateCommand(
        positionals[0] ?? process.cwd()
      );
      for (const r of results) console.log(`  ${r}`);
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
      console.log("  alloy completion --install              # 自动安装（推荐，支持 bash/zsh/PowerShell）");
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

    case "_record": {
      await recordCommand(restArgs);
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
