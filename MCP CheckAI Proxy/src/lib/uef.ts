import type { Category, EventFile } from "@/lib/ingest-data";
import {
  extractCustomer,
  extractEventMeta,
  extractLead,
  extractLedger,
  extractMembers,
  extractSchedule,
  extractSetlist,
  extractVenue,
} from "@/lib/uef-extract";

/**
 * Universal Event Format (UEF) — Soundcheck's canonical ingestion format.
 * Operator artifacts are transformed into a single UEF document before they
 * reach the normalized tables. This module turns staged EventFiles into a
 * UEF document and validates that document against the schema's hard rules.
 *
 * Mirrors universal-event-format.schema.json (v1.1).
 */

export const UEF_SCHEMA_VERSION = "1.1";

export type UefTargetType =
  | "EVENT"
  | "LEAD"
  | "INVENTORY"
  | "MEMBER"
  | "SPONSOR"
  | "ACCOUNT"
  | "SETLIST"
  | "CALLLIST";

export type UefSource = {
  type: "SPREADSHEET" | "PASTE" | "INGESTION" | "HUBSPOT" | "FLEX";
  name: string;
  ingested_at: string;
  import_job_id: string;
};

export type UefRecord = Record<string, unknown>;

export type UefDocument = {
  schema_version: string;
  target_type: UefTargetType;
  source: UefSource;
  events: UefRecord[];
  leads?: UefRecord[];
  setlists?: UefRecord[];
  calllists?: UefRecord[];
  sponsors?: UefRecord[];
  items?: UefRecord[];
};

