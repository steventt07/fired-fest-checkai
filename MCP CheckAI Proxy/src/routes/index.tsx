import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Play,
  RotateCcw,
  Sparkles,
  Database,
  ScrollText,
  FlaskConical,
  LayoutGrid,
  Activity,
  Boxes,
  CalendarCheck,
  ShieldCheck,
  Network,
  Bot,
  GitCompare,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import soundcheckIcon from "@/assets/soundcheck-icon.png.asset.json";
import { EventFolderPanel } from "@/components/EventFolderPanel";
import { AgentRuntimePanel } from "@/components/AgentRuntimePanel";
import { GeneratorDialog } from "@/components/GeneratorDialog";
import { TrainingSetDialog } from "@/components/TrainingSetDialog";
import { EnvironmentSwitcher } from "@/components/EnvironmentSwitcher";
import { LogPanel } from "@/components/LogPanel";
import { TestSuiteDialog } from "@/components/TestSuiteDialog";
import { UefPanel } from "@/components/UefPanel";
import { EventObjectPanel } from "@/components/EventObjectPanel";
import { McpMappingPanel } from "@/components/McpMappingPanel";
import { ValidationPanel } from "@/components/ValidationPanel";
import {
  PipelineStepper,
  type StageState,
  type StageId,
} from "@/components/PipelineStepper";
import { useIngestion, type ToolCallEvent } from "@/lib/use-ingestion";
import { useEnvironment } from "@/lib/use-environment";
import { logMcpCall } from "@/lib/mcp-dev.functions";
import { buildUefDocument, validateUefDocument, type UefDocument } from "@/lib/uef";
import { MCP_SERVER, toEventFile, type EventFile } from "@/lib/ingest-data";
import { extractUefDocument } from "@/lib/extract.functions";
import { AGENT_CHOICES } from "@/lib/harness/catalog";
import { ModelComparisonDialog } from "@/components/ModelComparisonDialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CheckAI · MCP Dev Environment" },
      {
        name: "description",
        content:
          "Workbench for testing MCP changes, generating and curating training data, and proxying to the live CheckAI MCP server.",
      },
      { property: "og:title", content: "CheckAI · MCP Dev Environment" },
      {
        property: "og:description",
        content:
          "Stage artifacts, replay them through soundcheck MCP primitives, curate training data, and inspect request logs.",
      },
    ],
  }),
  component: Index,
});

type Tool =
  | "generate"
  | "training"
  | "logs"
  | "tests"
  | "uef"
  | "validate"
  | "event"
  | "compare"
  | "mapping";

