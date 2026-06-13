// ============================================================================
// Pillar: GUARDRAILS
//
// Declared constraints — NOT implicit. Every guardrail is an entry in the
// `guardrails` array with an id, description, phase, severity, and a pure
// check function. The harness runs them; the agent never sees them. Adding a
// constraint means adding a declaration here, never editing the worker.
// ============================================================================

import type { Guardrail, GuardrailContext, GuardrailResult } from "./types";
import { reportFor } from "./material";

/** Maximum characters of source material a single run may feed the agent. */
const MAX_INPUT_CHARS = 200_000;

/** Categories the pipeline knows how to land. */
const ALLOWED_CATEGORIES = new Set([
  "Workflow",
  "Assets",
  "Payments",
  "People",
  "Timeline",
  "Comms",
  "Outcomes",
  "Intake",
]);

export const guardrails: Guardrail[] = [
  // ── Pre-flight: constrain what reaches the agent ──────────────────────────
  {
    id: "input-not-empty",
    description: "At least one file with content must be supplied",
    phase: "pre",
    severity: "critical",
    check: ({ material }) =>
      material.files.some((f) => f.content.trim().length > 0)
        ? null
        : "No file with parseable content was staged",
  },
  {
    id: "input-size-cap",
    description: `Total input must not exceed ${MAX_INPUT_CHARS.toLocaleString()} characters`,
    phase: "pre",
    severity: "warning",
    check: ({ material }) =>
      material.totalChars <= MAX_INPUT_CHARS
        ? null
        : `Input is ${material.totalChars.toLocaleString()} chars, over the ${MAX_INPUT_CHARS.toLocaleString()} cap`,
  },
  {
    id: "allowed-categories",
    description: "Every file must be a recognized pipeline category",
    phase: "pre",
    severity: "warning",
    check: ({ material }) => {
      const bad = material.files
        .map((f) => f.category)
        .filter((c) => !ALLOWED_CATEGORIES.has(c));
      return bad.length
        ? `Unrecognized categor${bad.length === 1 ? "y" : "ies"}: ${[...new Set(bad)].join(", ")}`
        : null;
    },
  },

  // ── Post-flight: constrain what the agent is allowed to emit ──────────────
  {
    id: "output-shape",
    description: "Agent output must be a UEF document with at least one event",
    phase: "post",
    severity: "critical",
    check: ({ output }) => {
      if (!output) return "No output produced";
      const doc = output.doc;
      if (!doc || doc.target_type !== "EVENT") return "Output is not a UEF EVENT document";
      if (!Array.isArray(doc.events) || doc.events.length === 0)
        return "Output contains no events";
      return null;
    },
  },
  {
    id: "provenance-required",
    description: "Every emitted event must carry ingestion provenance (no invented records)",
    phase: "post",
    severity: "warning",
    check: ({ output }) => {
      if (!output) return "No output produced";
      const missing = (output.doc.events ?? []).filter(
        (e) => !(e as Record<string, unknown>).provenance,
      );
      return missing.length
        ? `${missing.length} event record(s) missing provenance`
        : null;
    },
  },
  {
    id: "no-blocking-validation-errors",
    description: "Emitted document must pass UEF schema validation with zero blocking errors",
    phase: "post",
    severity: "critical",
    check: ({ output }) => {
      if (!output) return "No output produced";
      const report = reportFor(output);
      return report.counts.error > 0
        ? `${report.counts.error} blocking validation error(s)`
        : null;
    },
  },
];

/** Run all guardrails for a phase and return structured results. */
export function runGuardrails(ctx: GuardrailContext): GuardrailResult[] {
  return guardrails
    .filter((g) => g.phase === ctx.phase)
    .map((g) => {
      const detail = g.check(ctx);
      return {
        id: g.id,
        description: g.description,
        phase: g.phase,
        severity: g.severity,
        passed: detail === null,
        detail: detail ?? undefined,
      };
    });
}
