import type { Category } from "@/lib/ingest-data";

/**
 * Structured view of uef-to-mcp-mapping.md: how each Universal Event Format
 * entity reaches the Soundcheck platform, which MCP tool writes it, and which
 * record it becomes. Used by the Tool Mapping reference panel.
 */

export type MappingRow = {
  /** UEF entity name (UEFEvent, UEFVenue, …). */
  entity: string;
  /** Where it lives in the UEF document. */
  uefPath: string;
  /** Representative UEF fields. */
  fields: string;
  /** Primary MCP tool that writes it. */
  tool: string;
  /** Commit-time selector for Path C, when applicable. */
  commitVia?: string;
  /** Platform record it becomes. */
  record: string;
  /** Which staged category maps here, if any. */
  category?: Category;
};

export const UEF_MAPPING: MappingRow[] = [
  {
    entity: "UEFEvent",
    uefPath: "events[]",
    fields: "title · event_type · event_date · start_time · end_time · notes",
    tool: "create_event",
    record: "Event (the gig)",
    category: "Workflow",
  },
  {
    entity: "UEFVenue",
    uefPath: "events[].venue",
    fields: "name · address · phone_number · website",
    tool: "create_venue → link_venue_to_event",
    commitVia: 'event_field_keys: ["venue"]',
    record: "Venue (+ event link)",
    category: "Assets",
  },
  {
    entity: "UEFCustomer",
    uefPath: "events[].customer",
    fields: "name · email · phone · website · contacts[]",
    tool: "create_customer",
    record: "Customer",
    category: "Comms",
  },
  {
    entity: "UEFMember",
    uefPath: "events[].members[]",
    fields: "first_name · last_name · email · position · performance_fee",
    tool: "add_event_member",
    commitVia: "member_idx[]",
    record: "EventMember (+ Invitation)",
    category: "People",
  },
  {
    entity: "UEFScheduleItem",
    uefPath: "events[].schedule_items[]",
    fields: "name · start_time · end_time · order · notes",
    tool: "commit_ingestion_batch",
    commitVia: "schedule_idx[]",
    record: "ScheduleItem (timeline)",
    category: "Timeline",
  },
  {
    entity: "UEFLedgerItem",
    uefPath: "events[].ledger_items[]",
    fields: "type · amount · currency · date · status · account_hint",
    tool: "commit_ingestion_batch",
    commitVia: "ledger_idx[]",
    record: "LedgerItem (financials)",
    category: "Payments",
  },
  {
    entity: "UEFLead",
    uefPath: "leads[]",
    fields: "name · email · phone · event_date · event_type · location · budget",
    tool: "request_booking",
    commitVia: "commit_import (target_type: LEAD)",
    record: "LeadRequest",
    category: "Intake",
  },
  {
    entity: "UEFSetlist",
    uefPath: "setlists[]",
    fields: "title · is_template",
    tool: "create_setlist",
    record: "Setlist",
    category: "Outcomes",
  },
];

export type PathStep = { tool: string; detail: string };
export type PathDef = {
  id: "A" | "B" | "C";
  name: string;
  when: string;
  steps: PathStep[];
  primary?: boolean;
};

export const INGESTION_PATHS: PathDef[] = [
  {
    id: "A",
    name: "Direct create",
    when: "Already-structured data, one record per call. Clearest 1:1 mapping.",
    steps: [
      { tool: "create_event", detail: "→ Event" },
      { tool: "create_venue / link_venue_to_event", detail: "→ Venue" },
      { tool: "create_customer", detail: "→ Customer" },
      { tool: "add_event_member", detail: "→ EventMember" },
    ],
  },
  {
    id: "B",
    name: "Import wizard",
    when: "Bulk CSV/TSV spreadsheet of events, leads, inventory, or members.",
    steps: [
      { tool: "create_import_from_paste", detail: "parse rows → UEF" },
      { tool: "map_import", detail: "column → UEF field" },
      { tool: "preview_import", detail: "dry-run (no writes)" },
      { tool: "commit_import", detail: "write records" },
    ],
  },
  {
    id: "C",
    name: "File ingestion",
    when: "Unstructured files (contracts, emails, itineraries). Full UEF document end-to-end.",
    primary: true,
    steps: [
      { tool: "create_ingestion_batch", detail: "batch on an event" },
      { tool: "add_ingestion_text", detail: "per-file UEF proposal" },
      { tool: "trigger_ingestion_merge", detail: "consolidate proposals" },
      { tool: "get_ingestion_batch_review", detail: "review + merge_version" },
      { tool: "commit_ingestion_batch", detail: "write selected rows" },
    ],
  },
];
