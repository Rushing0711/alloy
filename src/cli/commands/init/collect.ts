import { execSync } from "node:child_process";
import { resolve, relative, isAbsolute } from "node:path";
import { homedir } from "node:os";
import semver from "semver";
import { detectEnv } from "../../../core/detect.js";
import { loadCompat } from "../../../core/compat.js";
import { checkOpenSpec } from "../../../core/health.js";
import { readProjectConfig } from "../../utils/state.js";
import { isHeadUnborn } from "../../../core/git.js";
import { getPackageRoot } from "../../../utils/fs.js";

export interface CollectResult {
  env: {
    nodeVersion: string;
    nodeOk: boolean;
    gitVersion: string;
    gitOk: boolean;
  };
  dirRejected: boolean;
  git: {
    exists: boolean;
    headUnborn: boolean;
    existingMainBranch?: string;
  };
  openSpecCli: {
    installed: boolean;
    version: string | null;
    needsUpgrade: boolean;
  };
}

/** 检测当前目录是否被拒绝($HOME 或 $HOME 下隐藏目录) */
function isDirRejected(projectPath: string): boolean {
  const resolved = resolve(projectPath);
  const home = resolve(homedir());
  const rel = relative(home, resolved);
  if (rel === "") return true;
  if (rel.startsWith("..") || isAbsolute(rel)) return false;
  return rel.startsWith(".");
}

/** 检测 git 仓库状态 */
function detectGitStatus(projectPath: string): { exists: boolean; headUnborn: boolean } {
  let exists = false;
  try {
    execSync("git rev-parse --git-dir", { cwd: projectPath, stdio: "pipe" });
    exists = true;
  } catch {
    exists = false;
  }
  const headUnborn = exists ? isHeadUnborn(projectPath) : true;
  return { exists, headUnborn };
}

/** 读取已有 main_branch(从 openspec/config.yaml) */
async function readExistingMainBranch(projectPath: string): Promise<string | undefined> {
  const config = await readProjectConfig(projectPath);
  const alloyConfig = config.alloy as Record<string, unknown> | undefined;
  return alloyConfig?.main_branch as string | undefined;
}

export async function collect(projectPath: string): Promise<CollectResult> {
  const env = detectEnv();
  const compat = await loadCompat(getPackageRoot());

  const nodeOk = semver.satisfies(env.nodeVersion, compat.compatible.node);
  const gitOk = env.gitInstalled && semver.satisfies(env.gitVersion, compat.compatible.git);

  const dirRejected = isDirRejected(projectPath);

  const gitStatus = detectGitStatus(projectPath);
  const existingMainBranch = await readExistingMainBranch(projectPath);

  const openspecCheck = checkOpenSpec(compat.compatible.openspec);
  const openSpecCli = {
    installed: openspecCheck.installed,
    version: openspecCheck.version ?? null,
    needsUpgrade: openspecCheck.installed && !openspecCheck.compatible,
  };

  return {
    env: {
      nodeVersion: env.nodeVersion,
      nodeOk,
      gitVersion: env.gitVersion,
      gitOk,
    },
    dirRejected,
    git: {
      exists: gitStatus.exists,
      headUnborn: gitStatus.headUnborn,
      existingMainBranch,
    },
    openSpecCli,
  };
}

/**
 * update 用的轻量采集:只测 OpenSpec CLI 状态 + git 状态。
 * env/dirRejected 用默认值(update 不关心这些,init 已校验过环境)。
 */
export async function collectForUpdate(projectPath: string): Promise<CollectResult> {
  const compat = await loadCompat(getPackageRoot());

  const gitStatus = detectGitStatus(projectPath);
  const existingMainBranch = await readExistingMainBranch(projectPath);

  const openspecCheck = checkOpenSpec(compat.compatible.openspec);
  const openSpecCli = {
    installed: openspecCheck.installed,
    version: openspecCheck.version ?? null,
    needsUpgrade: openspecCheck.installed && !openspecCheck.compatible,
  };

  return {
    env: {
      nodeVersion: "",
      nodeOk: true,
      gitVersion: "",
      gitOk: true,
    },
    dirRejected: false,
    git: {
      exists: gitStatus.exists,
      headUnborn: gitStatus.headUnborn,
      existingMainBranch,
    },
    openSpecCli,
  };
}
