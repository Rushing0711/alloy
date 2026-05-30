export interface AgentInfo {
  id: string;
  label: string;
  supportsColonCommands: boolean;
  commandsDir: string;
  globalOnly?: boolean;
}

export interface DeployOptions {
  scope: "global" | "project";
  injectClaudeMd: boolean;
  projectPath: string;
  targetAgents: AgentInfo[];
}

export interface EnvInfo {
  nodeVersion: string;
  gitInstalled: boolean;
}

export interface CompatConfig {
  compatible: { node: string; openspec: string; superpowers: string; alloy: string; schema: number };
  install: { openspec: string; superpowers: string };
}

/** @deprecated 使用 HealthCheckResult 替代 */
export interface CompatResult {
  name: string;
  current: string;
  required: string;
  compatible: boolean;
}

export interface HealthCheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  current: string;
  required: string;
  message?: string;
}

export interface DepCheckResult {
  installed: boolean;
  version?: string;
  compatible: boolean;
}

export interface AlloyState {
  phase: "started" | "planned" | "applied" | "archived" | "finished";
  worktree: string | null;
  schema_version: number;
  created_at: string;
  updated_at: string;
}
