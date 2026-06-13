import { useMemo, useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronRight,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  buildUefDocument,
  validateUefDocument,
  type UefDocument,
  type ValidationRecord,
  type ValidationSeverity,
} from "@/lib/uef";
import type { EventFile } from "@/lib/ingest-data";

const SEVERITY_META: Record<
  ValidationSeverity,
  { icon: React.ComponentType<{ className?: string }>; className: string; label: string }
> = {
  ok: { icon: CheckCircle2, className: "text-success", label: "valid" },
  warn: { icon: AlertTriangle, className: "text-warning", label: "warnings" },
  error: { icon: XCircle, className: "text-destructive", label: "errors" },
};

function SummaryStat({
  severity,
  value,
}: {
  severity: ValidationSeverity;
  value: number;
}) {
  const m = SEVERITY_META[severity];
  const Icon = m.icon;
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <Icon className={cn("size-5", m.className)} />
      <div>
        <div className="font-mono text-lg font-semibold text-foreground">{value}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {m.label}
        </div>
      </div>
    </div>
  );
}

function RecordRow({ rec }: { rec: ValidationRecord }) {
  const [open, setOpen] = useState(rec.severity === "error");
  const m = SEVERITY_META[rec.severity];
  const Icon = m.icon;
  const hasIssues = rec.issues.length > 0;

  return (
    <div className="border-b border-border/60 last:border-0">
      <button
        type="button"
        disabled={!hasIssues}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
          hasIssues && "hover:bg-muted/50",
        )}
      >
        <Icon className={cn("size-4 shrink-0", m.className)} />
        <span className="w-[104px] shrink-0 rounded-full bg-muted px-2 py-0.5 text-center font-mono text-[10px] font-semibold text-muted-foreground">
          {rec.entity}
        </span>
        <span className="flex-1 truncate text-[13px] text-foreground">{rec.label}</span>
        <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground/70 sm:block">
          {rec.path}
        </span>
        {hasIssues && (
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
        )}
      </button>
      {open && hasIssues && (
        <div className="space-y-1 px-4 pb-3 pl-11">
          {rec.issues.map((iss, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-md px-2 py-1.5 text-xs",
                iss.severity === "error"
                  ? "bg-destructive/5 text-destructive"
                  : "bg-warning/5 text-warning",
              )}
            >
              <span className="font-mono">{iss.field}</span>
              <span className="text-muted-foreground">— {iss.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ValidationPanel({
  files,
  doc,
  open,
  onOpenChange,
}: {
  files: EventFile[];
  doc?: UefDocument;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const report = useMemo(
    () => validateUefDocument(doc ?? buildUefDocument(files)),
    [doc, files],
  );
  const [filter, setFilter] = useState<ValidationSeverity | "all">("all");

  const visible =
    filter === "all"
      ? report.records
      : report.records.filter((r) => r.severity === filter);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[86vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <ShieldCheck className="size-5 text-primary" />
            Validation interface
          </DialogTitle>
          <DialogDescription>
            Every UEF record checked against the schema's required and
            recommended fields before ingestion.
          </DialogDescription>
        </DialogHeader>

        {files.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">
            Stage and parse artifacts to validate them.
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="grid flex-1 grid-cols-3 gap-2">
                <SummaryStat severity="ok" value={report.counts.ok} />
                <SummaryStat severity="warn" value={report.counts.warn} />
                <SummaryStat severity="error" value={report.counts.error} />
              </div>
              <div
                className={cn(
                  "shrink-0 rounded-lg px-4 py-2 text-center font-mono text-xs font-semibold",
                  report.valid
                    ? "bg-success/10 text-success"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                {report.valid ? "READY TO INGEST" : "BLOCKED"}
                <div className="mt-0.5 text-[10px] font-normal uppercase tracking-[0.14em] text-muted-foreground">
                  {report.counts.total} records
                </div>
              </div>
            </div>

            <div className="flex gap-1.5">
              {(["all", "error", "warn", "ok"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors",
                    filter === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
              {visible.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No records match this filter.
                </div>
              ) : (
                visible.map((rec) => <RecordRow key={rec.id} rec={rec} />)
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
