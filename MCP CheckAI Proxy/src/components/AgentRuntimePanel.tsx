import { useEffect, useRef } from "react";
import { Check, Terminal } from "lucide-react";

import { Panel } from "@/components/Panel";
import type { EtlStage, LogLine, Phase } from "@/lib/use-ingestion";

const ETL_BADGE: Record<EtlStage, { label: string; className: string }> = {
  extract: {
    label: "EXTRACT",
    className: "border-info/40 bg-info/10 text-info",
  },
  transform: {
    label: "TRANSFORM",
    className: "border-warning/40 bg-warning/10 text-warning dark:text-warning",
  },
  load: {
    label: "LOAD",
    className: "border-success/40 bg-success/10 text-success dark:text-success",
  },
};

function EtlBadge({ stage }: { stage: EtlStage }) {
  const b = ETL_BADGE[stage];
  return (
    <span
      className={`mr-2 inline-flex shrink-0 items-center rounded border px-1.5 py-0 text-[10px] font-semibold uppercase leading-[18px] tracking-wide ${b.className}`}
    >
      {b.label}
    </span>
  );
}

function Line({ line }: { line: LogLine }) {
  switch (line.kind) {
    case "command":
      return (
        <div className="text-foreground">
          {line.text.startsWith("--") ? null : (
            <span className="text-muted-foreground">$ </span>
          )}
          <span className="font-medium">{line.text}</span>
        </div>
      );
    case "step":
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          {line.etl && <EtlBadge stage={line.etl} />}
          <span className="text-primary">→</span>
          <span>
            {line.text}
            {line.accent && <span className="text-warning">{line.accent}</span>}
          </span>
          <Check className="size-3.5 text-success" strokeWidth={3} />
        </div>
      );
    case "label":
      return (
        <div className="flex items-center text-muted-foreground">
          {line.etl && <EtlBadge stage={line.etl} />}
          <span>{line.text}</span>
        </div>
      );
    case "toolcall":
      return (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {line.etl && <EtlBadge stage={line.etl} />}
          <span className="text-muted-foreground/50">↳</span>
          <span>
            <span className="text-muted-foreground/70">mcp.soundcheck.</span>
            <span className="font-medium text-primary">
              {line.text.replace("mcp.soundcheck.", "")}
            </span>{" "}
            <span className="text-info">{line.accent}</span>
          </span>
          <Check className="size-3.5 text-success" strokeWidth={3} />
        </div>
      );
    case "blank":
      return <div className="h-2" />;
    default:
      return null;
  }
}

export function AgentRuntimePanel({
  log,
  progress,
  phase,
  totalFiles,
}: {
  log: LogLine[];
  progress: number;
  phase: Phase;
  totalFiles: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [log, phase]);

  const showProgress = log.some((l) => l.kind === "progress");
  const lastProgressId = [...log].reverse().find((l) => l.kind === "progress")?.id;

  const statusLabel =
    phase === "running"
      ? "running"
      : phase === "done"
        ? "complete"
        : log.length > 0
          ? "ready"
          : "idle";

  const statusMeta = (
    <span className="inline-flex items-center gap-1.5 font-mono">
      <span
        className={`size-1.5 rounded-full ${
          phase === "running"
            ? "animate-pulse bg-success"
            : phase === "done" || log.length > 0
              ? "bg-success"
              : "bg-muted-foreground/40"
        }`}
      />
      {statusLabel}
    </span>
  );

  return (
    <Panel
      title="agent-runtime"
      icon={<Terminal className="size-4" />}
      meta={statusMeta}
    >
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto px-5 py-4 font-mono text-[13px] leading-7"
      >
        {log.length === 0 && (
          <div className="text-muted-foreground">
            <span className="text-muted-foreground/60">$ </span>
            <span className="animate-pulse">
              checkai ingest ./staged --via mcp:soundcheck
            </span>
          </div>
        )}
        {log.map((line) => {
          if (line.kind === "progress") {
            // Only the most recent progress bar tracks live progress; earlier
            // steps in the same session are frozen at 100%.
            const isActive = line.id === lastProgressId && phase === "running";
            const pct = isActive ? progress : 100;
            return (
              <div key={line.id} className="my-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {Math.round((pct / 100) * totalFiles)} / {totalFiles} files · {pct}%
                </div>
              </div>
            );
          }
          return <Line key={line.id} line={line} />;
        })}

        {phase === "running" && !showProgress && (
          <span className="inline-block h-4 w-2 animate-pulse bg-primary align-middle" />
        )}
      </div>
    </Panel>
  );
}