export interface AgentInfo {
  id: string;
  label: string;
  supportsColonCommands: boolean;
  commandsDir: string;
  globalOnly?: boolean;
  instructionFile: string;
  instructionFormat: "md" | "mdc";
  interactiveTool?: "askuserquestion" | "question" | "partial" | "none";
  settingsFile?: string;
  settingsContent?: Record<string, unknown>;
}

export interface DeployOptions {
  scope: "global" | "project";
  injectDepth: "low" | "medium" | "high";
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

export interface ArtifactRecord {
  artifact: string;
  hash: string;
  committed_at: string;
  approver: string;
}

export interface SkillUsageEntry {
  skill: string;
  stage: string;
  used: boolean;
  count?: number;
  via?: string;
  reason?: string;
  called_at: string;
}

export interface PhaseTiming {
  started_at: string;
  completed_at: string | null;
}

export interface PhaseTimings {
  start?: PhaseTiming;
  plan?: PhaseTiming;
  apply?: PhaseTiming;
  archive?: PhaseTiming;
  finish?: PhaseTiming;
}

export interface AlloyState {
  phase: "started" | "planned" | "applied" | "archived" | "finished";
  worktree: string | null;
  worktree_branch?: string | null;
  worktree_created_at?: string | null;
  worktree_merged_at?: string | null;
  schema_version: number;
  created_at: string;
  started_at?: string;
  updated_at: string;
  completed_at?: string | null;
  phase_timings?: PhaseTimings;
  records: ArtifactRecord[];
  skill_usage: SkillUsageEntry[];
  feature_branch?: string | null;
}

export interface ProjectConfig {
  schema: "alloy";
  alloy: {
    main_branch?: string;
    inject_depth?: "low" | "medium" | "high";
  };
}
