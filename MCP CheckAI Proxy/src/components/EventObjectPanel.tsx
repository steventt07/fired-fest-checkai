import { useMemo, useState } from "react";
import {
  Boxes,
  CalendarDays,
  ChevronRight,
  Coins,
  Contact2,
  ListMusic,
  MapPin,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { buildUefDocument, type UefDocument, type UefRecord } from "@/lib/uef";
import type { EventFile } from "@/lib/ingest-data";

const HIDDEN_FIELDS = new Set([
  "provenance",
  "op",
  "source_file_ids",
  "external_id",
  "members",
  "schedule_items",
  "ledger_items",
  "customer",
  "venue",
]);

function fieldEntries(rec: UefRecord): [string, string][] {
  return Object.entries(rec)
    .filter(([k, v]) => {
      if (HIDDEN_FIELDS.has(k)) return false;
      if (Array.isArray(v)) return v.every((x) => typeof x !== "object");
      return typeof v !== "object";
    })
    .map(([k, v]) => {
      if (Array.isArray(v)) return [k, v.length ? v.join(", ") : "—"];
      return [k, v === "" || v == null ? "—" : String(v)];
    });
}

function EntityNode({
  icon: Icon,
  title,
  subtitle,
  fields,
  tone = "default",
  defaultOpen = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  fields: [string, string][];
  tone?: "default" | "primary" | "finance" | "amber";
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasMissing = fields.some(([, v]) => v === "—");

  const toneRing =
    tone === "primary"
      ? "border-primary/40 bg-primary/5"
      : tone === "finance"
        ? "border-success/30 bg-success/5"
        : tone === "amber"
          ? "border-warning/30 bg-warning/5"
          : "border-border bg-card";

  return (
    <div className={cn("overflow-hidden rounded-lg border transition-colors", toneRing)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/40"
      >
        <Icon className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{title}</div>
          {subtitle && (
            <div className="truncate font-mono text-[11px] text-muted-foreground">{subtitle}</div>
          )}
        </div>
        {hasMissing && (
          <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 font-mono text-[10px] text-warning">
            incomplete
          </span>
        )}
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open && fields.length > 0 && (
        <div className="grid gap-1.5 border-t border-border/60 bg-muted/20 px-3 py-2.5 sm:grid-cols-2">
          {fields.map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                {k}
              </span>
              <span
                className={cn(
                  "truncate font-mono text-xs",
                  v === "—" ? "text-warning" : "text-foreground",
                )}
              >
                {v}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  label,
  count,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 px-0.5">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span className="rounded-full bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export function EventObjectPanel({
  files,
  doc: propDoc,
  open,
  onOpenChange,
}: {
  files: EventFile[];
  doc?: UefDocument;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const doc: UefDocument = useMemo(
    () => propDoc ?? buildUefDocument(files),
    [propDoc, files],
  );
  const event = doc.events[0] as UefRecord | undefined;

  const members = (event?.members as UefRecord[] | undefined) ?? [];
  const schedule = (event?.schedule_items as UefRecord[] | undefined) ?? [];
  const ledger = (event?.ledger_items as UefRecord[] | undefined) ?? [];
  const venue = event?.venue as UefRecord | undefined;
  const customer = event?.customer as UefRecord | undefined;
  const contacts = (customer?.contacts as UefRecord[] | undefined) ?? [];
  const leads = doc.leads ?? [];
  const setlists = doc.setlists ?? [];

  const ledgerTotal = ledger.reduce(
    (sum, l) => sum + (typeof l.amount === "number" ? (l.amount as number) : 0),
    0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[86vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Boxes className="size-5 text-primary" />
            Event Object
          </DialogTitle>
          <DialogDescription>
            The canonical event assembled from staged artifacts — click any node to expand
            its resolved fields.
          </DialogDescription>
        </DialogHeader>

        {!event ? (
          <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">
            Stage some artifacts to assemble an event object.
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {/* Hero */}
            <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-4">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                <Sparkles className="size-3.5" /> EVENT · {String(event.status ?? "DRAFT")}
              </div>
              <h2 className="mt-1 font-display text-xl font-semibold text-foreground">
                {String(event.title ?? "Untitled Event")}
              </h2>
              <div className="mt-2 flex flex-wrap gap-4 font-mono text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" />
                  {event.event_date ? String(event.event_date) : "no date resolved"}
                </span>
                {venue && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5" />
                    {String(venue.name ?? "venue")}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-success">
                  <Coins className="size-3.5" />
                  {ledgerTotal.toLocaleString()} {String(event.currency ?? "USD")}
                </span>
              </div>
            </div>

            {/* Summary chips */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Stat label="members" value={members.length} />
              <Stat label="schedule" value={schedule.length} />
              <Stat label="ledger" value={ledger.length} />
              <Stat label="contacts" value={contacts.length} />
              <Stat label="leads" value={leads.length} />
              <Stat label="setlists" value={setlists.length} />
            </div>

            {venue && (
              <Section icon={MapPin} label="Venue" count={1}>
                <EntityNode
                  icon={MapPin}
                  title={String(venue.name ?? "Venue")}
                  tone="primary"
                  fields={fieldEntries(venue)}
                />
              </Section>
            )}

            <Section icon={Users} label="Members" count={members.length}>
              {members.map((m, i) => (
                <EntityNode
                  key={i}
                  icon={UserRound}
                  title={`${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "Member"}
                  subtitle={String(m.position ?? "")}
                  fields={fieldEntries(m)}
                />
              ))}
            </Section>

            <Section icon={CalendarDays} label="Schedule" count={schedule.length}>
              {schedule.map((s, i) => (
                <EntityNode
                  key={i}
                  icon={CalendarDays}
                  title={String(s.name ?? "Schedule item")}
                  subtitle={s.start_time ? String(s.start_time) : undefined}
                  fields={fieldEntries(s)}
                />
              ))}
            </Section>

            <Section icon={Coins} label="Ledger" count={ledger.length}>
              {ledger.map((l, i) => (
                <EntityNode
                  key={i}
                  icon={Coins}
                  tone="finance"
                  title={String(l.description ?? "Ledger item")}
                  subtitle={`${l.type ?? ""} · ${l.amount ?? 0} ${l.currency ?? ""}`}
                  fields={fieldEntries(l)}
                />
              ))}
            </Section>

            <Section icon={Contact2} label="Contacts" count={contacts.length}>
              {contacts.map((c, i) => (
                <EntityNode
                  key={i}
                  icon={Contact2}
                  title={String(c.name ?? "Contact")}
                  fields={fieldEntries(c)}
                />
              ))}
            </Section>

            <Section icon={Sparkles} label="Leads" count={leads.length}>
              {leads.map((l, i) => (
                <EntityNode
                  key={i}
                  icon={Sparkles}
                  tone="amber"
                  title={String(l.name ?? "Lead")}
                  subtitle={l.event_date ? String(l.event_date) : undefined}
                  fields={fieldEntries(l)}
                />
              ))}
            </Section>

            <Section icon={ListMusic} label="Setlists" count={setlists.length}>
              {setlists.map((s, i) => (
                <EntityNode
                  key={i}
                  icon={ListMusic}
                  title={String(s.title ?? "Setlist")}
                  fields={fieldEntries(s)}
                />
              ))}
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="font-mono text-lg font-semibold text-foreground">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
