// ============================================================================
// Agent adapters (the swappable WORKER) — SERVER ONLY
//
// Two concrete implementations of the AgentAdapter interface, each driving a
// different model through the same extraction core. The harness selects an
// adapter by id and depends only on the interface — dropping in a different
// agent requires zero harness changes.
// ============================================================================

import type { AgentAdapter } from "@/lib/harness/types";
import { runExtraction } from "./extract-core.server";

export const lovableExtractionAgent: AgentAdapter = {
  id: "gemini-flash",
  label: "Lovable AI · Gemini 3 Flash",
  model: "google/gemini-3-flash-preview",
  run: async ({ material, feedback }) => {
    const result = await runExtraction({
      files: material.files,
      model: "google/gemini-3-flash-preview",
      feedback,
    });
    return result.ok
      ? { ok: true, output: result.output }
      : { ok: false, error: result.error };
  },
};

export const lovableExtractionAgentAlt: AgentAdapter = {
  id: "gpt-5-mini",
  label: "Lovable AI · GPT-5 mini",
  model: "openai/gpt-5-mini",
  run: async ({ material, feedback }) => {
    const result = await runExtraction({
      files: material.files,
      model: "openai/gpt-5-mini",
      feedback,
    });
    return result.ok
      ? { ok: true, output: result.output }
      : { ok: false, error: result.error };
  },
};

export const AGENTS: AgentAdapter[] = [lovableExtractionAgent, lovableExtractionAgentAlt];

export function resolveAgent(id: string | undefined): AgentAdapter {
  return AGENTS.find((a) => a.id === id) ?? lovableExtractionAgent;
}

/** Catalog for the UI selector (no run fn — safe shape). */
export const AGENT_CATALOG = AGENTS.map((a) => ({ id: a.id, label: a.label, model: a.model }));
