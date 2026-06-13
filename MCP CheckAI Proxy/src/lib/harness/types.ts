// ============================================================================
// Harness core types
//
// These types define the contract between the harness and everything it
// governs. The four pillars (guardrails, checkpoints, material, alarms) and
// the swappable worker (AgentAdapter) all speak in terms declared here. None
// of these types import the agent — the harness depends on interfaces, never
// on a concrete worker.
// ============================================================================

import type { UefDocument } from "@/lib/uef";

export type Severity = "info" | "warning" | "critical";

/** JSON-serializable value (server functions reject `unknown`). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// ── Material ────────────────────────────────────────────────────────────────
// The clean interface for passing work in and out of the harness.

export type MaterialFile = {
  id: string;
  name: string;
  category: string;
  content: string;
};

/** Work passed INTO the harness. */
export type MaterialIn = {
  files: MaterialFile[];
  /** Total character count of all file contents — used by size guardrails. */
  totalChars: number;
  summary: string;
};

/** Work emitted OUT of the harness after a governed run. */
export type MaterialOut = {
  doc: UefDocument;
  /** Model self-reported / derived confidence, 0..1. */
  confidence: number;
  recordCount: number;
};

// ── Guardrails ───────────────────────────────────────────────────────────────
// Declared constraints that constrain agent behavior. Declared, not implicit.

export type GuardrailPhase = "pre" | "post";

export type GuardrailContext = {
  phase: GuardrailPhase;
  material: MaterialIn;
  /** Only present in the "post" phase, after the agent has produced output. */
  output?: MaterialOut;
};

export type GuardrailResult = {
  id: string;
  description: string;
  phase: GuardrailPhase;
  severity: Severity;
  passed: boolean;
  /** Human-readable reason when the guardrail is violated. */
  detail?: string;
};

export type Guardrail = {
  id: string;
  description: string;
  phase: GuardrailPhase;
  severity: Severity;
  /** Returns null when satisfied, or a violation detail string when breached. */
  check: (ctx: GuardrailContext) => string | null;
};

// ── Checkpoints ───────────────────────────────────────────────────────────────
// Evaluations of agent output with explicit pass/fail criteria. Persisted so a
// run can be replayed from any checkpoint forward.

export type CheckpointStatus = "pass" | "warn" | "fail";

export type CheckpointResult = {
  id: string;
  ordinal: number;
  label: string;
  /** Explicit, human-readable pass/fail criteria. */
  criteria: string;
  status: CheckpointStatus;
  /** Structured evidence backing the verdict. */
  evidence: Record<string, JsonValue>;
};

export type Checkpoint = {
  id: string;
  ordinal: number;
  label: string;
  criteria: string;
  evaluate: (output: MaterialOut) => Omit<CheckpointResult, "id" | "ordinal" | "label" | "criteria">;
};

// ── Alarms ────────────────────────────────────────────────────────────────────
// Structured, named alarm types with context, severity, and a recommended
// action. Severe alarms drive human-in-the-loop escalation.

export type AlarmType =
  | "GUARDRAIL_VIOLATION"
  | "CHECKPOINT_FAILED"
  | "LOW_CONFIDENCE"
  | "AGENT_ERROR"
  | "SCHEMA_DRIFT";

export type Alarm = {
  type: AlarmType;
  severity: Severity;
  message: string;
  context: Record<string, JsonValue>;
  recommendedAction: string;
};

// ── Agent (the worker) ────────────────────────────────────────────────────────
// The swappable interface. Dropping in a different agent requires no changes to
// the harness — only a new implementation of this contract.

export type AgentRunInput = {
  material: MaterialIn;
  /** Correction feedback from a prior failed pass; agent must change behavior. */
  feedback?: string;
};

export type AgentRunOutput =
  | { ok: true; output: MaterialOut }
  | { ok: false; error: string };

export type AgentAdapter = {
  id: string;
  label: string;
  /** Model identifier this adapter drives (for telemetry / display). */
  model: string;
  run: (input: AgentRunInput) => Promise<AgentRunOutput>;
};

// ── Run record ────────────────────────────────────────────────────────────────

export type HarnessStage =
  | "intake"
  | "pre-guardrails"
  | "agent"
  | "post-guardrails"
  | "checkpoints"
  | "escalation"
  | "emit"
  | "done"
  | "blocked";

export type HarnessRunStatus = "running" | "passed" | "failed" | "escalated" | "blocked";

export type HarnessRun = {
  id: string;
  agentId: string;
  model: string;
  inputSummary: string;
  status: HarnessRunStatus;
  currentStage: HarnessStage;
  attempts: number;
  guardrails: GuardrailResult[];
  checkpoints: CheckpointResult[];
  alarms: Alarm[];
  output?: MaterialOut;
  /** Set when the harness stops and asks a human instead of guessing. */
  escalation?: {
    reason: string;
    alarms: Alarm[];
  };
};
