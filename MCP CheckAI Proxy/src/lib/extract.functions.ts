import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

import { extractMembers } from "@/lib/uef-extract";
import type { UefDocument, UefRecord } from "@/lib/uef";

const FileInput = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["Workflow", "Assets", "Payments", "People", "Timeline", "Comms", "Outcomes", "Intake"]),
  content: z.string().optional(),
});

const ExtractInput = z.object({
  files: z.array(FileInput),
  model: z.string().optional(),
});

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.search(/[[{]/);
  if (start === -1) throw new Error("No JSON found in response");
  return JSON.parse(raw.slice(start));
}

export type ExtractResult =
  | { ok: true; docJson: string }
  | { ok: false; error: string };

/**
 * Ensure first_name / last_name are both populated. The model sometimes returns
 * a full name in first_name and leaves last_name empty, or provides only a
 * `name` field. This splits a full name into first + last as a fallback.
 */
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
  if (parts.length === 1) {
    return { ...rec, first_name: parts[0], last_name: last };
  }
  return {
    ...rec,
    first_name: parts.slice(0, -1).join(" "),
    last_name: parts[parts.length - 1],
  };
}

function mergeMemberName(rec: UefRecord, extracted: UefRecord[]): UefRecord {
  const normalized = normalizeName(rec);
  if (typeof normalized.last_name === "string" && normalized.last_name.trim()) {
    return normalized;
  }

  const email = typeof normalized.email === "string" ? normalized.email.toLowerCase() : "";
  const phone = typeof normalized.phone_number === "string" ? normalized.phone_number.replace(/\D/g, "") : "";
  const first = typeof normalized.first_name === "string" ? normalized.first_name.toLowerCase() : "";

  const match = extracted.find((member) => {
    const memberEmail = typeof member.email === "string" ? member.email.toLowerCase() : "";
    const memberPhone = typeof member.phone_number === "string" ? member.phone_number.replace(/\D/g, "") : "";
    const memberFirst = typeof member.first_name === "string" ? member.first_name.toLowerCase() : "";
    return (email && memberEmail === email) || (phone && memberPhone === phone) || (first && memberFirst === first);
  });

  if (!match?.last_name) return normalized;
  return {
    ...normalized,
    first_name: normalized.first_name || match.first_name,
    last_name: match.last_name,
  };
}

/**
 * AI-powered extraction. Sends file contents to Lovable AI Gateway and returns
 * a complete UEF document with real parsed entities — names, amounts, times,
 * addresses and all — instead of seeded synthetic data.
 */
