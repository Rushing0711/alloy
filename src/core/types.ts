export interface DeployOptions {
  scope: "global" | "project";
  injectClaudeMd: boolean;
  projectPath: string;
}

export interface EnvInfo {
  nodeVersion: string;
  gitInstalled: boolean;
  claudeCodeInstalled: boolean;
}

export interface CompatConfig {
  compatible: { openspec: string; superpowers: string };
  install: { openspec: string; superpowers: string };
}

export interface CompatResult {
  name: string;
  current: string;
  required: string;
  compatible: boolean;
}

export interface AlloyState {
  phase: "started" | "planned" | "applied" | "archived" | "finished";
  worktree: string | null;
  schema_version: number;
  created_at: string;
  updated_at: string;
}
