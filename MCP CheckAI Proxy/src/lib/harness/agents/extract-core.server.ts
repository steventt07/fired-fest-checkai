// ============================================================================
// Extraction core (SERVER ONLY)
//
// The actual model call + UEF assembly. Both agent adapters drive this with a
// different `model`. It accepts optional correction `feedback` so a second
// pass can change behavior in response to checkpoint/guardrail failures, and
// returns a derived confidence used by the LOW_CONFIDENCE alarm.
//
// This is the WORKER's implementation detail. The harness only ever sees the
// AgentAdapter interface, never this file.
// ============================================================================

import { generateText } from "ai";

import { extractMembers } from "@/lib/uef-extract";
import type { EventFile } from "@/lib/ingest-data";
import type { UefDocument, UefRecord } from "@/lib/uef";
import type { MaterialFile, MaterialOut } from "@/lib/harness/types";

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.search(/[[{]/);
  if (start === -1) throw new Error("No JSON found in response");
  return JSON.parse(raw.slice(start));
}

function normalizeName(rec: UefRecord): UefRecord {
  const first = typeof rec.first_name === "string" ? rec.first_name.trim() : "";
  const last = typeof rec.last_name === "string" ? rec.last_name.trim() : "";
  if (first && last) return rec;
  const full =
    (first || last
      ? `${first} ${last}`
      : typeof rec.name === "string"
        ? rec.name
        : "") ?? "";
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return rec;
  if (parts.length === 1) return { ...rec, first_name: parts[0], last_name: last };
  return {
    ...rec,
    first_name: parts.slice(0, -1).join(" "),
    last_name: parts[parts.length - 1],
  };
}

function mergeMemberName(rec: UefRecord, extracted: UefRecord[]): UefRecord {
  const normalized = normalizeName(rec);
  if (typeof normalized.last_name === "string" && normalized.last_name.trim()) return normalized;
  const email = typeof normalized.email === "string" ? normalized.email.toLowerCase() : "";
  const phone =
    typeof normalized.phone_number === "string" ? normalized.phone_number.replace(/\D/g, "") : "";
  const first = typeof normalized.first_name === "string" ? normalized.first_name.toLowerCase() : "";
  const match = extracted.find((member) => {
    const me = typeof member.email === "string" ? member.email.toLowerCase() : "";
    const mp = typeof member.phone_number === "string" ? member.phone_number.replace(/\D/g, "") : "";
    const mf = typeof member.first_name === "string" ? member.first_name.toLowerCase() : "";
    return (email && me === email) || (phone && mp === phone) || (first && mf === first);
  });
  if (!match?.last_name) return normalized;
  return {
    ...normalized,
    first_name: normalized.first_name || match.first_name,
    last_name: match.last_name,
  };
}

const SYSTEM = `You are a data-extraction engine for the Soundcheck event-production platform.
Given event-production documents (crew lists, schedules, invoices, emails, contracts, etc.), extract a complete Universal Event Format (UEF) document as raw JSON.
Return ONLY raw JSON — no markdown fences, no commentary.

Top-level shape (every array item may also include "_file": <1-based FILE number it was extracted from>):
{
  "event": {"title", "event_date" (YYYY-MM-DD), "event_type", "start_time" (RFC3339 -07:00), "end_time", "location", "status" (DRAFT/CONFIRMED), "currency", "notes"},
  "venue": {"name", "address": {"line1", "city", "state", "postal_code", "country"}, "capacity" (number), "phone_number", "website", "notes"},
  "customer": {"name", "email", "phone", "website", "contacts": [{"name", "title", "email", "phone"}]},
  "members": [{"first_name", "last_name", "email", "phone_number", "position", "performance_fee" (number), "fee_notes", "call_order" (integer, 0=primary), "_file"}],
  "schedule_items": [{"name", "start_time" (RFC3339), "end_time" (RFC3339), "notes", "order" (integer), "_file"}],
  "ledger_items": [{"type" (INCOME/EXPENSE/RECEIVABLE/PAYABLE), "description", "amount" (number), "currency", "date" (YYYY-MM-DD), "status" (PAID/UNPAID), "counterparty_name", "counterparty_email", "account_hint", "notes", "_file"}],
  "setlists": [{"title", "is_template" (boolean), "songs" (string array), "_file"}],
  "leads": [{"name", "email", "phone", "event_date" (YYYY-MM-DD), "event_type", "location", "budget" (free-text string), "message", "status" (PENDING/COMPLETED), "_file"}]
}

Rules:
- Infer event_date from filenames if a YYYY-MM-DD pattern is present.
- Use ISO dates. Use RFC3339 times with -07:00 offset.
- Parse real names, amounts, times, and addresses from content. Do not invent data.
- For each member, ALWAYS split full names into first_name and last_name. Never leave last_name empty when a surname is present.
- Set "_file" on each record to the FILE number (1-based) it was extracted from.
- "performance_fee", "amount", "capacity", "order", "call_order" must be plain numbers (or omitted), never strings. "budget" is free-text and stays a string.
- ledger_items.status is only PAID or UNPAID. leads.status is only PENDING or COMPLETED. event.status is DRAFT or CONFIRMED.
- If a section has no parseable content, omit it entirely.`;

/**
 * Derive a confidence score from how completely the document was populated.
 * A cheap proxy in lieu of model logprobs — penalizes thin or partial output.
 */
function deriveConfidence(doc: UefDocument, fileCount: number): number {
  const event = (doc.events?.[0] ?? {}) as UefRecord;
  let score = 0;
  if (event.title) score += 0.2;
  if (event.event_date) score += 0.15;
  if (event.venue) score += 0.1;
  if (event.customer) score += 0.1;
  const members = (event.members as unknown[] | undefined)?.length ?? 0;
  const schedule = (event.schedule_items as unknown[] | undefined)?.length ?? 0;
  const ledger = (event.ledger_items as unknown[] | undefined)?.length ?? 0;
  if (members) score += 0.15;
  if (schedule) score += 0.15;
  if (ledger) score += 0.15;
  // Penalize if we got far fewer record groups than files supplied.
  const density = Math.min(1, (members + schedule + ledger) / Math.max(1, fileCount));
  return Math.max(0, Math.min(1, score * (0.6 + 0.4 * density)));
}

export type ExtractCoreResult = { ok: true; output: MaterialOut } | { ok: false; error: string };

export async function runExtraction(args: {
  files: MaterialFile[];
  model: string;
  feedback?: string;
}): Promise<ExtractCoreResult> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { ok: false, error: "Missing LOVABLE_API_KEY" };

  const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
  const gateway = createLovableAiGatewayProvider(key);
  const jobId = `job_${Date.now().toString(36)}`;

  const filesText = args.files
    .map(
      (f, i) =>
        `--- FILE ${i + 1} ---\nname: ${f.name}\ncategory: ${f.category}\ncontent:\n${f.content ?? ""}\n`,
    )
    .join("\n");

  const feedbackBlock = args.feedback
    ? `\n\nA PRIOR ATTEMPT FAILED HARNESS CHECKPOINTS. Fix these specific problems this time:\n${args.feedback}\n`
    : "";

  try {
    const { text } = await generateText({
      model: gateway(args.model),
      system: SYSTEM,
      prompt: `Extract a complete UEF document from these ${args.files.length} event-production files. Return ONLY raw JSON.${feedbackBlock}\n\n${filesText}`,
    });

    const parsed = extractJson(text) as Record<string, unknown>;

    const source = {
      type: "INGESTION" as const,
      name: `${args.files.length} staged artifact${args.files.length === 1 ? "" : "s"}`,
      ingested_at: new Date().toISOString(),
      import_job_id: jobId,
    };
    const provenance = {
      source_system: "INGESTION" as const,
      external_id: jobId,
      fetched_at: new Date().toISOString(),
    };
    const allFileIds = args.files.map((f) => f.id);
    const fileIdsFor = (rec: UefRecord): string[] => {
      const idx = typeof rec._file === "number" ? rec._file - 1 : -1;
      const id = args.files[idx]?.id;
      return id ? [id] : allFileIds;
    };
    const wrap = (rec: UefRecord): UefRecord => {
      const rest = { ...rec };
      delete rest._file;
      delete rest.provenance;
      delete rest.op;
      delete rest.source_file_ids;
      return { provenance, op: "upsert", source_file_ids: fileIdsFor(rec), ...rest };
    };

    const event = parsed.event as UefRecord | undefined;
    const venue = parsed.venue as UefRecord | undefined;
    const customer = parsed.customer as UefRecord | undefined;
    const resolvedEventDate = String(event?.event_date ?? "2026-07-18");
    const deterministicMembers = args.files
      .filter((f) => f.category === "People")
      .flatMap((f) =>
        extractMembers(
          { ...f, type: "JSON", size: "", primitive: "add_event_member" } as unknown as EventFile,
          { source_file_ids: [f.id] },
          resolvedEventDate,
        ),
      );
    const parsedMembers = (parsed.members as UefRecord[] | undefined) ?? [];
    const memberRecords = parsedMembers.length ? parsedMembers : deterministicMembers;

    const eventRec: UefRecord = wrap({
      external_id: jobId,
      title: event?.title ?? "Untitled Event",
      event_type: event?.event_type ?? "Concert",
      event_date: event?.event_date ?? "2026-07-18",
      start_time: event?.start_time ?? `${event?.event_date ?? "2026-07-18"}T17:30:00-07:00`,
      end_time: event?.end_time ?? `${event?.event_date ?? "2026-07-18"}T23:00:00-07:00`,
      location: event?.location ?? "",
      status: event?.status ?? "DRAFT",
      currency: event?.currency ?? "USD",
      notes: event?.notes ?? "",
      ...(venue ? { venue: wrap(venue) } : {}),
      ...(customer ? { customer: wrap(customer) } : {}),
      members: memberRecords.map((m, i) =>
        wrap(mergeMemberName({ external_id: `mbr_${i}`, ...m }, deterministicMembers)),
      ),
      schedule_items: ((parsed.schedule_items as UefRecord[]) ?? []).map((s, i) =>
        wrap({ external_id: `sched_${i}`, ...s }),
      ),
      ledger_items: ((parsed.ledger_items as UefRecord[]) ?? []).map((l, i) =>
        wrap({ external_id: `ledger_${i}`, ...l }),
      ),
    });

    const doc: UefDocument = {
      schema_version: "1.1",
      target_type: "EVENT",
      source,
      events: [eventRec],
      leads: ((parsed.leads as UefRecord[]) ?? []).map((l, i) =>
        wrap({ external_id: `lead_${i}`, ...l }),
      ),
      setlists: ((parsed.setlists as UefRecord[]) ?? []).map((s, i) =>
        wrap({ external_id: `set_${i}`, ...s }),
      ),
    };
    if (!doc.leads?.length) delete doc.leads;
    if (!doc.setlists?.length) delete doc.setlists;

    const confidence = deriveConfidence(doc, args.files.length);
    const { emit } = await import("@/lib/harness/material");
    return { ok: true, output: emit(doc, confidence) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return { ok: false, error: message };
  }
}
