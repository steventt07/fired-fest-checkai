import { useMemo } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Coins,
  MapPin,
  Sparkles,
} from "lucide-react";

import { buildUefDocument, type UefDocument, type UefRecord } from "@/lib/uef";
import type { EventFile } from "@/lib/ingest-data";

/**
 * Compact, read-only render of the canonical event object produced by an
 * ingestion run. Shown as the terminal output of step 04 (Ingest).
 */
export function EventObjectResult({ files }: { files: EventFile[] }) {
  const doc: UefDocument = useMemo(() => buildUefDocument(files), [files]);
  const event = doc.events[0] as UefRecord | undefined;

  if (!event) return null;

  const members = (event.members as UefRecord[] | undefined) ?? [];
  const schedule = (event.schedule_items as UefRecord[] | undefined) ?? [];
  const ledger = (event.ledger_items as UefRecord[] | undefined) ?? [];
  const venue = event.venue as UefRecord | undefined;
  const customer = event.customer as UefRecord | undefined;
  const contacts = (customer?.contacts as UefRecord[] | undefined) ?? [];
  const leads = doc.leads ?? [];
  const setlists = doc.setlists ?? [];

  const ledgerTotal = ledger.reduce(
    (sum, l) => sum + (typeof l.amount === "number" ? (l.amount as number) : 0),
    0,
  );

  const stats: [string, number][] = [
    ["members", members.length],
    ["schedule", schedule.length],
    ["ledger", ledger.length],
    ["contacts", contacts.length],
    ["leads", leads.length],
    ["setlists", setlists.length],
  ];

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-primary/30 bg-primary/[0.04]">
      <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/[0.06] px-3 py-2">
        <CheckCircle2 className="size-4 text-success" strokeWidth={2.5} />
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-primary">
          event object · committed
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {String(event.external_id ?? event.id ?? "evt")}
        </span>
      </div>

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
          <Sparkles className="size-3" /> {String(event.status ?? "DRAFT")}
        </div>
        <h3 className="mt-0.5 font-display text-base font-semibold text-foreground">
          {String(event.title ?? "Untitled Event")}
        </h3>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3" />
            {event.event_date ? String(event.event_date) : "no date resolved"}
          </span>
          {venue && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3" />
              {String(venue.name ?? "venue")}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-success">
            <Coins className="size-3" />
            {ledgerTotal.toLocaleString()} {String(event.currency ?? "USD")}
          </span>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {stats.map(([label, value]) => (
            <div
              key={label}
              className="rounded-md border border-border bg-card px-2 py-1.5 text-center"
            >
              <div className="font-mono text-sm font-semibold text-foreground">{value}</div>
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
