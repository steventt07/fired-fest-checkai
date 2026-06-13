// ============================================================================
// ORCHESTRATOR (SERVER ONLY)
//
// The harness run loop. It wires the four pillars around the swappable worker:
//
//   intake → pre-guardrails → agent.run → post-guardrails + checkpoints
//          → (on failure) feedback → re-run agent  → alarms → HITL gate → emit
//
// The orchestrator owns NO domain logic — it only coordinates the pillars and
// the agent. Behavior changes meaningfully on feedback: a failed checkpoint
// builds a correction prompt and the agent is re-run with it.
// ============================================================================

import type {
  AgentAdapter,
  HarnessRun,
  MaterialIn,
  MaterialOut,
  GuardrailResult,
  CheckpointResult,
} from "@/lib/harness/types";
import { runGuardrails } from "@/lib/harness/guardrails";
import { runCheckpoints, feedbackFromCheckpoints } from "@/lib/harness/checkpoints";
import { deriveAlarms, dedupeAlarms, shouldEscalate } from "@/lib/harness/alarms";

const MAX_ATTEMPTS = 2;

export type OrchestratorResult = {
  run: HarnessRun;
  /** Per-checkpoint material snapshot for replay (the output it evaluated). */
  snapshot: MaterialOut | null;
};

export async function runOrchestrator(args: {
  runId: string;
  agent: AgentAdapter;
  material: MaterialIn;
}): Promise<OrchestratorResult> {
  const { runId, agent, material } = args;

  const run: HarnessRun = {
    id: runId,
    agentId: agent.id,
    model: agent.model,
    inputSummary: material.summary,
    status: "running",
    currentStage: "intake",
    attempts: 0,
    guardrails: [],
    checkpoints: [],
    alarms: [],
  };

  // ── 1. Pre-flight guardrails ────────────────────────────────────────────
  run.currentStage = "pre-guardrails";
  const pre = runGuardrails({ phase: "pre", material });
  run.guardrails.push(...pre);

  const preCriticalFail = pre.find((g) => !g.passed && g.severity === "critical");
  if (preCriticalFail) {
    run.alarms = deriveAlarms({ guardrails: pre, checkpoints: [] });
    run.status = "blocked";
    run.currentStage = "blocked";
    run.escalation = {
      reason: `Blocked before the agent ran: ${preCriticalFail.description}`,
      alarms: run.alarms,
    };
    return { run, snapshot: null };
  }

  // ── 2..3. Agent run + checkpoints, with one feedback-driven retry ─────────
  let output: MaterialOut | undefined;
  let agentError: string | undefined;
  let post: GuardrailResult[] = [];
  let checkpoints: CheckpointResult[] = [];
  let feedback: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    run.attempts = attempt;
    run.currentStage = "agent";

    const res = await agent.run({ material, feedback });
    if (!res.ok) {
      agentError = res.error;
      output = undefined;
      break;
    }
    output = res.output;

    run.currentStage = "post-guardrails";
    post = runGuardrails({ phase: "post", material, output });

    run.currentStage = "checkpoints";
    checkpoints = runCheckpoints(output);

    const fb = feedbackFromCheckpoints(checkpoints);
    const postCriticalFail = post.some((g) => !g.passed && g.severity === "critical");

    // Only retry if there is something actionable AND we have attempts left.
    if ((fb || postCriticalFail) && attempt < MAX_ATTEMPTS) {
      feedback = [fb, postCriticalFail ? "- Output failed a critical output guardrail." : ""]
        .filter(Boolean)
        .join("\n");
      continue;
    }
    break;
  }

  // Merge guardrail results (pre already pushed) with the final post set.
  run.guardrails = [...pre, ...post];
  run.checkpoints = checkpoints;

  // ── 4. Alarms ─────────────────────────────────────────────────────────────
  run.alarms = dedupeAlarms(
    deriveAlarms({ guardrails: run.guardrails, checkpoints, output, agentError }),
  );

  // ── 5. Human-in-the-loop gate ───────────────────────────────────────────
  if (agentError) {
    run.status = "failed";
    run.currentStage = "blocked";
    run.escalation = { reason: `Agent error: ${agentError}`, alarms: run.alarms };
    return { run, snapshot: null };
  }

  if (shouldEscalate(run.alarms)) {
    run.status = "escalated";
    run.currentStage = "escalation";
    run.output = output;
    run.escalation = {
      reason: "Severe alarms raised — the harness is stopping to ask a human before committing.",
      alarms: run.alarms,
    };
    return { run, snapshot: output ?? null };
  }

  // ── 6. Emit ───────────────────────────────────────────────────────────────
  run.currentStage = "emit";
  run.output = output;
  run.status = "passed";
  run.currentStage = "done";
  return { run, snapshot: output ?? null };
}

/** Replay: re-evaluate checkpoints from a given ordinal using a stored output. */
export function replayCheckpoints(output: MaterialOut, fromOrdinal: number) {
  return runCheckpoints(output).filter((c) => c.ordinal >= fromOrdinal);
}
