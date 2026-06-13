import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import type { Category, GeneratedFile } from "@/lib/ingest-data";

const CATEGORIES: Category[] = [
  "Workflow",
  "Assets",
  "Payments",
  "People",
  "Timeline",
  "Comms",
  "Outcomes",
  "Intake",
];

const GenerateInput = z.object({
  eventType: z.string().min(1).max(120),
  details: z.string().max(600).optional(),
  count: z.number().int().min(1).max(12).optional(),
});

export type GenerateResult =
  | { ok: true; files: GeneratedFile[] }
  | { ok: false; error: string };

const FileSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.enum([
    "Workflow",
    "Assets",
    "Payments",
    "People",
    "Timeline",
    "Comms",
    "Outcomes",
    "Intake",
  ]),
  content: z.string().min(1).max(20000),
});

/** Extract the first JSON array/object from a model response. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.search(/[[{]/);
  if (start === -1) throw new Error("No JSON found in response");
  return JSON.parse(raw.slice(start));
}

// Generates realistic synthetic event documents using Lovable AI so the user
// can drop them into the ingestion UI and exercise every MCP tool category.
export const generateEventFiles = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GenerateInput.parse(input))
  .handler(async ({ data }): Promise<GenerateResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false, error: "Missing LOVABLE_API_KEY" };

    const count = data.count ?? 8;
    const gateway = createLovableAiGatewayProvider(key);

    const system =
      "You generate realistic synthetic event-production documents for testing the " +
      "Soundcheck ingestion pipeline. These documents are parsed into the Universal " +
      "Event Format (UEF) — Soundcheck's canonical ingestion schema — so they MUST " +
      "carry the fields each UEF entity requires. " +
      "Output ONLY a JSON array, no prose. Each item is " +
      `{ "name": string, "category": one of ${CATEGORIES.join("|")}, "content": string }. ` +
      "Each category maps to a UEF entity: Workflow→Event, Timeline→ScheduleItem, " +
      "Payments→LedgerItem, People→Member, Assets→Venue, Comms→Contact, " +
      "Outcomes→Setlist, Intake→Lead. " +
      "CRITICAL for clean parsing: every file NAME must embed a real calendar date " +
      "as YYYY-MM-DD (e.g. summer-fest-contract-2026-07-18.pdf) so the parser can " +
      "resolve event_date / start_time. Use the SAME event date across all files in the batch. " +
      "Required UEF fields to surface in content: Event→title + event_date; " +
      "ScheduleItem→named items with explicit start times (RFC3339 or HH:MM); " +
      "LedgerItem→type (INCOME/EXPENSE), description, numeric amount, currency; " +
      "Lead→contact name, email, phone, and event_date; Member→first/last name, email, phone; " +
      "Venue→name + address. " +
      "Use realistic file names with extensions (.pdf, .docx, .txt, .md, .csv, .xlsx, .ics, .eml, .json, .svg, .png). " +
      "For .csv/.xlsx put comma-separated rows in content. For .ics use valid iCalendar text with DTSTART. " +
      "For .eml use email headers + body. For .json use valid JSON. For .svg/.png floorplans or stage plots, " +
      "put valid <svg> markup in content. For documents, write the full realistic body text. " +
      "Spread files across ALL categories (Workflow=contracts/SOWs, Assets=riders/stage plots/floorplans, " +
      "Payments=invoices/payouts/settlements, People=crew/guest lists, Timeline=schedules/run of show, " +
      "Comms=email/slack threads, Outcomes=setlists/recaps/notes, Intake=inquiry/booking forms). " +
      "Make names, numbers, dates, and people plausible and specific.";

    const prompt =
      `Generate ${count} synthetic documents for this event: "${data.eventType}".` +
      (data.details ? ` Extra context: ${data.details}.` : "") +
      " Pick one realistic event date and embed it (YYYY-MM-DD) in every file name. " +
      " Cover as many of the categories as possible so the parsed UEF document is rich. " +
      " Return the JSON array only.";

    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system,
        prompt,
      });

      const parsed = z.array(FileSchema).max(20).parse(extractJson(text));

      // Persist generated files so they grow the training set over time.
      try {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const batchId = crypto.randomUUID();
        const batchLabel = data.eventType;
        const rows = parsed.map((f) => ({
          name: f.name,
          file_type: f.name.includes(".")
            ? f.name.split(".").pop()!.toLowerCase()
            : "file",
          category: f.category,
          size: `${new TextEncoder().encode(f.content).length} B`,
          content: f.content,
          event_type: data.eventType,
          batch_id: batchId,
          batch_label: batchLabel,
        }));
        await supabaseAdmin.from("event_files").insert(rows);
      } catch (persistErr) {
        console.error("Failed to persist generated files:", persistErr);
      }

      return { ok: true, files: parsed };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      return { ok: false, error: message };
    }
  });


export type PersistedFile = {
  id: string;
  name: string;
  file_type: string;
  category: string;
  size: string;
  content: string;
  event_type: string;
  created_at: string;
  category_override: string | null;
  category_correct: boolean | null;
  quality: string | null;
};

export type ListResult =
  | { ok: true; files: PersistedFile[] }
  | { ok: false; error: string };

const SELECT_COLS =
  "id,name,file_type,category,size,content,event_type,created_at,category_override,category_correct,quality";

// Returns the full persisted training set, newest first.
export const listEventFiles = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListResult> => {
    try {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const { data, error } = await supabaseAdmin
        .from("event_files")
        .select(SELECT_COLS)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) return { ok: false, error: error.message };
      return { ok: true, files: (data ?? []) as PersistedFile[] };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load";
      return { ok: false, error: message };
    }
  },
);

// ---- Human review / annotation layer ----

const AnnotateInput = z.object({
  id: z.string().uuid(),
  category_override: z
    .enum([
      "Workflow",
      "Assets",
      "Payments",
      "People",
      "Timeline",
      "Comms",
      "Outcomes",
      "Intake",
    ])
    .nullable()
    .optional(),
  category_correct: z.boolean().nullable().optional(),
  quality: z.enum(["up", "down"]).nullable().optional(),
});

export type MutResult = { ok: true } | { ok: false; error: string };

// Stores reviewer annotations (category override / correctness / quality) on a file.
export const annotateEventFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AnnotateInput.parse(input))
  .handler(async ({ data }): Promise<MutResult> => {
    try {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const patch: {
        category_override?: string | null;
        category_correct?: boolean | null;
        quality?: string | null;
      } = {};
      if ("category_override" in data) patch.category_override = data.category_override;
      if ("category_correct" in data) patch.category_correct = data.category_correct;
      if ("quality" in data) patch.quality = data.quality;
      const { error } = await supabaseAdmin
        .from("event_files")
        .update(patch)
        .eq("id", data.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  });

// ---- Generation presets ----

export type Preset = {
  id: string;
  name: string;
  event_type: string;
  details: string | null;
  created_at: string;
};

export type PresetListResult =
  | { ok: true; presets: Preset[] }
  | { ok: false; error: string };

export const listPresets = createServerFn({ method: "GET" }).handler(
  async (): Promise<PresetListResult> => {
    try {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const { data, error } = await supabaseAdmin
        .from("generation_presets")
        .select("id,name,event_type,details,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return { ok: false, error: error.message };
      return { ok: true, presets: (data ?? []) as Preset[] };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  },
);

const SavePresetInput = z.object({
  name: z.string().min(1).max(120),
  eventType: z.string().min(1).max(120),
  details: z.string().max(600).optional(),
});

export const savePreset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SavePresetInput.parse(input))
  .handler(async ({ data }): Promise<MutResult> => {
    try {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const { error } = await supabaseAdmin.from("generation_presets").insert({
        name: data.name,
        event_type: data.eventType,
        details: data.details ?? null,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  });

const DeletePresetInput = z.object({ id: z.string().uuid() });

export const deletePreset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeletePresetInput.parse(input))
  .handler(async ({ data }): Promise<MutResult> => {
    try {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const { error } = await supabaseAdmin
        .from("generation_presets")
        .delete()
        .eq("id", data.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  });

// ---- Previous generation folders ----

export type GenerationFolder = {
  batch_id: string;
  label: string;
  event_type: string;
  count: number;
  created_at: string;
};

export type FolderListResult =
  | { ok: true; folders: GenerationFolder[] }
  | { ok: false; error: string };

// Lists previous generations grouped into folders (one folder per batch).
export const listGenerationFolders = createServerFn({ method: "GET" }).handler(
  async (): Promise<FolderListResult> => {
    try {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const { data, error } = await supabaseAdmin
        .from("event_files")
        .select("batch_id,batch_label,event_type,created_at")
        .not("batch_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) return { ok: false, error: error.message };

      const map = new Map<string, GenerationFolder>();
      for (const row of (data ?? []) as Array<{
        batch_id: string;
        batch_label: string | null;
        event_type: string;
        created_at: string;
      }>) {
        const existing = map.get(row.batch_id);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(row.batch_id, {
            batch_id: row.batch_id,
            label: row.batch_label ?? row.event_type,
            event_type: row.event_type,
            count: 1,
            created_at: row.created_at,
          });
        }
      }
      return { ok: true, folders: Array.from(map.values()) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  },
);

const LoadFolderInput = z.object({ batchId: z.string().uuid() });

export type LoadFolderResult =
  | { ok: true; files: GeneratedFile[] }
  | { ok: false; error: string };

// Returns every file belonging to a previous generation folder.
export const loadGenerationFolder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LoadFolderInput.parse(input))
  .handler(async ({ data }): Promise<LoadFolderResult> => {
    try {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const { data: rows, error } = await supabaseAdmin
        .from("event_files")
        .select("name,category,content")
        .eq("batch_id", data.batchId)
        .order("created_at", { ascending: true });
      if (error) return { ok: false, error: error.message };
      const files = (rows ?? []).map((r) => ({
        name: r.name as string,
        category: r.category as Category,
        content: (r.content as string) ?? "",
      }));
      return { ok: true, files };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  });

