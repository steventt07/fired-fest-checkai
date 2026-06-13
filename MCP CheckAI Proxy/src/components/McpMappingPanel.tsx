import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Network, ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryStyles } from "@/lib/ingest-data";
import { UEF_MAPPING, INGESTION_PATHS } from "@/lib/mcp-mapping";

export function McpMappingPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Network className="size-5 text-primary" />
            UEF → MCP tool mapping
          </DialogTitle>
          <DialogDescription>
            Which Soundcheck MCP tool writes each Universal Event Format entity, and
            the platform record it becomes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto pr-1">
          {/* Field-by-field map */}
          <section>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              field-by-field map
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-[12px]">
                <thead className="bg-muted/40 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">UEF entity</th>
                    <th className="px-3 py-2 font-medium">MCP tool</th>
                    <th className="px-3 py-2 font-medium">Path C commit</th>
                    <th className="px-3 py-2 font-medium">Platform record</th>
                  </tr>
                </thead>
                <tbody>
                  {UEF_MAPPING.map((row) => (
                    <tr key={row.entity} className="border-t border-border align-top">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {row.category && (
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide",
                                categoryStyles[row.category],
                              )}
                            >
                              {row.category}
                            </span>
                          )}
                          <span className="font-mono font-medium text-foreground">
                            {row.entity}
                          </span>
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {row.uefPath}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground/80">
                          {row.fields}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-primary">
                        {row.tool}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                        {row.commitVia ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-foreground">
                        {row.record}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Three paths */}
          <section>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              three ways UEF data reaches the platform
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {INGESTION_PATHS.map((path) => (
                <div
                  key={path.id}
                  className={cn(
                    "rounded-lg border p-3",
                    path.primary
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-muted/20",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded bg-foreground/10 font-mono text-[11px] font-bold">
                      {path.id}
                    </span>
                    <span className="font-display text-sm font-semibold">
                      {path.name}
                    </span>
                    {path.primary && (
                      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-primary">
                        <CheckCircle2 className="size-3" /> active
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{path.when}</p>
                  <ol className="mt-2.5 space-y-1.5">
                    {path.steps.map((step, i) => (
                      <li key={step.tool} className="flex items-start gap-2 text-[11px]">
                        <span className="mt-0.5 font-mono text-[9px] text-muted-foreground/60">
                          {i + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="font-mono text-primary">{step.tool}</span>
                          <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground">
                            <ArrowRight className="size-3 shrink-0" />
                            {step.detail}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
