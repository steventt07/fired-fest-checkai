import type { EventFile } from "@/lib/ingest-data";
import type { UefRecord } from "@/lib/uef";

/**
 * Real content extractors. These read the actual text of each artifact
 * (CSV rows, iCalendar, email headers, JSON, free-form document body) and pull
 * structured UEF records out of it — the genuine "Extract" stage of the ETL.
 *
 * When a file has no parseable content the caller falls back to seeded
 * synthetic data, but whenever real content is present these win so the demo
 * reflects exactly what was dropped in.
 */

// ── primitive helpers ──────────────────────────────────────────────────────

export const splitLines = (s: string): string[] =>
  s.split(/\r?\n/).map((l) => l.trim());

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/g;
const TIME_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
const DATE_RE = /(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])/;

export function firstEmail(s: string): string | null {
  const m = s.match(EMAIL_RE);
  return m ? m[0] : null;
}

export function firstPhone(s: string): string | null {
  const m = s.match(PHONE_RE);
  if (!m) return null;
  // require at least 10 digits to avoid matching amounts/IDs
  const digits = m[0].replace(/\D/g, "");
  return digits.length >= 10 ? m[0].trim() : null;
}

export function parseAmount(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/-?\$?\s?([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

// ── CSV ────────────────────────────────────────────────────────────────────

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export type CsvRow = Record<string, string>;

export function parseCsv(content: string): CsvRow[] {
  const lines = splitLines(content).filter(Boolean);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  // Header should look like labels, not data (no currency symbols/long numbers).
  if (header.length < 2) return [];
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.length < 2) continue;
    const obj: CsvRow = {};
    header.forEach((h, idx) => {
      obj[h] = cells[idx] ?? "";
    });
    rows.push(obj);
  }
  return rows;
}

/** Read the first present field whose header contains one of the keys. */
export function field(row: CsvRow, ...keys: string[]): string {
  for (const k of keys) {
    const hit = Object.keys(row).find((h) => h.includes(k));
    if (hit && row[hit]) return row[hit];
  }
  return "";
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getObjectField(r: Record<string, unknown>, ...keys: string[]): string {
  const wanted = keys.map(normalizeHeader);
  const entries = Object.keys(r).map((key) => ({ key, normalized: normalizeHeader(key) }));

  for (const want of wanted) {
    const exact = entries.find(({ normalized }) => normalized === want);
    if (exact) return String(r[exact.key] ?? "");
  }

  for (const want of wanted) {
    const contains = entries.find(({ normalized }) => normalized.includes(want));
    if (contains) return String(r[contains.key] ?? "");
  }

  return "";
}

function getExactObjectField(r: Record<string, unknown>, ...keys: string[]): string {
  const wanted = keys.map(normalizeHeader);
  const key = Object.keys(r).find((k) => wanted.includes(normalizeHeader(k)));
  return key ? String(r[key] ?? "") : "";
}

// ── JSON helper ─────────────────────────────────────────────────────────────

function tryJson(content: string): unknown | null {
  const t = content.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function asArray(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object");
  if (v && typeof v === "object") {
    // find first array-of-objects value
    for (const val of Object.values(v as Record<string, unknown>)) {
      if (Array.isArray(val) && val.some((x) => x && typeof x === "object")) {
        return val.filter((x) => x && typeof x === "object");
      }
    }
    return [v as Record<string, unknown>];
  }
  return [];
}

// ── Ledger (Payments) ───────────────────────────────────────────────────────

export function extractLedger(
  file: EventFile,
  meta: UefRecord,
  eventDate: string,
): UefRecord[] {
  const content = file.content ?? "";
  if (!content) return [];
  const out: UefRecord[] = [];

  const json = tryJson(content);
  const rows: CsvRow[] = json ? [] : parseCsv(content);
  const jsonRows = json ? asArray(json) : [];

  const push = (
    amount: number,
    desc: string,
    type: string,
    extra: Partial<CsvRow> = {},
  ) => {
    let t = type.toUpperCase();
    if (!["INCOME", "EXPENSE", "RECEIVABLE", "PAYABLE"].includes(t)) {
      t = /(income|deposit|revenue|received|paid in|sponsor|ticket|bar)/i.test(
        desc + " " + type,
      )
        ? "INCOME"
        : "EXPENSE";
    }
    out.push({
      ...meta,
      external_id: `ledger_${out.length}`,
      type: t,
      description: desc || `Line item ${out.length + 1}`,
      amount,
      currency: extra.currency?.toUpperCase() || "USD",
      date: extra.date || eventDate,
      status: (extra.status || "").toUpperCase() || "UNPAID",
      counterparty_name: extra.counterparty || "",
      account_hint: extra.account || "",
    });
  };

  for (const r of rows) {
    const amount = parseAmount(field(r, "amount", "amt", "total", "cost", "price", "value"));
    if (amount == null) continue;
    push(amount, field(r, "description", "desc", "item", "memo", "detail", "line"), field(r, "type", "kind"), {
      currency: field(r, "currency", "ccy"),
      date: field(r, "date"),
      status: field(r, "status", "state"),
      counterparty: field(r, "counterparty", "vendor", "payee", "client", "name", "from", "to"),
      account: field(r, "account", "category", "gl"),
    });
  }

  for (const r of jsonRows) {
    const get = (...k: string[]) => {
      for (const key of Object.keys(r)) {
        if (k.some((kk) => key.toLowerCase().includes(kk))) return String(r[key] ?? "");
      }
      return "";
    };
    const amount = parseAmount(get("amount", "total", "cost", "price"));
    if (amount == null) continue;
    push(amount, get("description", "desc", "memo", "item"), get("type", "kind"), {
      currency: get("currency"),
      date: get("date"),
      status: get("status"),
      counterparty: get("counterparty", "vendor", "payee", "client", "name"),
      account: get("account", "category"),
    });
  }

  if (!out.length) {
    // Free-form scan: any line that names money.
    for (const line of splitLines(content)) {
      if (!/[$€£]|\b(usd|eur|gbp)\b/i.test(line)) continue;
      const amount = parseAmount(line);
      if (amount == null) continue;
      const desc = line
        .replace(/[$€£]?\s?[\d,]+(?:\.\d+)?/g, "")
        .replace(/\b(usd|eur|gbp)\b/gi, "")
        .replace(/[:•\-–—|]+/g, " ")
        .trim();
      if (!desc) continue;
      push(amount, desc, "");
    }
  }

  return out;
}

// ── Members (People) ─────────────────────────────────────────────────────────

export function extractMembers(
  file: EventFile,
  meta: UefRecord,
  eventDate: string,
): UefRecord[] {
  const content = file.content ?? "";
  if (!content) return [];
  const out: UefRecord[] = [];

  const json = tryJson(content);
  const rows = json ? [] : parseCsv(content);
  const jsonRows = json ? asArray(json) : [];

  const add = (
    name: string,
    email: string,
    phone: string,
    position: string,
    fee: string,
  ) => {
    if (!name && !email) return;
    const { first, last } = splitName(name || (email.split("@")[0] ?? ""));
    out.push({
      ...meta,
      external_id: `mbr_${(first + "_" + last).toLowerCase().replace(/[^a-z0-9_]/g, "") || out.length}`,
      first_name: first,
      last_name: last,
      email: email || "",
      phone_number: phone || "",
      position: position || "Crew",
      ...(parseAmount(fee) != null ? { performance_fee: parseAmount(fee), currency: "USD" } : {}),
      call_time: `${eventDate}T${String(8 + out.length).padStart(2, "0")}:00:00-07:00`,
      call_order: out.length,
    });
  };

  for (const r of rows) {
    const name =
      field(r, "name", "full") ||
      `${field(r, "first")} ${field(r, "last")}`.trim();
    add(
      name,
      field(r, "email", "mail") || firstEmail(Object.values(r).join(" ")) || "",
      field(r, "phone", "mobile", "cell", "tel") || "",
      field(r, "position", "role", "title", "job"),
      field(r, "fee", "rate", "pay", "amount"),
    );
  }

  for (const r of jsonRows) {
    const first = getObjectField(r, "first_name", "firstname", "first");
    const last = getObjectField(r, "last_name", "lastname", "last");
    const name =
      getObjectField(r, "full_name", "fullname") ||
      getExactObjectField(r, "name") ||
      `${first} ${last}`.trim();
    add(
      name,
      getObjectField(r, "email", "mail"),
      getObjectField(r, "phone_number", "phone", "mobile", "tel"),
      getObjectField(r, "position", "role", "title"),
      getObjectField(r, "fee", "rate", "pay"),
    );
  }

  if (!out.length) {
    // Free-form roster: lines that contain an email.
    for (const line of splitLines(content)) {
      const email = firstEmail(line);
      if (!email) continue;
      const phone = firstPhone(line) ?? "";
      const name = line
        .replace(EMAIL_RE, "")
        .replace(PHONE_RE, "")
        .replace(/[•\-–—|,:]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      add(name, email, phone, "", "");
    }
  }

  return out;
}

// ── Schedule / run of show (Timeline) ────────────────────────────────────────

function fmtIcsTime(raw: string, eventDate: string): string {
  // 20260718T080000 or 20260718T080000Z
  const m = raw.match(/(20\d{2})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-07:00`;
  const hm = raw.match(TIME_RE);
  if (hm) return `${eventDate}T${hm[1].padStart(2, "0")}:${hm[2]}:00-07:00`;
  return raw;
}

export function extractSchedule(
  file: EventFile,
  meta: UefRecord,
  eventDate: string,
): UefRecord[] {
  const content = file.content ?? "";
  if (!content) return [];
  const out: UefRecord[] = [];

  // iCalendar
  const vevents = [...content.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)];
  if (vevents.length) {
    vevents.forEach((ve, i) => {
      const block = ve[1];
      const summary = block.match(/SUMMARY[^:]*:(.+)/i)?.[1]?.trim() ?? `Item ${i + 1}`;
      const dtstart = block.match(/DTSTART[^:]*:(.+)/i)?.[1]?.trim() ?? "";
      const dtend = block.match(/DTEND[^:]*:(.+)/i)?.[1]?.trim() ?? "";
      const desc = block.match(/DESCRIPTION[^:]*:(.+)/i)?.[1]?.trim() ?? "";
      out.push({
        ...meta,
        external_id: `sched_${i}`,
        name: summary,
        start_time: fmtIcsTime(dtstart, eventDate),
        ...(dtend ? { end_time: fmtIcsTime(dtend, eventDate) } : {}),
        notes: desc,
        order: i,
      });
    });
    return out;
  }

  // Free-form / CSV lines with a time
  const rows = parseCsv(content);
  if (rows.length && Object.keys(rows[0]).some((h) => /time|start|when/.test(h))) {
    rows.forEach((r, i) => {
      const start = field(r, "start", "time", "when");
      if (!start) return;
      out.push({
        ...meta,
        external_id: `sched_${i}`,
        name: field(r, "name", "item", "activity", "task", "title") || `Item ${i + 1}`,
        start_time: fmtIcsTime(start, eventDate),
        ...(field(r, "end") ? { end_time: fmtIcsTime(field(r, "end"), eventDate) } : {}),
        notes: field(r, "notes", "detail", "desc"),
        order: i,
      });
    });
    if (out.length) return out;
  }

  for (const line of splitLines(content)) {
    if (!TIME_RE.test(line)) continue;
    const times = [...line.matchAll(new RegExp(TIME_RE.source, "g"))];
    if (!times.length) continue;
    const start = times[0][0];
    const end = times[1]?.[0];
    const name = line
      .replace(new RegExp(TIME_RE.source, "g"), "")
      .replace(/[-–—|:•]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!name) continue;
    out.push({
      ...meta,
      external_id: `sched_${out.length}`,
      name,
      start_time: `${eventDate}T${start.padStart(5, "0")}:00-07:00`,
      ...(end ? { end_time: `${eventDate}T${end.padStart(5, "0")}:00-07:00` } : {}),
      notes: "",
      order: out.length,
    });
  }

  return out;
}

// ── Venue (Assets) ───────────────────────────────────────────────────────────

export function extractVenue(file: EventFile, meta: UefRecord): UefRecord | null {
  const content = file.content ?? "";
  if (!content) return null;

  const labelled =
    content.match(/(?:venue|location)\s*[:=]\s*(.+)/i)?.[1]?.trim() ?? "";
  // Address line: number + street, then city, state zip.
  const addr = content.match(
    /(\d+[^\n,]+),\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s*(\d{5})/,
  );

  if (!labelled && !addr) return null;

  return {
    ...meta,
    external_id: "ven_extracted",
    name: labelled || addr?.[2]?.trim() || "Venue",
    address: addr
      ? {
          line1: addr[1].trim(),
          city: addr[2].trim(),
          state: addr[3],
          postal_code: addr[4],
        }
      : undefined,
  };
}

// ── Contacts / customer (Comms) ───────────────────────────────────────────────

export function extractCustomer(file: EventFile, meta: UefRecord): UefRecord | null {
  const content = file.content ?? "";
  if (!content) return null;

  const from = content.match(/^from:\s*(.+)$/im)?.[1]?.trim() ?? "";
  const nameInFrom = from.replace(/<[^>]+>/, "").replace(/["']/g, "").trim();
  const email = firstEmail(from) || firstEmail(content);
  const phone = firstPhone(content);
  const org = content.match(/(?:company|organization|client|account)\s*[:=]\s*(.+)/i)?.[1]?.trim();

  if (!email && !nameInFrom && !org) return null;

  return {
    ...meta,
    external_id: "cust_extracted",
    name: org || nameInFrom || (email ? email.split("@")[0] : "Customer"),
    ...(nameInFrom ? { primary_contact_name: nameInFrom } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
  };
}

// ── Setlist (Outcomes) ────────────────────────────────────────────────────────

export function extractSetlist(
  file: EventFile,
  meta: UefRecord,
  eventName: string,
): UefRecord | null {
  const content = file.content ?? "";
  if (!content) return null;

  const songs: string[] = [];
  for (const line of splitLines(content)) {
    const m = line.match(/^(?:\d+[.)]\s*|[-*•]\s*)(.+)$/);
    if (m && m[1].trim().length > 1) songs.push(m[1].trim());
  }
  if (songs.length < 2) return null;

  return {
    ...meta,
    external_id: "set_extracted",
    title: `${eventName} — Setlist`,
    is_template: false,
    songs: songs.slice(0, 40),
  };
}

// ── Leads (Intake) ────────────────────────────────────────────────────────────

export function extractLead(
  file: EventFile,
  meta: UefRecord,
): UefRecord | null {
  const content = file.content ?? "";
  if (!content) return null;

  const json = tryJson(content);
  const get = (label: string) =>
    content.match(new RegExp(`${label}\\s*[:=]\\s*(.+)`, "i"))?.[1]?.trim() ?? "";

  const name =
    get("name") || get("contact") || get("requester") || "";
  const email = firstEmail(content);
  const phone = firstPhone(content);
  const date = content.match(DATE_RE)?.[0];

  if (!name && !email) return null;

  return {
    ...meta,
    external_id: `lead_${(name || email || "x").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12)}`,
    name: name || (email ? email.split("@")[0] : "Lead"),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(date ? { event_date: date } : {}),
    event_type: get("event type") || get("type") || "Event",
    location: get("location") || get("city") || "",
    ...(parseAmount(get("budget")) != null ? { budget: parseAmount(get("budget")) } : {}),
    message: get("message") || get("notes") || get("details") || "",
    status: "PENDING",
    ...(json ? {} : {}),
  };
}

// ── Event title (Workflow) ────────────────────────────────────────────────────

export function extractEventMeta(
  file: EventFile,
): { title?: string; date?: string } {
  const content = file.content ?? "";
  if (!content) return {};
  const title =
    content.match(/(?:event(?:\s*name|\s*title)?|title)\s*[:=]\s*(.+)/i)?.[1]?.trim() ??
    content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const date = content.match(DATE_RE)?.[0];
  return {
    title: title && title.length <= 80 ? title : undefined,
    date,
  };
}