function Index() {
  const { phase, log, ingested, progress, run, runParse, runValidate, reset } =
    useIngestion();
  const { environments, active, activeName, setActiveName, reload: reloadEnvs } =
    useEnvironment();
  const logCall = useServerFn(logMcpCall);

  const [files, setFiles] = useState<EventFile[]>([]);
  const [completed, setCompleted] = useState<Set<StageId>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [tool, setTool] = useState<Tool | null>(null);
  const [aiDoc, setAiDoc] = useState<UefDocument | null>(null);
  const [model, setModel] = useState(AGENT_CHOICES[0].model);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const extractFiles = useServerFn(extractUefDocument);


  const handleToolCall = useCallback(
    (e: ToolCallEvent) => {
      void logCall({
        data: {
          tool_name: e.tool,
          file_name: e.file.name,
          request: e.request,
          response: e.response,
          status: e.status,
          environment: activeName,
        },
      });
    },
    [logCall, activeName],
  );

  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const next = Array.from(fileList).map(toEventFile);
    setFiles((prev) => [...prev, ...next]);
    setCompleted(new Set());
    setAiDoc(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      if (phase === "running") return;
      addFiles(e.dataTransfer.files);
    },
    [addFiles, phase],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setCompleted(new Set());
    setAiDoc(null);
  }, []);

  const addGenerated = useCallback((generated: EventFile[]) => {
    if (generated.length === 0) return;
    setFiles((prev) => [...prev, ...generated]);
    setCompleted(new Set());
    setAiDoc(null);
  }, []);

  const handleReset = useCallback(() => {
    reset();
    setFiles([]);
    setCompleted(new Set());
    setAiDoc(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [reset]);


  const canRun = files.length > 0 && phase !== "running";

  const report = useMemo(
    () => validateUefDocument(aiDoc ?? buildUefDocument(files)),
    [files, aiDoc],
  );

  const stages: StageState[] = useMemo(() => {
    const has = files.length > 0;
    const errors = report.counts.error;
    const parseDone = completed.has("parse");
    const validateDone = completed.has("validate");
    return [
      {
        id: "stage",
        label: "Stage",
        hint: has ? `${files.length} artifact${files.length === 1 ? "" : "s"}` : "drop files",
        status: has ? "done" : "active",
      },
      {
        id: "parse",
        label: "Parse → UEF",
        hint: parseDone
          ? `${report.counts.total} records`
          : has
            ? "click to parse"
            : "awaiting files",
        status: parseDone ? "done" : has ? "active" : "todo",
        reviewable: parseDone,
      },
      {
        id: "validate",
        label: "Validate",
        hint: validateDone
          ? errors
            ? `${errors} blocking`
            : `${report.counts.warn} warnings`
          : parseDone
            ? "click to validate"
            : "awaiting parse",
        status: validateDone
          ? errors
            ? "error"
            : "done"
          : parseDone
            ? "active"
            : "todo",
        reviewable: validateDone,
      },
      {
        id: "ingest",
        label: "Ingest",
        hint:
          phase === "done"
            ? "complete"
            : phase === "running"
              ? "running…"
              : validateDone
                ? "ready"
                : "awaiting validation",
        status:
          phase === "done"
            ? "done"
            : phase === "running"
              ? "active"
              : "todo",
        reviewable: phase === "done",
      },
    ];
  }, [files.length, report, phase, completed]);

  const handleStageReview = useCallback(
    (id: StageId) => {
      if (id === "parse") setTool("uef");
      else if (id === "validate") setTool("validate");
      else if (id === "ingest") setTool("event");
    },
    [],
  );

  const runAiExtraction = useCallback(async () => {
    const result = await extractFiles({
      data: {
        files: files.map((f) => ({
          id: f.id,
          name: f.name,
          category: f.category,
          content: f.content ?? "",
        })),
        model,
      },
    });
    if (result.ok) setAiDoc(JSON.parse(result.docJson) as UefDocument);
  }, [extractFiles, files, model]);


  const handleStageSelect = useCallback(
    (id: StageId) => {
      if (id === "stage") fileInputRef.current?.click();
      else if (id === "parse") {
        if (files.length === 0 || phase === "running") return;
        void runAiExtraction();
        void runParse(files, {
          onToolCall: handleToolCall,
          onComplete: () => setCompleted((prev) => new Set(prev).add("parse")),
        });
      } else if (id === "validate") {
        if (!completed.has("parse") || phase === "running") return;
        void runValidate(files, {
          onToolCall: handleToolCall,
          summary: {
            records: report.counts.total,
            warnings: report.counts.warn,
            errors: report.counts.error,
          },
          onComplete: () => setCompleted((prev) => new Set(prev).add("validate")),
        });
      } else if (id === "ingest" && canRun && completed.has("validate"))
        run(files, {
          onToolCall: handleToolCall,
          summary: {
            records: report.counts.total,
            warnings: report.counts.warn,
            errors: report.counts.error,
          },
        });
    },
    [canRun, run, runParse, runValidate, files, handleToolCall, report, completed, phase, runAiExtraction],

  );

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <img
            src={soundcheckIcon.url}
            alt="Soundcheck"
            className="size-8 shrink-0 rounded-md"
          />
          <div className="leading-tight">
            <div className="font-display text-sm font-semibold tracking-tight">
              checkai
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              MCP Dev Env
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
          <NavGroup label="Workspace">
            <NavItem icon={<LayoutGrid className="size-4" />} active>
              Workbench
            </NavItem>
          </NavGroup>

          <NavGroup label="Pipeline">
            <NavItem
              icon={<Boxes className="size-4" />}
              onClick={() => setTool("uef")}
            >
              Parse to UEF
            </NavItem>
            <NavItem
              icon={<ShieldCheck className="size-4" />}
              onClick={() => setTool("validate")}
            >
              Validation
            </NavItem>
            <NavItem
              icon={<CalendarCheck className="size-4" />}
              onClick={() => setTool("event")}
            >
              Event object
            </NavItem>
            <NavItem
              icon={<Network className="size-4" />}
              onClick={() => setTool("mapping")}
            >
              Tool mapping
            </NavItem>
          </NavGroup>

          <NavGroup label="Data & Testing">
            <NavItem
              icon={<Sparkles className="size-4" />}
              onClick={() => setTool("generate")}
            >
              Generate files
            </NavItem>



            <NavItem
              icon={<Database className="size-4" />}
              onClick={() => setTool("training")}
            >
              Training data
            </NavItem>
            <NavItem
              icon={<ScrollText className="size-4" />}
              onClick={() => setTool("logs")}
            >
              Request logs
            </NavItem>
            <NavItem
              icon={<FlaskConical className="size-4" />}
              onClick={() => setTool("tests")}
            >
              Test suite
            </NavItem>
          </NavGroup>
        </nav>

        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <Activity className="size-3.5 text-success" />
            <span className="truncate">{MCP_SERVER}</span>
            <span className="ml-auto inline-flex items-center gap-1 text-success">
              <span className="size-1.5 rounded-full bg-success" />
              live
            </span>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div
        className="flex min-w-0 flex-1 flex-col"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
      >
        {isDragging && (
          <div className="pointer-events-none fixed inset-0 z-50 border-2 border-dashed border-primary bg-primary/5" />
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />

        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-card/60 px-5 backdrop-blur">
          <div className="min-w-0">
            <h1 className="font-display text-sm font-semibold tracking-tight">
              Ingestion Workbench
            </h1>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {files.length} staged · {ingested.size} ingested
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <EnvironmentSwitcher
              environments={environments}
              active={active}
              onSelect={setActiveName}
              onChanged={reloadEnvs}
            />
            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <Button
              variant="outline"
              onClick={() => setTool("generate")}
              disabled={phase === "running"}
              className="gap-2"
            >
              <Sparkles className="size-4" /> Generate
            </Button>
            <Button
              variant="ghost"
              onClick={handleReset}
              disabled={phase === "running"}
              className="gap-2"
            >
              <RotateCcw className="size-4" /> Reset
            </Button>
            <Button
              onClick={() =>
                run(files, {
                  onToolCall: handleToolCall,
                  summary: {
                    records: report.counts.total,
                    warnings: report.counts.warn,
                    errors: report.counts.error,
                  },
                })
              }
              disabled={!canRun || !completed.has("validate")}
              className="gap-2"
            >
              <Play className="size-4" />
              {phase === "running" ? "Ingesting…" : "Run ingestion"}
            </Button>
          </div>
        </header>

        {/* Canvas */}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-grid p-5">
          <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-sm font-semibold tracking-tight">
                  Extraction pipeline
                </h2>
                <p className="font-mono text-[11px] text-muted-foreground">
                  stage → parse → validate → ingest
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
                  <Bot className="size-4 text-primary" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Model
                  </span>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={phase === "running"}
                    className="bg-transparent font-mono text-xs outline-none"
                  >
                    {AGENT_CHOICES.map((a) => (
                      <option key={a.id} value={a.model}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setTool("compare")}
                  disabled={files.length === 0 || phase === "running"}
                  className="gap-2"
                >
                  <GitCompare className="size-4" /> Compare models
                </Button>
              </div>
            </div>
            <PipelineStepper
              stages={stages}
              onSelect={handleStageSelect}
              onReview={handleStageReview}
            />
            <div className="grid min-h-0 w-full flex-1 grid-cols-1 grid-rows-2 gap-5 lg:grid-cols-2 lg:grid-rows-1">
              <EventFolderPanel
                files={files}
                ingested={ingested}
                isDragging={isDragging}
                onPickClick={() => fileInputRef.current?.click()}
                onRemove={removeFile}
                onBrowseTraining={() => setTool("training")}
              />
              <AgentRuntimePanel
                log={log}
                progress={progress}
                phase={phase}
                totalFiles={files.length}
              />
            </div>
          </div>
        </main>
      </div>

      {/* Tool dialogs (controlled from the sidebar / top bar) */}
      <GeneratorDialog
        onGenerated={addGenerated}
        disabled={phase === "running"}
        hideTrigger
        open={tool === "generate"}
        onOpenChange={(o) => setTool(o ? "generate" : null)}
      />
      <TrainingSetDialog
        hideTrigger
        open={tool === "training"}
        onOpenChange={(o) => setTool(o ? "training" : null)}
        onLoadToWorkbench={addGenerated}
      />

      <LogPanel
        hideTrigger
        open={tool === "logs"}
        onOpenChange={(o) => setTool(o ? "logs" : null)}
      />
      <TestSuiteDialog
        files={files}
        activeEnvironment={activeName}
        hideTrigger
        open={tool === "tests"}
        onOpenChange={(o) => setTool(o ? "tests" : null)}
      />
      <UefPanel
        files={files}
        doc={aiDoc ?? undefined}
        open={tool === "uef"}
        onOpenChange={(o) => setTool(o ? "uef" : null)}
      />
      <ValidationPanel
        files={files}
        doc={aiDoc ?? undefined}
        open={tool === "validate"}
        onOpenChange={(o) => setTool(o ? "validate" : null)}
      />
      <EventObjectPanel
        files={files}
        doc={aiDoc ?? undefined}
        open={tool === "event"}
        onOpenChange={(o) => setTool(o ? "event" : null)}
      />
      <McpMappingPanel
        open={tool === "mapping"}
        onOpenChange={(o) => setTool(o ? "mapping" : null)}
      />
      <ModelComparisonDialog
        files={files}
        open={tool === "compare"}
        onOpenChange={(o) => setTool(o ? "compare" : null)}
      />
    </div>
  );
}

function NavGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="px-2.5 pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavItem({
  icon,
  children,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
