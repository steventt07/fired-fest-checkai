import { Check, FileStack, Boxes, ShieldCheck, Rocket, Eye } from "lucide-react";

import { cn } from "@/lib/utils";

export type StageId = "stage" | "parse" | "validate" | "ingest";
export type StageStatus = "todo" | "active" | "done" | "error";

export type StageState = {
  id: StageId;
  label: string;
  hint: string;
  status: StageStatus;
  /** When set and the stage is done/error, a Review button opens the result. */
  reviewable?: boolean;
};

const ICONS: Record<StageId, React.ComponentType<{ className?: string }>> = {
  stage: FileStack,
  parse: Boxes,
  validate: ShieldCheck,
  ingest: Rocket,
};

export function PipelineStepper({
  stages,
  onSelect,
  onReview,
}: {
  stages: StageState[];
  onSelect?: (id: StageId) => void;
  onReview?: (id: StageId) => void;
}) {
  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto rounded-xl border border-border bg-card p-1.5 shadow-sm">
      {stages.map((s, i) => {
        const Icon = ICONS[s.id];
        const done = s.status === "done";
        const active = s.status === "active";
        const error = s.status === "error";
        const showReview =
          s.reviewable && (s.status === "done" || s.status === "error");
        return (
          <div key={s.id} className="flex flex-1 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelect?.(s.id)}
              className={cn(
                "group flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                active && "bg-primary/10",
                done && "hover:bg-muted/60",
                !active && !done && "hover:bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md border font-mono text-xs",
                  error
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : done
                      ? "border-success/40 bg-success/10 text-success"
                      : active
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border bg-muted/50 text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : <Icon className="size-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em]",
                    active || done || error ? "text-foreground" : "text-muted-foreground/70",
                  )}
                >
                  <span>0{i + 1}</span>
                  <span className="truncate">{s.label}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{s.hint}</div>
              </div>
              {showReview && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReview?.(s.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onReview?.(s.id);
                    }
                  }}
                  className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  <Eye className="size-3" />
                  Review
                </span>
              )}
            </button>

            {i < stages.length - 1 && (
              <div
                className={cn(
                  "h-px w-4 shrink-0 sm:w-6",
                  done ? "bg-success/50" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
