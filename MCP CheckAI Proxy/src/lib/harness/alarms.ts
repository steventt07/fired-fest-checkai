// ============================================================================
// Pillar: ALARMS
//
// Structured, named alarm types. Each alarm carries a type, severity, context,
// and a recommended action. The harness raises alarms from guardrail
// violations, failed checkpoints, low confidence, and agent errors; severe
// alarms drive human-in-the-loop escalation.
// ============================================================================

import type {
  Alarm,
  AlarmType,
  CheckpointResult,
  GuardrailResult,
  JsonValue,
  MaterialOut,
  Severity,
} from "./types";

const RECOMMENDED_ACTION: Record<AlarmType, string> = {
  GUARDRAIL_VIOLATION: "Adjust the input or constraints before re-running the agent",
  CHECKPOINT_FAILED: "Re-run the agent with correction feedback, then re-evaluate",
  LOW_CONFIDENCE: "Escalate to a human reviewer before committing the output",
  AGENT_ERROR: "Inspect the agent adapter / model response and retry",
  SCHEMA_DRIFT: "Output does not match the UEF contract — block and review",
};

export function raiseAlarm(
  type: AlarmType,
  severity: Severity,
  message: string,
  context: Record<string, JsonValue> = {},
): Alarm {
  return {
    type,
    severity,
    message,
    context,
    recommendedAction: RECOMMENDED_ACTION[type],
  };
}

/** Derive alarms from a full set of pillar results for one agent pass. */
export function deriveAlarms(args: {
  guardrails: GuardrailResult[];
  checkpoints: CheckpointResult[];
  output?: MaterialOut;
  agentError?: string;
}): Alarm[] {
  const alarms: Alarm[] = [];

  if (args.agentError) {
    alarms.push(raiseAlarm("AGENT_ERROR", "critical", args.agentError));
  }

  for (const g of args.guardrails.filter((r) => !r.passed)) {
    const type: AlarmType =
      g.id === "output-shape" ? "SCHEMA_DRIFT" : "GUARDRAIL_VIOLATION";
    alarms.push(
      raiseAlarm(type, g.severity, `${g.description}: ${g.detail}`, {
        guardrailId: g.id,
        phase: g.phase,
      }),
    );
  }

  for (const c of args.checkpoints.filter((r) => r.status === "fail")) {
    alarms.push(
      raiseAlarm("CHECKPOINT_FAILED", "critical", `Checkpoint failed: ${c.label}`, {
        checkpointId: c.id,
        criteria: c.criteria,
        evidence: c.evidence,
      }),
    );
  }

  if (args.output && args.output.confidence < 0.55) {
    alarms.push(
      raiseAlarm("LOW_CONFIDENCE", "warning", "Agent confidence below threshold", {
        confidence: Number(args.output.confidence.toFixed(2)),
        threshold: 0.55,
      }),
    );
  }

  return dedupeAlarms(alarms);
}

/** Collapse identical alarms (same type + message) into one. */
export function dedupeAlarms(alarms: Alarm[]): Alarm[] {
  const seen = new Map<string, Alarm>();
  for (const a of alarms) {
    seen.set(`${a.type}:${a.message}`, a);
  }
  return [...seen.values()];
}

/** Whether the alarm set warrants stopping to ask a human. */
export function shouldEscalate(alarms: Alarm[]): boolean {
  const critical = alarms.filter((a) => a.severity === "critical").length;
  const lowConfidence = alarms.some((a) => a.type === "LOW_CONFIDENCE");
  return critical > 0 || lowConfidence;
}
