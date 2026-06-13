import { useMemo } from "react";
import { Boxes, Copy, FileJson } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  buildUefDocument,
  categoryToEntity,
  type UefDocument,
} from "@/lib/uef";
import type { EventFile } from "@/lib/ingest-data";

function CollectionCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="font-mono text-lg font-semibold text-foreground">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

export function UefPanel({
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
  const json = useMemo(() => JSON.stringify(doc, null, 2), [doc]);

  const event = doc.events[0] as Record<string, unknown> | undefined;
  const counts = {
    events: doc.events.length,
    members: (event?.members as unknown[] | undefined)?.length ?? 0,
    schedule: (event?.schedule_items as unknown[] | undefined)?.length ?? 0,
    ledger: (event?.ledger_items as unknown[] | undefined)?.length ?? 0,
    leads: doc.leads?.length ?? 0,
    setlists: doc.setlists?.length ?? 0,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[86vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Boxes className="size-5 text-primary" />
            Universal Event Format
          </DialogTitle>
          <DialogDescription>
            Staged artifacts transformed into one canonical UEF document
            (schema v{doc.schema_version}, target {doc.target_type}).
          </DialogDescription>
        </DialogHeader>

        {files.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">
            Stage some artifacts to see them parsed into UEF.
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <CollectionCount label="events" value={counts.events} />
              <CollectionCount label="members" value={counts.members} />
              <CollectionCount label="schedule" value={counts.schedule} />
              <CollectionCount label="ledger" value={counts.ledger} />
              <CollectionCount label="leads" value={counts.leads} />
              <CollectionCount label="setlists" value={counts.setlists} />
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                file → UEF entity mapping
              </div>
              <div className="flex flex-wrap gap-1.5">
                {files.map((f) => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px]"
                  >
                    <span className="max-w-[160px] truncate text-foreground">{f.name}</span>
                    <span className="text-muted-foreground/50">→</span>
                    <span className="text-primary">{categoryToEntity[f.category]}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-muted/40 px-3">
                <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <FileJson className="size-3.5" /> uef.json
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(json);
                    toast.success("UEF document copied");
                  }}
                >
                  <Copy className="size-3.5" /> Copy
                </Button>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto bg-card p-3 font-mono text-[12px] leading-5 text-foreground">
                {json}
              </pre>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
