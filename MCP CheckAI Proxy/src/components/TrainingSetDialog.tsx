import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Database,
  Loader2,
  RefreshCw,
  FileText,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Layers,
  Download,
  ThumbsUp,
  ThumbsDown,
  Check,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listEventFiles,
  annotateEventFile,
  type PersistedFile,
} from "@/lib/generate.functions";
import {
  categoryStyles,
  eventFileFromGenerated,
  type Category,
  type EventFile,
} from "@/lib/ingest-data";
import { FilePreview } from "@/components/FilePreview";
import { DiversityDashboard } from "@/components/DiversityDashboard";
import {
  applyFilters,
  buildExportZip,
  downloadBlob,
  runKeyOf,
} from "@/lib/export-training-set";

const CATEGORIES: Category[] = [
  "Workflow",
  "Assets",
  "Payments",
  "People",
  "Timeline",
  "Comms",
  "Outcomes",
  "Intake",
];

type Run = { key: string; label: string; files: PersistedFile[] };
type EventGroup = { eventType: string; total: number; runs: Run[] };

function buildTree(files: PersistedFile[]): EventGroup[] {
  const byEvent = new Map<string, Map<string, PersistedFile[]>>();
  for (const f of files) {
    const ev = f.event_type || "Untitled";
    const rk = runKeyOf(f.created_at);
    if (!byEvent.has(ev)) byEvent.set(ev, new Map());
    const runs = byEvent.get(ev)!;
    if (!runs.has(rk)) runs.set(rk, []);
    runs.get(rk)!.push(f);
  }

  return Array.from(byEvent.entries()).map(([eventType, runsMap]) => {
    const runs: Run[] = Array.from(runsMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, runFiles]) => ({
        key,
        label: new Date(key).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }),
        files: runFiles,
      }));
    const total = runs.reduce((n, r) => n + r.files.length, 0);
    return { eventType, total, runs };
  });
}

const ALL = "__all__";

