import { useMemo } from "react";
import { BarChart3 } from "lucide-react";

import type { PersistedFile } from "@/lib/generate.functions";
import { categoryStyles, type Category } from "@/lib/ingest-data";

type Bucket = { label: string; count: number };

function tally(files: PersistedFile[], key: (f: PersistedFile) => string): Bucket[] {
  const m = new Map<string, number>();
  for (const f of files) {
    const k = key(f) || "—";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

const ALL_CATEGORIES: Category[] = [
  "Workflow",
  "Assets",
  "Payments",
  "People",
  "Timeline",
  "Comms",
  "Outcomes",
  "Intake",
];

function BarRow({
  label,
  count,
  max,
  chipClass,
}: {
  label: string;
  count: number;
  max: number;
  chipClass?: string;
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 py-1">
      <span
        className={`w-28 shrink-0 truncate text-right text-[12px] font-medium ${
          chipClass ?? "text-muted-foreground"
        }`}
        title={label}
      >
        {label}
      </span>
      <div className="relative h-4 flex-1 overflow-hidden rounded bg-muted">
        <div
          className="h-full rounded bg-primary/70"
          style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

function Section({
  title,
  buckets,
  catColors,
}: {
  title: string;
  buckets: Bucket[];
  catColors?: boolean;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div>
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {buckets.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data.</p>
      ) : (
        <div>
          {buckets.map((b) => (
            <BarRow
              key={b.label}
              label={b.label}
              count={b.count}
              max={max}
              chipClass={
                catColors
                  ? `rounded px-1.5 ${categoryStyles[b.label as Category] ?? "text-muted-foreground"}`
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DiversityDashboard({ files }: { files: PersistedFile[] }) {
  const byType = useMemo(
    () => tally(files, (f) => f.file_type.toUpperCase()),
    [files],
  );
  const byCategory = useMemo(() => {
    const t = tally(files, (f) => f.category_override ?? f.category);
    // Surface category gaps: include zero-count categories.
    const present = new Set(t.map((b) => b.label));
    for (const c of ALL_CATEGORIES) {
      if (!present.has(c)) t.push({ label: c, count: 0 });
    }
    return t;
  }, [files]);
  const byEvent = useMemo(() => tally(files, (f) => f.event_type), [files]);

  const reviewed = files.filter((f) => f.category_correct !== null).length;
  const overrides = files.filter((f) => f.category_override).length;
  const up = files.filter((f) => f.quality === "up").length;
  const down = files.filter((f) => f.quality === "down").length;

  return (
    <div className="space-y-5 overflow-y-auto p-1">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Total files", value: files.length },
          { label: "Reviewed", value: reviewed },
          { label: "Overrides", value: overrides },
          { label: "👍 / 👎", value: `${up} / ${down}` },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-border bg-muted/60 p-3"
          >
            <div className="text-lg font-bold text-foreground">{s.value}</div>
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-muted-foreground">
        <BarChart3 className="size-4 text-primary" />
        <span className="text-sm font-semibold">Breakdown</span>
      </div>

      <Section title="By category" buckets={byCategory} catColors />
      <Section title="By file type" buckets={byType} />
      <Section title="By event type" buckets={byEvent} />
    </div>
  );
}
