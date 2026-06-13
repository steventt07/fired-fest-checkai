// ============================================================================
// Harness server functions (client-reachable RPC surface)
//
// Only server-fn declarations live here. All server-only modules (orchestrator,
// agents, admin DB client) are imported INSIDE handlers via await import() so
// they never leak into the client bundle.
// ============================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { CheckpointResult, MaterialOut } from "@/lib/harness/types";

const FileInput = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  content: z.string().default(""),
});

const RunInput = z.object({
  files: z.array(FileInput).min(1),
  agentId: z.string().optional(),
});

export type RunHarnessResult =
  | { ok: true; runJson: string }
  | { ok: false; error: string };

export const runHarness = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RunInput.parse(input))
  .handler(async ({ data }): Promise<RunHarnessResult> => {
    const { intake } = await import("@/lib/harness/material");
    const { resolveAgent } = await import("@/lib/harness/agents/index.server");
    const { runOrchestrator } = await import("@/lib/harness/orchestrator.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const material = intake(data.files);
    const agent = resolveAgent(data.agentId);
    const runId = crypto.randomUUID();

    const { run, snapshot } = await runOrchestrator({ runId, agent, material });

    try {
      await supabaseAdmin.from("harness_runs").insert({
        id: run.id,
        agent_id: run.agentId,
        model: run.model,
        input_summary: run.inputSummary,
        status: run.status,
        current_stage: run.currentStage,
        attempts: run.attempts,
        result: JSON.parse(
          JSON.stringify({
            guardrails: run.guardrails,
            alarms: run.alarms,
            output: run.output ?? null,
            escalation: run.escalation ?? null,
          }),
        ),
      });
      if (run.checkpoints.length) {
        await supabaseAdmin.from("harness_checkpoints").insert(
          run.checkpoints.map((c) => ({
            run_id: run.id,
            checkpoint_id: c.id,
            ordinal: c.ordinal,
            status: c.status,
            criteria: c.criteria,
            evidence: JSON.parse(JSON.stringify(c.evidence)),
            material_snapshot: JSON.parse(JSON.stringify(snapshot ?? null)),
          })),
        );
      }
    } catch {
      // Persistence is best-effort; the run result is still returned.
    }

    return { ok: true, runJson: JSON.stringify(run) };
  });

const ReplayInput = z.object({
  runId: z.string(),
  fromOrdinal: z.number().int().min(1),
});

export type ReplayResult =
  | { ok: true; checkpoints: CheckpointResult[] }
  | { ok: false; error: string };

export const replayFromCheckpoint = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ReplayInput.parse(input))
  .handler(async ({ data }): Promise<ReplayResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { replayCheckpoints } = await import("@/lib/harness/orchestrator.server");

    const { data: rows, error } = await supabaseAdmin
      .from("harness_checkpoints")
      .select("material_snapshot, ordinal")
      .eq("run_id", data.runId)
      .order("ordinal", { ascending: true });

    if (error) return { ok: false, error: error.message };
    const snapshot = rows?.find((r) => r.material_snapshot)?.material_snapshot as
      | MaterialOut
      | undefined;
    if (!snapshot) return { ok: false, error: "No persisted output snapshot to replay from" };

    // Re-evaluate checkpoints from the chosen ordinal forward — the agent and
    // all prior stages are skipped, proving checkpoint replayability.
    return { ok: true, checkpoints: replayCheckpoints(snapshot, data.fromOrdinal) };
  });

const EscalationInput = z.object({
  runId: z.string(),
  approve: z.boolean(),
});

export const resolveEscalation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => EscalationInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; status: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const status = data.approve ? "passed" : "failed";
    try {
      await supabaseAdmin
        .from("harness_runs")
        .update({ status, current_stage: data.approve ? "done" : "blocked" })
        .eq("id", data.runId);
    } catch {
      // best-effort
    }
    return { ok: true, status };
  });