export function TrainingSetDialog({
  open: openProp,
  onOpenChange: onOpenChangeProp,
  hideTrigger,
  onLoadToWorkbench,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  onLoadToWorkbench?: (files: EventFile[]) => void;
} = {}) {
  const list = useServerFn(listEventFiles);
  const annotate = useServerFn(annotateEventFile);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setBaseOpen = onOpenChangeProp ?? setInternalOpen;
  const [files, setFiles] = useState<PersistedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<PersistedFile | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  // Export filters
  const [filterEvent, setFilterEvent] = useState<string>(ALL);
  const [filterCategory, setFilterCategory] = useState<string>(ALL);
  const [filterRun, setFilterRun] = useState<string>(ALL);
  const [exporting, setExporting] = useState(false);

  const tree = useMemo(() => buildTree(files), [files]);
  const eventTypes = useMemo(
    () => Array.from(new Set(files.map((f) => f.event_type))).sort(),
    [files],
  );
  const runs = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of files) {
      if (filterEvent !== ALL && f.event_type !== filterEvent) continue;
      const k = runKeyOf(f.created_at);
      if (!m.has(k))
        m.set(
          k,
          new Date(k).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        );
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [files, filterEvent]);

  const filtered = useMemo(
    () =>
      applyFilters(files, {
        eventType: filterEvent === ALL ? null : filterEvent,
        category: filterCategory === ALL ? null : filterCategory,
        runKey: filterRun === ALL ? null : filterRun,
      }),
    [files, filterEvent, filterCategory, filterRun],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await list();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFiles(res.files);
      const builtTree = buildTree(res.files);
      const firstEvent = builtTree[0];
      const firstRun = firstEvent?.runs[0];
      setExpandedEvents((prev) =>
        prev.size === 0 && firstEvent ? new Set([firstEvent.eventType]) : prev,
      );
      setExpandedRuns((prev) =>
        prev.size === 0 && firstEvent && firstRun
          ? new Set([`${firstEvent.eventType}::${firstRun.key}`])
          : prev,
      );
      setActive((prev) =>
        prev
          ? (res.files.find((f) => f.id === prev.id) ?? firstRun?.files[0] ?? null)
          : (firstRun?.files[0] ?? null),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [list]);

  const onOpenChange = (next: boolean) => {
    setBaseOpen(next);
    if (next) void load();
  };

  // When opened via controlled prop (sidebar nav), still refresh the data.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const toggleEvent = (ev: string) =>
    setExpandedEvents((prev) => {
      const n = new Set(prev);
      n.has(ev) ? n.delete(ev) : n.add(ev);
      return n;
    });

  const toggleRun = (id: string) =>
    setExpandedRuns((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // Apply an annotation locally + persist it.
  const applyAnnotation = useCallback(
    async (id: string, patch: Partial<PersistedFile>) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      );
      setActive((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
      const res = await annotate({
        data: {
          id,
          ...("category_override" in patch
            ? { category_override: patch.category_override }
            : {}),
          ...("category_correct" in patch
            ? { category_correct: patch.category_correct }
            : {}),
          ...("quality" in patch ? { quality: patch.quality } : {}),
        },
      });
      if (!res.ok) setError(res.error);
    },
    [annotate],
  );

  const runExport = useCallback(async () => {
    setExporting(true);
    setError(null);
    try {
      const blob = await buildExportZip(filtered);
      const parts = [
        filterEvent !== ALL ? filterEvent.replace(/\s+/g, "-") : "all",
        filterCategory !== ALL ? filterCategory : null,
      ].filter(Boolean);
      downloadBlob(blob, `training-set-${parts.join("-")}.zip`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [filtered, filterEvent, filterCategory]);

  const effectiveCat = (f: PersistedFile) =>
    (f.category_override ?? f.category) as Category;

  const loadIntoWorkbench = useCallback(
    (runFiles: PersistedFile[]) => {
      if (!onLoadToWorkbench) return;
      onLoadToWorkbench(
        runFiles.map((f) =>
          eventFileFromGenerated({
            name: f.name,
            category: (f.category_override ?? f.category) as Category,
            content: f.content,
          }),
        ),
      );
      onOpenChange(false);
    },
    [onLoadToWorkbench],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Database className="size-4" /> Training set
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="size-4 text-primary" /> Persisted training set
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {files.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto gap-1.5"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </DialogTitle>
          <DialogDescription>
            Browse, review, and export your synthetic training data.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Tabs defaultValue="files">
          <TabsList>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="dashboard">Diversity</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          {/* ---- Files + review ---- */}
          <TabsContent value="files">
            <div className="grid h-[58vh] grid-cols-1 gap-4 sm:grid-cols-[1fr_1.2fr]">
              <div className="min-h-0 overflow-y-auto rounded-lg border border-border">
                {loading && files.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" />
                  </div>
                ) : files.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                    No files yet — generate some to start building the training set.
                  </div>
                ) : (
                  <div className="py-1">
                    {tree.map((group) => {
                      const evOpen = expandedEvents.has(group.eventType);
                      return (
                        <div key={group.eventType}>
                          <button
                            type="button"
                            onClick={() => toggleEvent(group.eventType)}
                            className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition hover:bg-muted"
                          >
                            {evOpen ? (
                              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                            )}
                            {evOpen ? (
                              <FolderOpen className="size-4 shrink-0 text-primary" />
                            ) : (
                              <Folder className="size-4 shrink-0 text-primary" />
                            )}
                            <span className="flex-1 truncate text-[13px] font-semibold text-foreground">
                              {group.eventType}
                            </span>
                            <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                              {group.total}
                            </span>
                          </button>

                          {evOpen &&
                            group.runs.map((run) => {
                              const runId = `${group.eventType}::${run.key}`;
                              const runOpen = expandedRuns.has(runId);
                              return (
                                <div key={runId}>
                                  <div className="group flex w-full items-center gap-1.5 py-1 pl-7 pr-2 transition hover:bg-muted">
                                    <button
                                      type="button"
                                      onClick={() => toggleRun(runId)}
                                      className="flex flex-1 items-center gap-1.5 text-left"
                                    >
                                      {runOpen ? (
                                        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                                      ) : (
                                        <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                                      )}
                                      <Layers className="size-3.5 shrink-0 text-info" />
                                      <span className="flex-1 truncate text-[12px] text-muted-foreground">
                                        {run.label}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {run.files.length}
                                      </span>
                                    </button>
                                    {onLoadToWorkbench && (
                                      <button
                                        type="button"
                                        onClick={() => loadIntoWorkbench(run.files)}
                                        className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-primary opacity-0 transition hover:bg-primary/15 group-hover:opacity-100"
                                        title="Load this run into the workbench"
                                      >
                                        <Download className="size-3" /> Load
                                      </button>
                                    )}
                                  </div>


                                  {runOpen &&
                                    run.files.map((f) => {
                                      const isActive = active?.id === f.id;
                                      return (
                                        <button
                                          key={f.id}
                                          type="button"
                                          onClick={() => setActive(f)}
                                          className={`flex w-full items-center gap-2 py-1.5 pl-12 pr-2 text-left transition hover:bg-muted ${
                                            isActive ? "bg-primary/15/70" : ""
                                          }`}
                                        >
                                          {f.quality === "up" && (
                                            <ThumbsUp className="size-3 shrink-0 text-success" />
                                          )}
                                          {f.quality === "down" && (
                                            <ThumbsDown className="size-3 shrink-0 text-destructive" />
                                          )}
                                          <span className="font-mono text-[10px] font-bold uppercase text-muted-foreground">
                                            {f.file_type}
                                          </span>
                                          <span className="flex-1 truncate font-mono text-[12px] text-foreground">
                                            {f.name}
                                          </span>
                                          {f.category_override && (
                                            <span className="text-[9px] font-bold text-warning">
                                              ✎
                                            </span>
                                          )}
                                          <span
                                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                              categoryStyles[effectiveCat(f)] ??
                                              "bg-muted text-muted-foreground"
                                            }`}
                                          >
                                            {effectiveCat(f)}
                                          </span>
                                        </button>
                                      );
                                    })}
                                </div>
                              );
                            })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex min-h-0 flex-col rounded-lg border border-border bg-muted/50">
                {active ? (
                  <>
                    {/* Review / annotation toolbar */}
                    <div className="space-y-2 border-b border-border p-3">
                      <div className="flex items-center gap-2">
                        <FileText className="size-4 text-muted-foreground" />
                        <span className="truncate font-mono text-sm font-semibold text-foreground">
                          {active.name}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                          Category
                        </span>
                        <Select
                          value={effectiveCat(active)}
                          onValueChange={(v) =>
                            void applyAnnotation(active.id, {
                              category_override:
                                v === active.category ? null : (v as Category),
                              category_correct: v === active.category ? true : false,
                            })
                          }
                        >
                          <SelectTrigger className="h-7 w-36 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c} className="text-xs">
                                {c}
                                {c === active.category ? " (auto)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          variant={active.category_correct === true ? "default" : "outline"}
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() =>
                            void applyAnnotation(active.id, {
                              category_correct: true,
                              category_override: null,
                            })
                          }
                        >
                          <Check className="size-3.5" /> Correct
                        </Button>

                        <div className="ml-auto flex items-center gap-1">
                          <Button
                            variant={active.quality === "up" ? "default" : "outline"}
                            size="icon"
                            className="size-7"
                            onClick={() =>
                              void applyAnnotation(active.id, {
                                quality: active.quality === "up" ? null : "up",
                              })
                            }
                          >
                            <ThumbsUp className="size-3.5" />
                          </Button>
                          <Button
                            variant={active.quality === "down" ? "destructive" : "outline"}
                            size="icon"
                            className="size-7"
                            onClick={() =>
                              void applyAnnotation(active.id, {
                                quality: active.quality === "down" ? null : "down",
                              })
                            }
                          >
                            <ThumbsDown className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                      <FilePreview
                        name={active.name}
                        fileType={active.file_type}
                        content={active.content}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Select a file to preview and review it.
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ---- Diversity dashboard ---- */}
          <TabsContent value="dashboard">
            <div className="h-[58vh] overflow-y-auto rounded-lg border border-border p-3">
              <DiversityDashboard files={files} />
            </div>
          </TabsContent>

          {/* ---- Export ---- */}
          <TabsContent value="export">
            <div className="space-y-4 rounded-lg border border-border p-4">
              <p className="text-sm text-muted-foreground">
                Export the full training set or a filtered subset as a ZIP of files
                plus a <code className="text-xs">manifest.jsonl</code> with metadata
                and annotations.
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Event type
                  </label>
                  <Select
                    value={filterEvent}
                    onValueChange={(v) => {
                      setFilterEvent(v);
                      setFilterRun(ALL);
                    }}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All event types</SelectItem>
                      {eventTypes.map((e) => (
                        <SelectItem key={e} value={e}>
                          {e}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Category
                  </label>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All categories</SelectItem>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Generation run
                  </label>
                  <Select value={filterRun} onValueChange={setFilterRun}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All runs</SelectItem>
                      {runs.map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                <span className="text-sm text-muted-foreground">
                  <span className="font-bold text-foreground">{filtered.length}</span>{" "}
                  file{filtered.length === 1 ? "" : "s"} selected
                </span>
                <Button
                  onClick={() => void runExport()}
                  disabled={exporting || filtered.length === 0}
                  className="gap-2"
                >
                  {exporting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Export ZIP
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
