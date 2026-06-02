// src/cli/commands/internal/config.ts
import { readProjectConfig, writeProjectConfig } from "../../utils/state.js";

export async function configCommand(args: string[]): Promise<void> {
  const action = args[0];
  const projectRoot = args[1];
  const field = args[2];
  const value = args[3];

  if (!action || !projectRoot) {
    console.error("用法: alloy _config <read|write> <project-root> [field] [value]");
    process.exit(1);
  }

  switch (action) {
    case "read": {
      if (!field) {
        console.error("用法: alloy _config read <project-root> <field>");
        process.exit(1);
      }
      const config = await readProjectConfig(projectRoot);
      const val = (config.alloy as Record<string, unknown>)?.[field];
      if (val === undefined || val === null) {
        console.log("null");
      } else {
        console.log(String(val));
      }
      break;
    }
    case "write": {
      if (!field || value === undefined) {
        console.error("用法: alloy _config write <project-root> <field> <value>");
        process.exit(1);
      }
      const config = await readProjectConfig(projectRoot);
      if (!config.alloy) config.alloy = {};
      (config.alloy as Record<string, unknown>)[field] = value;
      await writeProjectConfig(projectRoot, config);
      break;
    }
    default:
      console.error(`未知操作: ${action} (支持: read, write)`);
      process.exit(1);
  }
}
