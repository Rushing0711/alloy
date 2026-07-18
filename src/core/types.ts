export type AgentId = "claude-code" | "opencode" | "pi";

export interface AgentInfo {
  id: AgentId;
  label: string;
  supportsColonCommands: boolean;
  commandsDir: string;
  /** 全局级 base 目录(相对 HOME)。不设则用 commandsDir 的第一段。如 opencode 全局是 .config/opencode,非 .opencode */
  globalBase?: string;
  globalOnly?: boolean;
  interactiveTool?: "askuserquestion" | "question" | "alloy-question" | "partial" | "none";
  settingsFile?: string;
  settingsContent?: Record<string, unknown>;
}

export interface DeployOptions {
  scope: "global" | "project";
  projectPath: string;
  targetAgents: AgentInfo[];
  /** 强制覆盖已装产物,跳过覆盖/升级确认(deploySkills/installSuperpowers 内部 promptConfirm 一并跳过) */
  force?: boolean;
}

export interface EnvInfo {
  nodeVersion: string;
  gitVersion: string;
  gitInstalled: boolean;
}

export interface CompatConfig {
  compatible: { node: string; git: string; openspec: string; superpowers: string; alloy: string; schema: number };
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
  phase: "starting" | "started" | "planning" | "planned" | "applying" | "applied" | "archiving" | "archived" | "finishing" | "finished";
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
  pending_gate?: string | null;
}

export interface ProjectConfig {
  schema: "alloy";
  alloy: {
    main_branch?: string;
    /** init 时选择的 scope,update 读取。project | global */
    install_scope?: "project" | "global";
    /** init 时选择的目标 agent id 列表,update 读取 */
    target_agents?: string[];
  };
}
