import { Fragment, useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  GitCompare,
  ChevronRight,
  Loader2,
  Play,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { extractUefDocument } from "@/lib/extract.functions";
import { AGENT_CHOICES } from "@/lib/harness/catalog";
import { validateUefDocument, type UefDocument } from "@/lib/uef";
import type { EventFile } from "@/lib/ingest-data";

type RunStatus = "queued" | "running" | "done" | "error";

type ModelRun = {
  id: string;
  label: string;
  model: string;
  status: RunStatus;
  metrics: Record<string, string | number>;
  details: Record<string, string[]>;
  ms?: number;
  doc?: UefDocument;
  error?: string;
};

const METRIC_ROWS: { key: string; label: string; expandable?: boolean }[] = [
  { key: "eventTitle", label: "Event title" },
  { key: "eventDate", label: "Event date" },
  { key: "members", label: "Members", expandable: true },
  { key: "schedule", label: "Schedule items", expandable: true },
  { key: "ledger", label: "Ledger items", expandable: true },
  { key: "leads", label: "Leads", expandable: true },
  { key: "setlists", label: "Setlists", expandable: true },
  { key: "errors", label: "Validation errors", expandable: true },
  { key: "warnings", label: "Validation warnings", expandable: true },
];

const rec = (v: unknown) => (v ?? {}) as Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));

/** Human-readable label for a list entry so values can be diffed line by line. */
function labelItem(key: string, item: unknown): string {
  const o = rec(item);
  switch (key) {
    case "members":
      return [str(o.name), o.role ? `(${str(o.role)})` : ""].filter(Boolean).join(" ");
    case "schedule": {
      const time = str(o.start_time ?? o.time);
      const title = str(o.title ?? o.name ?? o.activity);
      return [time, title].filter(Boolean).join(" · ");
    }
    case "ledger": {
      const desc = str(o.description ?? o.name ?? o.label);
      const amt = o.amount ?? o.total;
      return [desc, amt != null ? str(amt) : ""].filter(Boolean).join(" · ");
    }
    case "leads":
      return str(o.name ?? o.contact_name ?? o.company);
    case "setlists":
      return str(o.name ?? o.title);
    default:
      return str(item);
  }
}

function summarize(doc: UefDocument): {
  metrics: Record<string, string | number>;
  details: Record<string, string[]>;
} {
  const event = doc.events[0] as Record<string, unknown> | undefined;
  const report = validateUefDocument(doc);
  const members = (event?.members as unknown[] | undefined) ?? [];
  const schedule = (event?.schedule_items as unknown[] | undefined) ?? [];
  const ledger = (event?.ledger_items as unknown[] | undefined) ?? [];
  const leads = doc.leads ?? [];
  const setlists = doc.setlists ?? [];

  return {
    metrics: {
      eventTitle: String(event?.title ?? "—"),
      eventDate: String(event?.event_date ?? "—"),
      members: members.length,
      schedule: schedule.length,
      ledger: ledger.length,
      leads: leads.length,
      setlists: setlists.length,
      errors: report.counts.error,
      warnings: report.counts.warn,
    },
    details: {
      members: members.map((m) => labelItem("members", m)),
      schedule: schedule.map((s) => labelItem("schedule", s)),
      ledger: ledger.map((l) => labelItem("ledger", l)),
      leads: leads.map((l) => labelItem("leads", l)),
      setlists: setlists.map((s) => labelItem("setlists", s)),
      errors: report.records.flatMap((r) =>
        r.issues
          .filter((i) => i.severity === "error")
          .map((i) => `${r.label}: ${i.message}`),
      ),
      warnings: report.records.flatMap((r) =>
        r.issues
          .filter((i) => i.severity === "warn")
          .map((i) => `${r.label}: ${i.message}`),
      ),
    },
  };
}

