#!/usr/bin/env node
import { parseArgs } from "node:util";
import { initCommand } from "./commands/init.js";
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
      const { values } = parseArgs({
        args: restArgs,
        options: {
          scope: { type: "string", default: "global" },
          "skip-claude-md": { type: "boolean", default: false },
        },
        strict: false,
      });
      await initCommand({
        scope: (values.scope as "global" | "project") || "global",
        skipClaudeMd: (values["skip-claude-md"] as boolean) || false,
        projectPath: process.cwd(),
      });
      break;
    }
    case "status": {
      const statusName = restArgs[0];
      const result = await statusCommand(process.cwd(), statusName);
      console.log(result);
      break;
    }
    case "doctor": {
      const useJson = restArgs.includes("--json");
      const result = await doctorCommand(process.cwd());
      console.log(formatDoctorResult(result, useJson));
      break;
    }
    case "update": {
      const results = await updateCommand(process.cwd());
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
