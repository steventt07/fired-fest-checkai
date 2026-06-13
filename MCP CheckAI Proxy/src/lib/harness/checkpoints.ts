// ============================================================================
// Pillar: CHECKPOINTS
//
// Ordered evaluations of agent output, each with EXPLICIT pass/fail criteria
// and structured evidence. Checkpoint results are persisted (see
// harness.functions.ts) so a run can be replayed from any checkpoint forward.
// ============================================================================

import type { Checkpoint, CheckpointResult, MaterialOut } from "./types";
import { reportFor } from "./material";
import type { UefRecord } from "@/lib/uef";

export const checkpoints: Checkpoint[] = [
  {
    id: "cp-records-produced",
    ordinal: 1,
    label: "Records produced",
    criteria: "The agent must extract at least one UEF record from the material",
    evaluate: (output) => {
      const ok = output.recordCount > 0;
      return {
        status: ok ? "pass" : "fail",
        evidence: { recordCount: output.recordCount },
      };
    },
  },
  {
    id: "cp-required-fields",
    ordinal: 2,
    label: "Required fields present",
    criteria: "Zero blocking validation errors across all records",
    evaluate: (output) => {
      const report = reportFor(output);
      return {
        status: report.counts.error > 0 ? "fail" : "pass",
        evidence: {
          errors: report.counts.error,
          warnings: report.counts.warn,
          ok: report.counts.ok,
        },
      };
    },
  },
  {
    id: "cp-names-split",
    ordinal: 3,
    label: "Member names fully split",
    criteria: "Every member with a name has both first_name and last_name populated",
    evaluate: (output) => {
      const members = (output.doc.events ?? []).flatMap(
        (e) => ((e as UefRecord).members as UefRecord[] | undefined) ?? [],
      );
      const offenders = members.filter((m) => {
        const first = typeof m.first_name === "string" ? m.first_name.trim() : "";
        const last = typeof m.last_name === "string" ? m.last_name.trim() : "";
        return first && !last;
      });
      return {
        status: offenders.length ? "fail" : members.length ? "pass" : "warn",
        evidence: {
          members: members.length,
          missingLastName: offenders.length,
          examples: offenders.slice(0, 3).map((m) => String(m.first_name)),
        },
      };
    },
  },
  {
    id: "cp-numeric-amounts",
    ordinal: 4,
    label: "Amounts are numeric",
    criteria: "Ledger amounts and performance fees must be numbers, not strings",
    evaluate: (output) => {
      const events = output.doc.events ?? [];
      const ledger = events.flatMap(
        (e) => ((e as UefRecord).ledger_items as UefRecord[] | undefined) ?? [],
      );
      const members = events.flatMap(
        (e) => ((e as UefRecord).members as UefRecord[] | undefined) ?? [],
      );
      const badLedger = ledger.filter(
        (l) => l.amount !== undefined && typeof l.amount !== "number",
      );
      const badFees = members.filter(
        (m) => m.performance_fee !== undefined && typeof m.performance_fee !== "number",
      );
      const bad = badLedger.length + badFees.length;
      return {
        status: bad ? "fail" : "pass",
        evidence: {
          ledgerItems: ledger.length,
          nonNumericAmounts: badLedger.length,
          nonNumericFees: badFees.length,
        },
      };
    },
  },
  {
    id: "cp-confidence",
    ordinal: 5,
    label: "Confidence threshold",
    criteria: "Agent self-reported confidence must be at least 0.55",
    evaluate: (output) => {
      const ok = output.confidence >= 0.55;
      return {
        status: ok ? "pass" : "warn",
        evidence: { confidence: Number(output.confidence.toFixed(2)), threshold: 0.55 },
      };
    },
  },
];

/** Evaluate all checkpoints against the agent output, in order. */
export function runCheckpoints(output: MaterialOut): CheckpointResult[] {
  return checkpoints
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((cp) => {
      const { status, evidence } = cp.evaluate(output);
      return {
        id: cp.id,
        ordinal: cp.ordinal,
        label: cp.label,
        criteria: cp.criteria,
        status,
        evidence,
      };
    });
}

/** Build correction feedback the agent can act on, from failed checkpoints. */
export function feedbackFromCheckpoints(results: CheckpointResult[]): string | null {
  const failed = results.filter((r) => r.status === "fail");
  if (!failed.length) return null;
  return failed
    .map((r) => `- [${r.label}] ${r.criteria}. Evidence: ${JSON.stringify(r.evidence)}`)
    .join("\n");
}