const STATUS_META: Record<RunStatus, { label: string; tone: string; icon: React.ReactNode }> = {
  queued: {
    label: "Queued",
    tone: "text-muted-foreground",
    icon: <Clock className="size-3.5" />,
  },
  running: {
    label: "Extracting…",
    tone: "text-info",
    icon: <Loader2 className="size-3.5 animate-spin" />,
  },
  done: {
    label: "Complete",
    tone: "text-success",
    icon: <CheckCircle2 className="size-3.5" />,
  },
  error: {
    label: "Failed",
    tone: "text-destructive",
    icon: <XCircle className="size-3.5" />,
  },
};

export function ModelComparisonDialog({
  files,
  open,
  onOpenChange,
}: {
  files: EventFile[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const extract = useServerFn(extractUefDocument);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<ModelRun[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const update = useCallback((id: string, patch: Partial<ModelRun>) => {
    setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    setRuns(
      AGENT_CHOICES.map((a) => ({
        id: a.id,
        label: a.label,
        model: a.model,
        status: "queued" as RunStatus,
        metrics: {},
        details: {},
      })),
    );

    const payload = files.map((f) => ({
      id: f.id,
      name: f.name,
      category: f.category,
      content: f.content ?? "",
    }));

    // Run every model in parallel — each call is fully isolated, so one model
    // failing or timing out never affects the others. Cards update live as each
    // resolves on its own.
    await Promise.all(
      AGENT_CHOICES.map(async (agent) => {
        update(agent.id, { status: "running" });
        const started = performance.now();
        try {
          const res = await extract({ data: { files: payload, model: agent.model } });
          const ms = Math.round(performance.now() - started);
          if (!res) {
            update(agent.id, {
              status: "error",
              error: "No response from the extraction service (it may have timed out).",
              ms,
            });
            return;
          }
          if (!res.ok) {
            update(agent.id, { status: "error", error: res.error, ms });
            return;
          }
          const doc = JSON.parse(res.docJson) as UefDocument;
          const { metrics, details } = summarize(doc);
          update(agent.id, { status: "done", metrics, details, doc, ms });
        } catch (e) {
          update(agent.id, {
            status: "error",
            error: e instanceof Error ? e.message : "Extraction failed",
            ms: Math.round(performance.now() - started),
          });
        }
      }),
    );


    setBusy(false);
  }, [extract, files, update]);

  const done = runs.filter((r) => r.status === "done");
  const finished = runs.length > 0 && runs.every((r) => r.status === "done" || r.status === "error");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[86vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="size-4 text-primary" /> Model comparison
          </DialogTitle>
          <DialogDescription>
            Run the same extraction pipeline through every model on your {files.length} staged
            file{files.length === 1 ? "" : "s"} and compare the parsed output side by side.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <Button onClick={run} disabled={busy || files.length === 0} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {busy ? "Running…" : runs.length > 0 ? "Re-run comparison" : "Run comparison"}
          </Button>
          {files.length === 0 && (
            <span className="font-mono text-xs text-muted-foreground">
              Stage files first to compare.
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {/* Live per-model status */}
          {runs.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {runs.map((r) => {
                const meta = STATUS_META[r.status];
                return (
                  <div
                    key={r.id}
                    className={cn(
                      "rounded-md border bg-card px-3 py-2.5 transition-colors",
                      r.status === "done"
                        ? "border-success/30"
                        : r.status === "error"
                          ? "border-destructive/30"
                          : r.status === "running"
                            ? "border-info/40"
                            : "border-border",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={meta.tone}>{meta.icon}</span>
                      <span className="truncate font-display text-xs font-semibold">
                        {r.label}
                      </span>
                      <span
                        className={cn(
                          "ml-auto font-mono text-[10px] uppercase tracking-wider",
                          meta.tone,
                        )}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                      <span className="truncate">{r.model}</span>
                      {r.ms !== undefined && <span>{(r.ms / 1000).toFixed(1)}s</span>}
                    </div>
                    {/* Progress shimmer while running */}
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          r.status === "running"
                            ? "w-2/3 animate-pulse bg-info"
                            : r.status === "done"
                              ? "w-full bg-success"
                              : r.status === "error"
                                ? "w-full bg-destructive"
                                : "w-0",
                        )}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Comparison table — fills in as models complete */}
          {done.length > 0 && (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky top-0 bg-background py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Metric
                  </th>
                  {done.map((r) => (
                    <th
                      key={r.id}
                      className="sticky top-0 bg-background px-3 py-2 text-left font-display text-xs font-semibold"
                    >
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRIC_ROWS.map((row) => {
                  const values = done.map((r) => r.metrics[row.key]);
                  const differs =
                    done.length > 1 && new Set(values.map(String)).size > 1;
                  const canExpand =
                    !!row.expandable &&
                    done.some((r) => (r.details[row.key]?.length ?? 0) > 0);
                  const isOpen = canExpand && !!expanded[row.key];
                  // Items that don't appear in every model — these are the real disagreements.
                  const counts = new Map<string, number>();
                  done.forEach((r) =>
                    (r.details[row.key] ?? []).forEach((v) =>
                      counts.set(v, (counts.get(v) ?? 0) + 1),
                    ),
                  );
                  const isUnique = (v: string) => counts.get(v) !== done.length;
                  return (
                    <Fragment key={row.key}>
                      <tr
                        className={cn(
                          "border-t border-border",
                          differs && "bg-warning/5",
                          canExpand && "cursor-pointer hover:bg-muted/40",
                        )}
                        onClick={
                          canExpand
                            ? () =>
                                setExpanded((p) => ({ ...p, [row.key]: !p[row.key] }))
                            : undefined
                        }
                      >
                        <td className="py-2 font-mono text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            {canExpand && (
                              <ChevronRight
                                className={cn(
                                  "size-3 transition-transform",
                                  isOpen && "rotate-90",
                                )}
                              />
                            )}
                            {row.label}
                          </span>
                          {differs && (
                            <span className="ml-1.5 rounded bg-warning/15 px-1 py-0.5 font-mono text-[9px] uppercase text-warning">
                              differs
                            </span>
                          )}
                        </td>
                        {done.map((r) => (
                          <td
                            key={r.id}
                            className={cn(
                              "px-3 py-2 font-mono text-xs",
                              differs ? "font-semibold text-foreground" : "text-foreground/80",
                            )}
                          >
                            {String(r.metrics[row.key] ?? "—")}
                          </td>
                        ))}
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-border/50 bg-muted/20">
                          <td className="py-2 pl-4 align-top font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            values
                          </td>
                          {done.map((r) => {
                            const items = r.details[row.key] ?? [];
                            return (
                              <td key={r.id} className="px-3 py-2 align-top">
                                {items.length === 0 ? (
                                  <span className="font-mono text-xs text-muted-foreground">—</span>
                                ) : (
                                  <ul className="space-y-0.5">
                                    {items.map((v, i) => (
                                      <li
                                        key={`${v}-${i}`}
                                        className={cn(
                                          "font-mono text-xs leading-snug",
                                          isUnique(v)
                                            ? "rounded bg-warning/10 px-1 text-warning"
                                            : "text-foreground/80",
                                        )}
                                      >
                                        {v}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>

            </table>
          )}

          {finished && done.length > 1 && (
            <p className="font-mono text-[11px] text-muted-foreground">
              Rows marked <span className="text-warning">differs</span> are where the models
              disagreed on the same input.
            </p>
          )}

          {runs
            .filter((r) => r.status === "error")
            .map((r) => (
              <div
                key={r.id}
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  <strong>{r.label}</strong>: {r.error}
                </span>
              </div>
            ))}

          {runs.length === 0 && (
            <p className="py-10 text-center font-mono text-xs text-muted-foreground">
              Run the comparison to see how each model parses the same files.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
