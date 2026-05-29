# init 安装复用——预检逻辑统一

> **目标读者：** 人类开发者
> **状态：** 已确认

## 目标

将 `health.ts` 中 OpenSpec 和 Superpowers 的检测逻辑提取为可导出函数，供 `openspec.ts` 和 `superpowers.ts` 的安装函数调用。`alloy init` 在安装前先检测：已安装且版本兼容 → 跳过安装，复用已有。

---

## 一、改动概览

```
src/core/
  health.ts         → 提取导出 checkOpenSpec() / checkSuperpowers()
  openspec.ts       → installOpenSpecCli() 调用 checkOpenSpec() 决定安装/跳过
  superpowers.ts    → installSuperpowers() 调用 checkSuperpowers() 决定安装/跳过
```

---

## 二、health.ts 提取两个导出函数

### checkOpenSpec

```typescript
export interface DepCheckResult {
  installed: boolean;
  version?: string;
  compatible: boolean;
}

export function checkOpenSpec(requiredRange: string): DepCheckResult {
  try {
    const version = execSync("openspec --version", { stdio: "pipe" })
      .toString()
      .trim();
    return {
      installed: true,
      version,
      compatible: semver.satisfies(version, requiredRange),
    };
  } catch {
    return { installed: false, compatible: false };
  }
}
```

### checkSuperpowers

优先检查 Claude 插件（`~/.claude/plugins/installed_plugins.json`），fallback 到 `npx skills list`：

```typescript
export function checkSuperpowers(requiredRange: string): DepCheckResult {
  // 1. 检查 Claude 插件
  try {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    const pluginsJsonPath = join(home, ".claude", "plugins", "installed_plugins.json");
    const pluginsRaw = readFileSync(pluginsJsonPath, "utf-8");
    const plugins = JSON.parse(pluginsRaw);
    const sp = plugins?.plugins?.["superpowers@claude-plugins-official"];
    if (sp && sp.length > 0) {
      return {
        installed: true,
        version: sp[0].version,
        compatible: semver.satisfies(sp[0].version, requiredRange),
      };
    }
  } catch {
    // fallback 到 npx skills list
  }

  // 2. fallback: npx skills list
  try {
    const output = execSync("npx skills list", { stdio: "pipe" }).toString();
    if (output.includes("brainstorming") && output.includes("using-git-worktrees")) {
      return { installed: true, compatible: true };
    }
  } catch {
    // 未安装
  }

  return { installed: false, compatible: false };
}
```

`runHealthCheck()` 内部调用上述两个函数构建 `HealthCheckResult`，逻辑不变。

---

## 三、openspec.ts 安装前检测

```typescript
import { checkOpenSpec } from "./health.js";
import { loadCompat } from "./compat.js";

export async function installOpenSpecCli(): Promise<"installed" | "skipped" | "failed"> {
  const packageDir = getPackageRoot();
  const config = await loadCompat(packageDir);
  const dep = checkOpenSpec(config.compatible.openspec);

  if (dep.installed && dep.compatible) {
    console.log(`     ✓ OpenSpec CLI ${dep.version} 已安装，跳过`);
    return "skipped";
  }

  if (dep.installed && !dep.compatible) {
    console.log(`     ⚠ OpenSpec ${dep.version} 不满足要求 ${config.compatible.openspec}，重新安装...`);
  }

  // 执行 npm install
  try {
    execSync("npm install -g @fission-ai/openspec@1", { stdio: "pipe" });
    return "installed";
  } catch {
    return "failed";
  }
}
```

`getPackageRoot()` 从 `../utils/fs.js` 引入（init.ts 已有）。

---

## 四、superpowers.ts 安装前检测

```typescript
import { checkSuperpowers } from "./health.js";
import { loadCompat } from "./compat.js";
import { getPackageRoot } from "../utils/fs.js";

export async function installSuperpowers(
  scope: "global" | "project"
): Promise<"installed" | "skipped" | "failed"> {
  const packageDir = getPackageRoot();
  const config = await loadCompat(packageDir);
  const dep = checkSuperpowers(config.compatible.superpowers);

  if (dep.installed && dep.compatible) {
    const versionInfo = dep.version ? ` v${dep.version}` : "";
    console.log(`     ✓ Superpowers${versionInfo} 已安装，跳过`);
    return "skipped";
  }

  if (dep.installed && !dep.compatible) {
    console.log(`     ⚠ Superpowers${dep.version ? " v" + dep.version : ""} 不满足要求，重新安装...`);
  }

  // 执行 npx skills add
  try {
    const scopeFlag = scope === "global" ? "-g" : "";
    const flags = ["-y", scopeFlag, "--agent claude-code"].filter(Boolean).join(" ");
    execSync(`npx skills add obra/superpowers ${flags}`, { stdio: "pipe" });
    return "installed";
  } catch {
    return "failed";
  }
}
```

---

## 五、不变的部分

- `runHealthCheck()` 对外接口不变
- `init.ts` 调用 `installOpenSpecCli()` / `installSuperpowers()` 的方式不变
- `compat.yaml` 不变
- `DepCheckResult` 类型放 `types.ts`

---

## 六、测试

- `test/core/health.test.ts` — 新增 `checkOpenSpec` 和 `checkSuperpowers` 的单元测试
- init 安装流程的跳过逻辑通过 mock `checkOpenSpec`/`checkSuperpowers` 测试
