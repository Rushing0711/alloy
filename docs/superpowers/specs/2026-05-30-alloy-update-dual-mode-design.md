# alloy update 双模式设计

> **目标读者：** 人类开发者
> **状态：** 已确认

## 目标

`alloy update` 支持两个场景：
- **开发模式**（npm link）：从本地构建直接重新部署 skill+schema
- **用户模式**（npm 安装）：检测新版本、兼容性检查、确认后升级 CLI + 重新部署

---

## 一、模式检测

```typescript
function isDevMode(): boolean {
  // npm link 的包，包根目录是 symlink
  const pkgRoot = getPackageRoot();
  try {
    return lstatSync(pkgRoot).isSymbolicLink();
  } catch {
    return false;
  }
}
```

`getPackageRoot()` 返回 `dist/../..`，即 alloy 包根目录。`npm link` 后这个目录是一个 symlink 指向源码仓库。

---

## 二、流程图

```
alloy update [path] [--scope <project|global>]
  │
  ├─ isDevMode()?
  │   YES → "开发模式，从本地构建重新部署"
  │         → deploySkills() + deploySchema()
  │         → 完成
  │
  └─ NO（用户模式）
      │
      ├─ npm view @alloy/cli version → 获取最新版本
      │
      ├─ 已是最新？
      │   YES → "✓ Alloy vX.X.X 已是最新"
      │         → deploySkills() + deploySchema()
      │         → 完成
      │
      └─ 有更新
          ├─ 显示版本差异（当前 → 最新）
          ├─ runHealthCheck() 预览兼容性
          ├─ 询问 "是否升级? [y/N]"
          │
          ├─ y → "npm update -g @alloy/cli"
          │       → deploySkills() + deploySchema()
          │
          └─ N → "跳过升级，仅重新部署 skill+schema"
                  → deploySkills() + deploySchema()
```

---

## 三、update.ts 改动

```typescript
import { lstatSync } from "node:fs";
import { execSync } from "node:child_process";
import { deploySkills, deploySchema } from "../../core/skills.js";
import { runHealthCheck } from "../../core/health.js";
import { getPackageRoot } from "../../utils/fs.js";

function isDevMode(): boolean {
  try {
    return lstatSync(getPackageRoot()).isSymbolicLink();
  } catch {
    return false;
  }
}

async function checkLatestVersion(): Promise<string | null> {
  try {
    return execSync("npm view @alloy/cli version", { stdio: "pipe" })
      .toString().trim();
  } catch {
    return null; // npm registry 不可达
  }
}

export async function updateCommand(
  projectPath: string,
  scope: "global" | "project" = "project"
): Promise<string[]> {
  const results: string[] = [];
  const deployOpts: DeployOptions = { scope, injectClaudeMd: false, projectPath };

  const dev = isDevMode();

  if (dev) {
    console.log("  🔧 开发模式，从本地构建重新部署…");
  } else {
    // 检查最新版本
    const currentVersion = JSON.parse(
      readFileSync(join(getPackageRoot(), "package.json"), "utf-8")
    ).version;
    const latest = await checkLatestVersion();

    if (latest && latest !== currentVersion) {
      console.log(`\n  发现新版本: v${latest}（当前 v${currentVersion}）`);

      // 兼容性检查
      console.log("  🩺 兼容性检查…");
      const health = await runHealthCheck(getPackageRoot(), projectPath);
      // 只显示 warning/fail
      const warnings = health.filter(h => h.status !== "pass");
      for (const w of warnings) {
        console.log(`     ⚠ ${w.name}: ${w.current}`);
      }

      // 询问确认
      const { confirm } = await import("@inquirer/prompts");
      const answer = await confirm({
        message: "是否升级 alloy？",
        default: false,
      });

      if (answer) {
        try {
          execSync("npm update -g @alloy/cli", { stdio: "pipe" });
          results.push("✓ alloy CLI 已升级到 v" + latest);
        } catch {
          results.push("⚠️ CLI 升级失败");
        }
      } else {
        results.push("  已跳过 CLI 升级");
      }
    } else {
      results.push(`✓ Alloy v${currentVersion} 已是最新`);
    }
  }

  // 始终重新部署 skill + schema
  try {
    const paths = await deploySkills(deployOpts);
    results.push(`✓ skills/ → 部署 ${paths.length} 个 skill`);
  } catch {
    results.push("⚠️ skill 部署失败");
  }
  try {
    await deploySchema(deployOpts);
    results.push("✓ schema/ → 已部署");
  } catch {
    results.push("⚠️ schema 部署失败");
  }

  // 更新 CLAUDE.md 标记区域
  // … 保持现有逻辑 …

  return results;
}
```

---

## 四、不变的部分

- `alloy init` 不受影响
- `deploySkills()` / `deploySchema()` 接口不变
- `compat.yaml` 不变

---

## 五、测试

- `test/cli/update.test.ts` — mock isDevMode / checkLatestVersion / @inquirer/prompts
- 开发模式路径：跳过检测，直接部署
- 用户模式路径：已最新 / 有更新-确认 / 有更新-拒绝 / registry 不可达