/** UEF entity each MCP category maps onto. */
export const categoryToEntity: Record<Category, string> = {
  Workflow: "Event",
  Assets: "Venue",
  Payments: "LedgerItem",
  People: "Member",
  Timeline: "ScheduleItem",
  Comms: "Contact",
  Outcomes: "Setlist",
  Intake: "Lead",
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const titleCase = (s: string) =>
  slug(s)
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** Pull a YYYY-MM-DD date from a filename, if one is present. */
function dateFromName(name: string): string | null {
  const m = name.match(/(20\d{2})[-_./]?(0[1-9]|1[0-2])[-_./]?(0[1-9]|[12]\d|3[01])/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Deterministic seed from a string (stable demo data across renders). */
function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32) for stable picks. */
function makeRng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];

function provenanceFor(file: EventFile, jobId: string): UefRecord {
  return {
    provenance: {
      source_system: "INGESTION",
      external_id: `${jobId}:${file.id}`,
      fetched_at: new Date().toISOString(),
    },
    op: "upsert",
    source_file_ids: [file.id],
  };
}

/** Strip the trailing date token and artifact-type words to recover a clean event name. */
function cleanEventName(name: string): string {
  const t = titleCase(name)
    .replace(/\b20\d{2}\s*\d{2}\s*\d{2}\b/g, "")
    .replace(
      /\b(Contract|Invoice|Receipt|Settlement|Payout|Roster|Run Of Show|Schedule|Timeline|Agenda|Rider|Stage Plot|Floorplan|Setlist|Notes|Recap|Report|Summary|Thread|Email|Inquiry|Intake|Form|Deposit|Budget|Crew|Call Sheet|Pass List|Guest List)\b/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
  return t || "Summer Live Event";
}

const FIRST_NAMES = [
  "Maya", "Devon", "Priya", "Marcus", "Elena", "Theo", "Aisha", "Liam",
  "Sofia", "Noah", "Carmen", "Jalen", "Nina", "Oscar", "Ruby", "Kai",
];
const LAST_NAMES = [
  "Rivera", "Okafor", "Chen", "Nguyen", "Patel", "Brooks", "Castillo",
  "Hughes", "Romano", "Adeyemi", "Walsh", "Kim", "Delgado", "Foster",
];
const CREW = [
  { position: "Production Manager", fee: 1800 },
  { position: "Front of House Engineer", fee: 1200 },
  { position: "Monitor Engineer", fee: 1100 },
  { position: "Lighting Director", fee: 1150 },
  { position: "Stage Manager", fee: 1000 },
  { position: "Backline Tech", fee: 750 },
  { position: "Stagehand", fee: 600 },
  { position: "Security Lead", fee: 850 },
];

function buildCrew(rng: () => number, eventDate: string, meta: UefRecord): UefRecord[] {
  const count = 5 + Math.floor(rng() * 2); // 5–6
  const usedFirst = new Set<string>();
  const usedLast = new Set<string>();
  const rows: UefRecord[] = [];
  for (let i = 0; i < count; i++) {
    let first = pick(rng, FIRST_NAMES);
    let last = pick(rng, LAST_NAMES);
    while (usedFirst.has(first)) first = pick(rng, FIRST_NAMES);
    while (usedLast.has(last)) last = pick(rng, LAST_NAMES);
    usedFirst.add(first);
    usedLast.add(last);
    const role = CREW[i % CREW.length];
    const callHour = 8 + i; // staggered call times
    rows.push({
      ...meta,
      external_id: `mbr_${first}_${last}`.toLowerCase(),
      first_name: first,
      last_name: last,
      email: `${first}.${last}@summitlivecrew.com`.toLowerCase(),
      phone_number: `+1 (415) 555-0${(100 + i).toString().slice(-3)}`,
      position: role.position,
      performance_fee: role.fee,
      currency: "USD",
      call_time: `${eventDate}T${String(callHour).padStart(2, "0")}:00:00-07:00`,
      call_order: i,
    });
  }
  return rows;
}

function buildRunOfShow(eventDate: string, meta: UefRecord): UefRecord[] {
  const items = [
    { name: "Load-in & Rigging", start: "08:00", end: "11:00", notes: "North loading dock. Forklift on site." },
    { name: "Backline Setup", start: "11:00", end: "13:00", notes: "Drum riser, amp lines, DI checks." },
    { name: "Line Check", start: "13:00", end: "14:00", notes: "Input list 1–32 verified at FOH." },
    { name: "Sound Check", start: "14:00", end: "16:00", notes: "Headliner first, then support." },
    { name: "Doors Open", start: "17:30", end: "18:00", notes: "Box office + will-call live." },
    { name: "Support Set", start: "18:30", end: "19:30", notes: "45-min set, hard out at 19:30." },
    { name: "Changeover", start: "19:30", end: "20:00", notes: "Stage reset for headliner." },
    { name: "Headline Set", start: "20:00", end: "22:15", notes: "Two encores approved." },
    { name: "Strike & Load-out", start: "22:15", end: "00:30", notes: "Full strike, dock cleared by 12:30." },
  ];
  return items.map((it, i) => ({
    ...meta,
    external_id: `sched_${i}`,
    name: it.name,
    start_time: `${eventDate}T${it.start}:00-07:00`,
    end_time: `${eventDate}T${it.end}:00-07:00`,
    notes: it.notes,
    order: i,
  }));
}

function buildLedger(rng: () => number, eventDate: string, meta: UefRecord): UefRecord[] {
  const base = 12000 + Math.floor(rng() * 6000);
  const deposit = Math.round(base * 0.4);
  const rows = [
    { type: "INCOME", description: "Client deposit (50%)", amount: deposit, status: "PAID", counterparty: "Summit Corporate Events", account: "Event Revenue" },
    { type: "RECEIVABLE", description: "Balance due on event date", amount: base - deposit, status: "UNPAID", counterparty: "Summit Corporate Events", account: "Accounts Receivable" },
    { type: "INCOME", description: "Bar revenue share", amount: 2400, status: "UNPAID", counterparty: "Mountain View Amphitheater", account: "Concessions" },
    { type: "EXPENSE", description: "Crew payroll", amount: 6450, status: "UNPAID", counterparty: "Summit Live Crew", account: "Labor" },
    { type: "EXPENSE", description: "Backline & PA rental", amount: 3200, status: "PAID", counterparty: "Cascade Audio Rentals", account: "Equipment" },
    { type: "EXPENSE", description: "Catering & hospitality", amount: 1450, status: "UNPAID", counterparty: "Ridgeline Catering", account: "Hospitality" },
  ];
  return rows.map((r, i) => ({
    ...meta,
    external_id: `ledger_${i}`,
    type: r.type,
    description: r.description,
    amount: r.amount,
    currency: "USD",
    date: eventDate,
    status: r.status,
    counterparty_name: r.counterparty,
    account_hint: r.account,
  }));
}

/**
 * Transform staged artifacts into a single UEF document. Each present category
 * is expanded into a realistic, fully-populated set of records so the assembled
 * Event simulates a real production end to end (crew with real names, a full
 * run of show, an income/expense ledger, venue, customer + contacts).
 */
export function buildUefDocument(files: EventFile[]): UefDocument {
  const jobId = `job_${Date.now().toString(36)}`;
  const source: UefSource = {
    type: "INGESTION",
    name: `${files.length} staged artifact${files.length === 1 ? "" : "s"}`,
    ingested_at: new Date().toISOString(),
    import_job_id: jobId,
  };

  // Helpers to read every file in a category and merge extracted records.
  const filesOf = (c: Category) => files.filter((f) => f.category === c);
  const firstOf = (c: Category) => files.find((f) => f.category === c);
  const metaForFile = (f: EventFile): UefRecord => provenanceFor(f, jobId);

  // Event anchor + identity: prefer real content, fall back to the filename.
  const anchor =
    files.find((f) => f.category === "Workflow") ??
    files.find((f) => f.category === "Timeline") ??
    files[0];
  const anchorMeta = anchor ? extractEventMeta(anchor) : {};
  const eventName =
    anchorMeta.title ?? (anchor ? cleanEventName(anchor.name) : "Summer Live Event");
  const eventDate =
    anchorMeta.date ?? (anchor ? dateFromName(anchor.name) : null) ?? "2026-07-18";
  const rng = makeRng(seedFrom(anchor?.name ?? eventName));

  // Each entity is extracted from the actual artifact content; when a file has
  // no parseable content we synthesize seeded data so the demo stays complete.
  const members = filesOf("People").flatMap((f) => {
    const real = extractMembers(f, metaForFile(f), eventDate);
    return real.length ? real : buildCrew(rng, eventDate, metaForFile(f));
  });
  const scheduleItems = filesOf("Timeline").flatMap((f) => {
    const real = extractSchedule(f, metaForFile(f), eventDate);
    return real.length ? real : buildRunOfShow(eventDate, metaForFile(f));
  });
  const ledgerItems = filesOf("Payments").flatMap((f) => {
    const real = extractLedger(f, metaForFile(f), eventDate);
    return real.length ? real : buildLedger(rng, eventDate, metaForFile(f));
  });

  const venueFile = firstOf("Assets");
  const venue: UefRecord | undefined = venueFile
    ? extractVenue(venueFile, metaForFile(venueFile)) ?? {
        ...metaForFile(venueFile),
        external_id: "ven_mountain_view",
        name: "Mountain View Amphitheater",
        address: {
          line1: "1 Amphitheatre Pkwy",
          city: "Mountain View",
          state: "CA",
          postal_code: "94043",
          country: "USA",
        },
        capacity: 6200,
        phone_number: "+1 (650) 555-0142",
        website: "https://mountainviewamp.example.com",
        notes: "Outdoor lawn + reserved seating. Curfew 23:00.",
      }
    : undefined;

  const commsFile = firstOf("Comms");
  const customer: UefRecord | undefined = commsFile
    ? extractCustomer(commsFile, metaForFile(commsFile)) ?? {
        ...metaForFile(commsFile),
        name: "Summit Corporate Events",
        email: "events@summitcorp.example.com",
        phone: "+1 (415) 555-0110",
        website: "https://summitcorp.example.com",
        contacts: [
          {
            name: "Renee Caldwell",
            title: "Head of Brand Experience",
            email: "renee.caldwell@summitcorp.example.com",
            phone: "+1 (415) 555-0111",
          },
          {
            name: "Dominic Pierce",
            title: "Production Liaison",
            email: "dominic.pierce@summitcorp.example.com",
            phone: "+1 (415) 555-0112",
          },
        ],
      }
    : undefined;

  const setlists: UefRecord[] = filesOf("Outcomes").map(
    (f) =>
      extractSetlist(f, metaForFile(f), eventName) ?? {
        ...metaForFile(f),
        external_id: "set_headline",
        title: `${eventName} — Headline Setlist`,
        is_template: false,
        songs: [
          "Opening Fanfare", "Wildfire", "Cross the River", "Neon Hours",
          "Slow Burn", "Mountain Anthem (Encore)",
        ],
      },
  );

  const leads: UefRecord[] = filesOf("Intake").flatMap((f, idx) => {
    const real = extractLead(f, metaForFile(f));
    if (real) return [real];
    const fallback: UefRecord[] = [
      {
        ...metaForFile(f),
        external_id: "lead_harvest",
        name: "Priya Anand",
        email: "priya.anand@harvestfest.example.com",
        phone: "+1 (503) 555-0188",
        event_date: "2026-09-26",
        event_type: "Festival",
        location: "Bend, OR",
        budget: 28000,
        message: "Two-stage harvest festival, need full production crew + PA.",
        status: "PENDING",
      },
      {
        ...metaForFile(f),
        external_id: "lead_gala",
        name: "Marcus Webb",
        email: "marcus.webb@aurora.example.com",
        phone: "+1 (206) 555-0173",
        event_date: "2026-12-05",
        event_type: "Corporate Gala",
        location: "Seattle, WA",
        budget: 41000,
        message: "Awards gala, 600 guests, AV + lighting design.",
        status: "PENDING",
      },
    ];
    return idx === 0 ? fallback : [fallback[0]];
  });

  const event: UefRecord = {
    provenance: {
      source_system: "INGESTION",
      external_id: jobId,
      fetched_at: new Date().toISOString(),
    },
    op: "upsert",
    external_id: jobId,
    title: eventName,
    event_type: "Concert",
    event_date: eventDate,
    start_time: `${eventDate}T17:30:00-07:00`,
    end_time: `${eventDate}T23:00:00-07:00`,
    location: "1 Amphitheatre Pkwy, Mountain View, CA 94043",
    location_name: "Mountain View Amphitheater",
    status: "DRAFT",
    currency: "USD",
    notes: "Load-in 8am via north dock. Hard curfew 23:00.",
    ...(venue ? { venue } : {}),
    ...(customer ? { customer } : {}),
    ...(members.length ? { members } : {}),
    ...(scheduleItems.length ? { schedule_items: scheduleItems } : {}),
    ...(ledgerItems.length ? { ledger_items: ledgerItems } : {}),
  };

  const doc: UefDocument = {
    schema_version: UEF_SCHEMA_VERSION,
    target_type: "EVENT",
    source,
    events: files.length ? [event] : [],
  };
  if (leads.length) doc.leads = leads;
  if (setlists.length) doc.setlists = setlists;
  return doc;
}

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

export type ValidationSeverity = "ok" | "warn" | "error";

export type ValidationIssue = {
  field: string;
  severity: Exclude<ValidationSeverity, "ok">;
  message: string;
};

export type ValidationRecord = {
  id: string;
  entity: string;
  path: string;
  label: string;
  severity: ValidationSeverity;
  issues: ValidationIssue[];
};

export type ValidationReport = {
  records: ValidationRecord[];
  counts: { ok: number; warn: number; error: number; total: number };
  valid: boolean;
};

const isEmpty = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

function checkRecord(
  rec: UefRecord,
  cfg: {
    id: string;
    entity: string;
    path: string;
    label: string;
    required: string[];
    recommended?: string[];
  },
): ValidationRecord {
  const issues: ValidationIssue[] = [];
  for (const field of cfg.required) {
    if (isEmpty(rec[field])) {
      issues.push({
        field,
        severity: "error",
        message: `Required field "${field}" is missing or empty`,
      });
    }
  }
  for (const field of cfg.recommended ?? []) {
    if (isEmpty(rec[field])) {
      issues.push({
        field,
        severity: "warn",
        message: `Recommended field "${field}" was not resolved from the source`,
      });
    }
  }
  const severity: ValidationSeverity = issues.some((i) => i.severity === "error")
    ? "error"
    : issues.length
      ? "warn"
      : "ok";
  return { ...cfg, severity, issues };
}

/** Validate a UEF document against the schema's required/recommended rules. */
export function validateUefDocument(doc: UefDocument): ValidationReport {
  const records: ValidationRecord[] = [];

  doc.events.forEach((event, ei) => {
    records.push(
      checkRecord(event, {
        id: `event-${ei}`,
        entity: "Event",
        path: `events[${ei}]`,
        label: String(event.title ?? "Event"),
        required: ["title", "event_date"],
        recommended: ["currency", "status"],
      }),
    );
    const venue = event.venue as UefRecord | undefined;
    if (venue) {
      records.push(
        checkRecord(venue, {
          id: `event-${ei}-venue`,
          entity: "Venue",
          path: `events[${ei}].venue`,
          label: String(venue.name ?? "Venue"),
          required: ["name"],
          recommended: ["address", "city"],
        }),
      );
    }
    (event.members as UefRecord[] | undefined)?.forEach((m, i) =>
      records.push(
        checkRecord(m, {
          id: `event-${ei}-member-${i}`,
          entity: "Member",
          path: `events[${ei}].members[${i}]`,
          label: `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "Member",
          required: [],
          recommended: ["email", "phone_number", "performance_fee"],
        }),
      ),
    );
    (event.schedule_items as UefRecord[] | undefined)?.forEach((s, i) =>
      records.push(
        checkRecord(s, {
          id: `event-${ei}-sched-${i}`,
          entity: "ScheduleItem",
          path: `events[${ei}].schedule_items[${i}]`,
          label: String(s.name ?? "Schedule item"),
          required: ["name", "start_time"],
        }),
      ),
    );
    (event.ledger_items as UefRecord[] | undefined)?.forEach((l, i) =>
      records.push(
        checkRecord(l, {
          id: `event-${ei}-ledger-${i}`,
          entity: "LedgerItem",
          path: `events[${ei}].ledger_items[${i}]`,
          label: String(l.description ?? "Ledger item"),
          required: ["type", "description", "amount"],
          recommended: ["date", "counterparty_name"],
        }),
      ),
    );
  });

  doc.leads?.forEach((lead, i) =>
    records.push(
      checkRecord(lead, {
        id: `lead-${i}`,
        entity: "Lead",
        path: `leads[${i}]`,
        label: String(lead.name ?? "Lead"),
        required: ["name", "event_date"],
        recommended: ["email", "phone"],
      }),
    ),
  );

  doc.setlists?.forEach((sl, i) =>
    records.push(
      checkRecord(sl, {
        id: `setlist-${i}`,
        entity: "Setlist",
        path: `setlists[${i}]`,
        label: String(sl.title ?? "Setlist"),
        required: ["title"],
      }),
    ),
  );

  const counts = {
    ok: records.filter((r) => r.severity === "ok").length,
    warn: records.filter((r) => r.severity === "warn").length,
    error: records.filter((r) => r.severity === "error").length,
    total: records.length,
  };

  return { records, counts, valid: counts.error === 0 && counts.total > 0 };
}
