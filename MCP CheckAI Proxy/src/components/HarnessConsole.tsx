import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ShieldCheck,
  ClipboardCheck,
  PackageOpen,
  Siren,
  Play,
  Bot,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  CircleDot,
  HandHelping,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { guardrails } from "@/lib/harness/guardrails";
import { checkpoints } from "@/lib/harness/checkpoints";
import { AGENT_CHOICES } from "@/lib/harness/catalog";
import {
  runHarness,
  replayFromCheckpoint,
  resolveEscalation,
} from "@/lib/harness/harness.functions";
import { buildSeedFiles } from "@/lib/harness/seed";
import type { EventFile } from "@/lib/ingest-data";
import type {
  HarnessRun,
  CheckpointResult,
  GuardrailResult,
  Alarm,
  Severity,
  MaterialFile,
} from "@/lib/harness/types";

const SEVERITY_TONE: Record<Severity, string> = {
  info: "text-info",
  warning: "text-warning",
  critical: "text-destructive",
};

export function HarnessConsole({ files }: { files: EventFile[] }) {
  const run = useServerFn(runHarness);
  const replay = useServerFn(replayFromCheckpoint);
  const resolve = useServerFn(resolveEscalation);

  const [agentId, setAgentId] = useState(AGENT_CHOICES[0].id);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<HarnessRun | null>(null);
  const [replayed, setReplayed] = useState<CheckpointResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string | null>(null);
  const [usedSeed, setUsedSeed] = useState(false);

  const handleRun = useCallback(async () => {
    setBusy(true);
    setError(null);
    setReplayed(null);
    setResolution(null);
    const staged: MaterialFile[] = files.map((f) => ({
      id: f.id,
      name: f.name,
      category: f.category,
      content: f.content ?? "",
    }));
    const seeded = staged.length === 0;
    setUsedSeed(seeded);
    const payload = seeded ? buildSeedFiles() : staged;
    try {
      const res = await run({ data: { files: payload, agentId } });
      if (res.ok) setResult(JSON.parse(res.runJson) as HarnessRun);
      else setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }, [run, agentId, files]);

  const handleReplay = useCallback(
    async (fromOrdinal: number) => {
      if (!result) return;
      setError(null);
      const res = await replay({ data: { runId: result.id, fromOrdinal } });
      if (res.ok) setReplayed(res.checkpoints);
      else setError(res.error);
    },
    [replay, result],
  );

  const handleResolve = useCallback(
    async (approve: boolean) => {
      if (!result) return;
      const res = await resolve({ data: { runId: result.id, approve } });
      setResolution(
        res.status === "passed"
          ? "Human approved — output committed."
          : "Human rejected — run blocked and held for review.",
      );
    },
    [resolve, result],
  );

  const activeAgent = AGENT_CHOICES.find((a) => a.id === agentId)!;

  return (
    <section className="rounded-xl border border-border bg-card/40 p-5">
      {/* Console header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold tracking-tight">
            Agent Harness
          </h2>
          <p className="font-mono text-[11px] text-muted-foreground">
            guardrails · checkpoints · material I/O · alarms
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
            <Bot className="size-4 text-primary" />
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              disabled={busy}
              className="bg-transparent font-mono text-xs outline-none"
            >
              {AGENT_CHOICES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleRun} disabled={busy} className="gap-2">
            <Play className="size-4" />
            {busy ? "Running…" : "Run governed agent"}
          </Button>
        </div>
      </div>

      {usedSeed && result && (
        <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-[11px] text-muted-foreground">
          No files staged — ran on built-in demo material. Stage files above to govern your
          own input.
        </p>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Run banner */}
      {result && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-5 py-4">
          <StatusBadge status={result.status} />
          <Meta label="Worker" value={activeAgent.label} />
          <Meta label="Model" value={result.model} mono />
          <Meta label="Stage" value={result.currentStage} mono />
          <Meta label="Attempts" value={String(result.attempts)} mono />
          <Meta label="Input" value={result.inputSummary} mono />
          {result.output && (
            <>
              <Meta label="Records" value={String(result.output.recordCount)} mono />
              <Meta label="Confidence" value={result.output.confidence.toFixed(2)} mono />
            </>
          )}
        </div>
      )}

      {/* HITL escalation gate */}
      {result?.escalation && !resolution && (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-5 py-4">
          <div className="flex items-center gap-2 font-semibold text-warning">
            <HandHelping className="size-4" /> Human-in-the-loop escalation
          </div>
          <p className="mt-1.5 text-sm text-foreground/90">{result.escalation.reason}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => handleResolve(true)} className="gap-1.5">
              <CheckCircle2 className="size-4" /> Approve &amp; commit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleResolve(false)}
              className="gap-1.5"
            >
              <XCircle className="size-4" /> Reject &amp; block
            </Button>
          </div>
        </div>
      )}
      {resolution && (
        <div className="mb-4 rounded-md border border-border bg-muted px-4 py-3 text-sm">
          {resolution}
        </div>
      )}

      {/* Four-pillar grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Quadrant
          icon={<ShieldCheck className="size-4" />}
          title="Guardrails"
          subtitle="Declared constraints on agent behavior"
        >
          <div className="space-y-2">
            {guardrails.map((g) => {
              const r = result?.guardrails.find((x) => x.id === g.id);
              return <GuardrailRow key={g.id} guardrail={g} result={r} />;
            })}
          </div>
        </Quadrant>

        <Quadrant
          icon={<ClipboardCheck className="size-4" />}
          title="Checkpoints"
          subtitle="Persisted evaluations · replay from any point"
        >
          <div className="space-y-2">
            {checkpoints.map((cp) => {
              const r = result?.checkpoints.find((x) => x.id === cp.id);
              const rr = replayed?.find((x) => x.id === cp.id);
              return (
                <CheckpointRow
                  key={cp.id}
                  ordinal={cp.ordinal}
                  label={cp.label}
                  criteria={cp.criteria}
                  result={rr ?? r}
                  replayedTone={Boolean(rr)}
                  canReplay={Boolean(result)}
                  onReplay={() => handleReplay(cp.ordinal)}
                />
              );
            })}
          </div>
          {replayed && (
            <p className="mt-3 font-mono text-[11px] text-info">
              Replayed {replayed.length} checkpoint(s) from the persisted snapshot — the agent
              did not re-run.
            </p>
          )}
        </Quadrant>

        <Quadrant
          icon={<PackageOpen className="size-4" />}
          title="Material"
          subtitle="Clean interface for work in and out"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                In
              </div>
              <div className="mt-1.5 text-sm">{result?.inputSummary ?? "—"}</div>
            </div>
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Out
              </div>
              <div className="mt-1.5 text-sm">
                {result?.output
                  ? `${result.output.recordCount} records · conf ${result.output.confidence.toFixed(2)}`
                  : result
                    ? "no output emitted"
                    : "—"}
              </div>
            </div>
          </div>
          {result?.output && (
            <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] leading-relaxed">
              {JSON.stringify(result.output.doc, null, 2)}
            </pre>
          )}
        </Quadrant>

        <Quadrant
          icon={<Siren className="size-4" />}
          title="Alarms"
          subtitle="Named alerts with recommended actions"
        >
          {result ? (
            result.alarms.length ? (
              <div className="space-y-2">
                {result.alarms.map((a, i) => (
                  <AlarmRow key={`${a.type}-${i}`} alarm={a} />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">
                <CheckCircle2 className="size-4" /> No alarms raised — clean run.
              </div>
            )
          ) : (
            <Empty />
          )}
        </Quadrant>
      </div>

      {!result && !busy && (
        <p className="mt-6 text-center font-mono text-xs text-muted-foreground">
          Run the governed agent on your staged files. Swap the worker and re-run to prove the
          harness is agent-agnostic.
        </p>
      )}
    </section>
  );
}

// ── Presentation helpers ──────────────────────────────────────────────────────

function Quadrant({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <div>
          <h3 className="font-display text-sm font-semibold tracking-tight">{title}</h3>
          <p className="font-mono text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function statusIcon(passed: boolean | undefined) {
  if (passed === undefined) return <CircleDot className="size-4 text-muted-foreground/50" />;
  return passed ? (
    <CheckCircle2 className="size-4 text-success" />
  ) : (
    <XCircle className="size-4 text-destructive" />
  );
}

function GuardrailRow({
  guardrail,
  result,
}: {
  guardrail: { id: string; description: string; phase: string; severity: Severity };
  result?: GuardrailResult;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border bg-background/60 px-3 py-2">
      {statusIcon(result?.passed)}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">{guardrail.id}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
            {guardrail.phase}
          </span>
          <span className={cn("font-mono text-[10px] uppercase", SEVERITY_TONE[guardrail.severity])}>
            {guardrail.severity}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{guardrail.description}</p>
        {result?.detail && <p className="mt-1 text-xs text-destructive">{result.detail}</p>}
      </div>
    </div>
  );
}

function CheckpointRow({
  ordinal,
  label,
  criteria,
  result,
  replayedTone,
  canReplay,
  onReplay,
}: {
  ordinal: number;
  label: string;
  criteria: string;
  result?: CheckpointResult;
  replayedTone: boolean;
  canReplay: boolean;
  onReplay: () => void;
}) {
  const statusTone =
    result?.status === "pass"
      ? "text-success"
      : result?.status === "fail"
        ? "text-destructive"
        : result?.status === "warn"
          ? "text-warning"
          : "text-muted-foreground/50";
  return (
    <div
      className={cn(
        "rounded-md border bg-background/60 px-3 py-2",
        replayedTone ? "border-info/40" : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded bg-muted font-mono text-[10px]">
          {ordinal}
        </span>
        <span className="text-xs font-medium">{label}</span>
        <span className={cn("ml-auto font-mono text-[10px] uppercase", statusTone)}>
          {result?.status ?? "pending"}
        </span>
        {canReplay && (
          <button
            type="button"
            onClick={onReplay}
            className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
          >
            replay →
          </button>
        )}
      </div>
      <p className="mt-1 pl-7 text-xs text-muted-foreground">{criteria}</p>
      {result?.evidence && (
        <pre className="mt-1 ml-7 overflow-x-auto font-mono text-[10px] text-foreground/70">
          {JSON.stringify(result.evidence)}
        </pre>
      )}
    </div>
  );
}

function AlarmRow({ alarm }: { alarm: Alarm }) {
  return (
    <div className="rounded-md border border-border bg-background/60 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Siren className={cn("size-3.5", SEVERITY_TONE[alarm.severity])} />
        <span className="font-mono text-xs font-medium">{alarm.type}</span>
        <span className={cn("ml-auto font-mono text-[10px] uppercase", SEVERITY_TONE[alarm.severity])}>
          {alarm.severity}
        </span>
      </div>
      <p className="mt-1 text-xs text-foreground/90">{alarm.message}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">→ {alarm.recommendedAction}</p>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="leading-tight">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("text-sm", mono && "font-mono text-xs")}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: HarnessRun["status"] }) {
  const tone: Record<HarnessRun["status"], string> = {
    running: "bg-muted text-muted-foreground",
    passed: "bg-success/15 text-success border-success/30",
    failed: "bg-destructive/15 text-destructive border-destructive/30",
    escalated: "bg-warning/15 text-warning border-warning/30",
    blocked: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wider",
        tone[status],
      )}
    >
      {status}
    </span>
  );
}

function Empty() {
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-6 text-center font-mono text-xs text-muted-foreground">
      run the agent to populate
    </div>
  );
}
