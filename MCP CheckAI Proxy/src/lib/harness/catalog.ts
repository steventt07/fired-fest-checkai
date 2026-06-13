// ============================================================================
// Client-safe agent catalog
//
// Mirrors the server-side AGENT_CATALOG without importing any server-only
// module (no model keys, no run fns). Safe to import from the console UI so the
// agent selector can demonstrate worker swappability.
// ============================================================================

export type AgentChoice = { id: string; label: string; model: string };

export const AGENT_CHOICES: AgentChoice[] = [
  { id: "gemini-flash", label: "Lovable AI · Gemini 3 Flash", model: "google/gemini-3-flash-preview" },
  { id: "gpt-5.4-mini", label: "Lovable AI · GPT-5.4 mini", model: "openai/gpt-5.4-mini" },
];