export const extractUefDocument = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ExtractInput.parse(input))
  .handler(async ({ data }): Promise<ExtractResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false, error: "Missing LOVABLE_API_KEY" };

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);
    const jobId = `job_${Date.now().toString(36)}`;

    const system = `You are a data-extraction engine for the Soundcheck event-production platform.
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
- For each member, ALWAYS split full names into first_name and last_name (e.g. "Jane Doe" -> first_name "Jane", last_name "Doe"). Never leave last_name empty when a surname is present.
- Set "_file" on each record to the FILE number (1-based, as labelled "--- FILE n ---") that the record was extracted from.
- "performance_fee", "amount", "capacity", "order", "call_order" must be plain numbers (or omitted), never strings. "budget" is free-text and stays a string.
- ledger_items.status is only PAID or UNPAID. leads.status is only PENDING or COMPLETED. event.status is DRAFT or CONFIRMED.
- If a section has no parseable content, omit it entirely (return an empty array or omit the key).
- For .csv/.xlsx content, parse the comma-separated rows.
- For .ics content, parse DTSTART/SUMMARY/DESCRIPTION.
- For .eml content, parse From/Subject/Body for contact info.`;

    const filesText = data.files
      .map(
        (f, i) =>
          `--- FILE ${i + 1} ---\nname: ${f.name}\ncategory: ${f.category}\ncontent:\n${f.content ?? ""}\n`,
      )
      .join("\n");

    const modelId = data.model ?? "google/gemini-3-flash-preview";
    // OpenAI GPT-5 reasoning models default to a high reasoning effort, which
    // makes a single extraction call slow enough to hit the request timeout.
    // Cap the effort low so the call returns well inside the limit.
    const isReasoningModel = modelId.startsWith("openai/gpt-5");

    try {
      const { text } = await generateText({
        model: gateway(modelId),
        system,
        prompt: `Extract a complete UEF document from these ${data.files.length} event-production files. Return ONLY raw JSON.\n\n${filesText}`,
        abortSignal: AbortSignal.timeout(120_000),
        ...(isReasoningModel
          ? { providerOptions: { lovable: { reasoning_effort: "low" } } }
          : {}),
      });

      const parsed = extractJson(text) as Record<string, unknown>;

      // Build a canonical UefDocument from the AI response
      const source = {
        type: "INGESTION" as const,
        name: `${data.files.length} staged artifact${data.files.length === 1 ? "" : "s"}`,
        ingested_at: new Date().toISOString(),
        import_job_id: jobId,
      };

      const provenance = {
        source_system: "INGESTION" as const,
        external_id: jobId,
        fetched_at: new Date().toISOString(),
      };

      const allFileIds = data.files.map((f) => f.id);

      // Resolve provenance per record from the AI's "_file" hint (1-based index
      // into the prompt's FILE list). Falls back to every staged file id.
      const fileIdsFor = (rec: UefRecord): string[] => {
        const idx = typeof rec._file === "number" ? rec._file - 1 : -1;
        const id = data.files[idx]?.id;
        return id ? [id] : allFileIds;
      };

      const wrap = (rec: UefRecord): UefRecord => {
        const rest = { ...rec };
        delete rest._file;
        delete rest.provenance;
        delete rest.op;
        delete rest.source_file_ids;
        return {
          provenance,
          op: "upsert",
          source_file_ids: fileIdsFor(rec),
          ...rest,
        };
      };

      const event = parsed.event as UefRecord | undefined;
      const venue = parsed.venue as UefRecord | undefined;
      const customer = parsed.customer as UefRecord | undefined;
      const resolvedEventDate = String(event?.event_date ?? "2026-07-18");
      const deterministicMembers = data.files
        .filter((f) => f.category === "People")
        .flatMap((f) =>
          extractMembers(
            {
              ...f,
              type: "JSON",
              size: "",
              primitive: "add_event_member",
            },
            { source_file_ids: [f.id] },
            resolvedEventDate,
          ),
        );
      const parsedMembers = (parsed.members as UefRecord[] | undefined) ?? [];
      const memberRecords = parsedMembers.length ? parsedMembers : deterministicMembers;

      const eventRec: UefRecord = wrap({
        external_id: jobId,
        title: event?.title ?? "Summer Live Event",
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
          wrap(
            mergeMemberName({
              external_id: `mbr_${i}`,
              ...m,
            }, deterministicMembers),
          ),
        ),
        schedule_items: ((parsed.schedule_items as UefRecord[]) ?? []).map((s, i) =>
          wrap({
            external_id: `sched_${i}`,
            ...s,
          }),
        ),
        ledger_items: ((parsed.ledger_items as UefRecord[]) ?? []).map((l, i) =>
          wrap({
            external_id: `ledger_${i}`,
            ...l,
          }),
        ),
      });

      const doc: UefDocument = {
        schema_version: "1.1",
        target_type: "EVENT",
        source,
        events: [eventRec],
        leads: ((parsed.leads as UefRecord[]) ?? []).map((l, i) =>
          wrap({
            external_id: `lead_${i}`,
            ...l,
          }),
        ),
        setlists: ((parsed.setlists as UefRecord[]) ?? []).map((s, i) =>
          wrap({
            external_id: `set_${i}`,
            ...s,
          }),
        ),
      };

      if (!doc.leads?.length) delete doc.leads;
      if (!doc.setlists?.length) delete doc.setlists;

      return { ok: true, docJson: JSON.stringify(doc) };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Extraction failed";
      return { ok: false, error: message };
    }
  });
