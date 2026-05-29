#!/usr/bin/env node
import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { select } from "@inquirer/prompts";
import { initCommand, selectScope } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import { doctorCommand, formatDoctorResult } from "./commands/doctor.js";
import { updateCommand } from "./commands/update.js";

const USAGE = `
alloy <command> [options]

Commands:
  init    项目初始化：检测环境 → 安装依赖 → 部署 schema + skill
  status  查看所有活跃 change 总览
  doctor  诊断：版本兼容性、文件一致性
  update  更新 Alloy skill 文件到最新版

Options:
  --version  版本号
  --help     帮助
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log(USAGE);
    process.exit(0);
  }

  if (args.includes("--version")) {
    try {
      const pkg = await import("../../package.json", {
        with: { type: "json" },
      });
      console.log(`alloy v${pkg.default.version}`);
    } catch {
      console.log("alloy v0.1.0");
    }
    process.exit(0);
  }

  const command = args[0];
  const restArgs = args.slice(1);

  switch (command) {
    case "init": {
      const { values, positionals } = parseArgs({
        args: restArgs,
        options: {
          scope: { type: "string" },
          "inject-claude-md": { type: "boolean", default: false },
        },
        strict: false,
        allowPositionals: true,
      });
      const projectPath = positionals[0] ?? process.cwd();
      const scope = await selectScope(values.scope as string | undefined);
      await initCommand({
        scope,
        injectClaudeMd: (values["inject-claude-md"] as boolean) || false,
        projectPath,
      });
      break;
    }
    case "status": {
      const { positionals } = parseArgs({
        args: restArgs,
        options: { json: { type: "boolean", default: false } },
        strict: false,
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
        strict: false,
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
        strict: false,
        allowPositionals: true,
      });
      const results = await updateCommand(positionals[0] ?? process.cwd());
      for (const r of results) console.log(`  ${r}`);
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
