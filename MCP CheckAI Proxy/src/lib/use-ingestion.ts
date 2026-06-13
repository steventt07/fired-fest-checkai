import { useCallback, useRef, useState } from "react";

import { MCP_SERVER, OAUTH_ACCOUNT, type EventFile } from "@/lib/ingest-data";

export type LogKind = "command" | "step" | "blank" | "label" | "progress" | "toolcall";

export type ToolCallEvent = {
  tool: string;
  file: EventFile;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  status: "success" | "error";
};

export type ToolCallHandler = (e: ToolCallEvent) => void;

/** Maps a log line to a stage of the Extract → Transform → Load pipeline. */
export type EtlStage = "extract" | "transform" | "load";

export type LogLine = {
  id: string;
  kind: LogKind;
  text: string;
  /** trailing token rendered in an accent color (e.g. a path or count) */
  accent?: string;
  /** ETL stage this line belongs to, surfaced as a highlighted badge */
  etl?: EtlStage;
};

export type Phase = "idle" | "running" | "done";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type SessionState = {
  connected: boolean;
  eventId: string;
  batchId: string;
  records: number;
};

export function useIngestion() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [log, setLog] = useState<LogLine[]>([]);
  const [ingested, setIngested] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const runId = useRef(0);
  const seq = useRef(0);

  /**
   * Tracks the live agent-runtime session so each pipeline step continues the
   * SAME terminal session instead of restarting it. Parse opens the session
   * (handshake + oauth + tool discovery); validate and ingest reuse it.
   */
  const session = useRef<SessionState | null>(null);

  const append = useCallback((line: Omit<LogLine, "id">) => {
    setLog((prev) => [...prev, { ...line, id: `${seq.current++}-${line.text}` }]);
  }, []);

  /** Emit handshake/oauth/tool-discovery once per session. */
  const ensureConnected = useCallback(
    async (files: EventFile[], alive: () => boolean) => {
      if (session.current?.connected) return true;

      const primitives = new Set(files.map((f) => f.primitive)).size;

      append({ kind: "step", text: `mcp handshake · ${MCP_SERVER}` });
      await sleep(650);
      if (!alive()) return false;

      append({ kind: "step", text: `oauth · ${OAUTH_ACCOUNT}` });
      await sleep(650);
      if (!alive()) return false;

      append({
        kind: "step",
        text: "tools discovered · ",
        accent: `27 · ${primitives} landing tool${primitives === 1 ? "" : "s"}`,
      });
      await sleep(500);
      if (!alive()) return false;

      session.current = {
        connected: true,
        eventId: `evt_${Math.random().toString(36).slice(2, 8)}`,
        batchId: `bat_${Date.now().toString(36)}`,
        records: 0,
      };
      return true;
    },
    [append],
  );

  // ── Step 02 · Parse → UEF ──────────────────────────────────────────────
  // Opens the runtime session and parses each artifact into UEF records.
  const runParse = useCallback(
    async (
      files: EventFile[],
      opts?: { onToolCall?: ToolCallHandler; onComplete?: (records: number) => void },
    ) => {
      if (files.length === 0) return;

      const myRun = ++runId.current;
      const alive = () => runId.current === myRun;

      // Parse is the entry point — start a fresh terminal session.
      session.current = null;
      setPhase("running");
      setLog([]);
      setIngested(new Set());
      setProgress(0);

      append({ kind: "command", text: `checkai parse ./dropped (${files.length} files) \\` });
      append({ kind: "command", text: "--via mcp:soundcheck --emit uef" });
      append({ kind: "blank", text: "" });
      await sleep(500);
      if (!alive()) return;

      if (!(await ensureConnected(files, alive))) return;

      append({ kind: "blank", text: "" });
      append({
        kind: "step",
        text: "detect_source_documents · ",
        accent: `${files.length} artifact${files.length === 1 ? "" : "s"} classified`,
        etl: "extract",
      });
      await sleep(500);
      if (!alive()) return;

      append({ kind: "label", text: "extract_structured_records · parsing each artifact to UEF…", etl: "extract" });
      append({ kind: "progress", text: "" });
      await sleep(300);

      let records = 0;
      for (let i = 0; i < files.length; i++) {
        if (!alive()) return;
        const f = files[i];
        const tool = "mcp.soundcheck.extract_structured_records";
        const n = 1 + ((f.name.length + i) % 5);
        records += n;
        setProgress(Math.round(((i + 1) / files.length) * 100));
        append({
          kind: "toolcall",
          text: `${tool} `,
          accent: `(${f.name} → ${n} record${n === 1 ? "" : "s"})`,
          etl: "extract",
        });
        opts?.onToolCall?.({
          tool,
          file: f,
          request: {
            method: tool,
            args: { source_file: f.name, category: f.category, target_primitive: f.primitive },
          },
          response: { ok: true, records: n, format: "uef" },
          status: "success",
        });
        await sleep(280);
      }

      if (!alive()) return;
      const parsed = session.current as SessionState | null;
      if (parsed) parsed.records = records;

      append({ kind: "blank", text: "" });
      append({
        kind: "step",
        text: "normalize_uef_document · ",
        accent: `${records} records assembled`,
        etl: "transform",
      });
      await sleep(600);
      if (!alive()) return;

      append({
        kind: "label",
        text: `parse complete · ${files.length} / ${files.length} artifacts → ${records} UEF records`,
      });
      setPhase("idle");
      opts?.onComplete?.(records);
    },
    [append, ensureConnected],
  );

  // ── Step 03 · Validate ─────────────────────────────────────────────────
  // Continues the same session: validates the UEF parsed in step 02.
  const runValidate = useCallback(
    async (
      files: EventFile[],
      opts?: {
        onToolCall?: ToolCallHandler;
        summary?: { records: number; warnings: number; errors: number };
        onComplete?: () => void;
      },
    ) => {
      if (files.length === 0) return;

      const myRun = ++runId.current;
      const alive = () => runId.current === myRun;

      setPhase("running");
      setProgress(0);

      // Reuse the open session (handshake/oauth already done in parse).
      if (!(await ensureConnected(files, alive))) return;

      const records = opts?.summary?.records ?? session.current?.records ?? files.length;
      const warnings = opts?.summary?.warnings ?? 0;
      const errors = opts?.summary?.errors ?? 0;

      append({ kind: "blank", text: "" });
      append({
        kind: "label",
        text: `validate_uef_document · checking ${records} parsed records…`,
        etl: "transform",
      });
      append({ kind: "progress", text: "" });
      await sleep(300);

      for (let i = 0; i < files.length; i++) {
        if (!alive()) return;
        const f = files[i];
        const tool = "mcp.soundcheck.validate_uef_document";
        setProgress(Math.round(((i + 1) / files.length) * 100));
        append({
          kind: "toolcall",
          text: `${tool} `,
          accent: `(${f.name})`,
          etl: "transform",
        });
        opts?.onToolCall?.({
          tool,
          file: f,
          request: {
            method: tool,
            args: { source_file: f.name, category: f.category },
          },
          response: { ok: true, valid: true },
          status: "success",
        });
        await sleep(240);
      }

      if (!alive()) return;
      append({ kind: "blank", text: "" });
      append({
        kind: "step",
        text: "validation complete · ",
        accent:
          errors > 0
            ? `${errors} blocking · ${warnings} warning${warnings === 1 ? "" : "s"}`
            : `passed · ${warnings} warning${warnings === 1 ? "" : "s"}`,
        etl: "transform",
      });
      setPhase("idle");
      opts?.onComplete?.();
    },
    [append, ensureConnected],
  );

  // ── Step 04 · Ingest ───────────────────────────────────────────────────
  // Continues the same session: commits the validated UEF to the platform.
  const run = useCallback(
    async (
      files: EventFile[],
      opts?: {
        onToolCall?: ToolCallHandler;
        summary?: { records: number; warnings: number; errors: number };
      },
    ) => {
      if (files.length === 0) return;

      const myRun = ++runId.current;
      const alive = () => runId.current === myRun;

      setPhase("running");
      setProgress(0);

      // Reuse the live session opened in step 02.
      if (!(await ensureConnected(files, alive))) return;

      const eventId = session.current?.eventId ?? `evt_${Math.random().toString(36).slice(2, 8)}`;
      const batchId = session.current?.batchId ?? `bat_${Date.now().toString(36)}`;

      const members = files.filter((f) => f.category === "People").length;
      const schedule = files.filter((f) => f.category === "Timeline").length;
      const ledger = files.filter((f) => f.category === "Payments").length;

      append({ kind: "blank", text: "" });
      append({ kind: "command", text: `checkai ingest --batch ${batchId} \\` });
      append({ kind: "command", text: "--via mcp:soundcheck --path file-ingestion" });
      await sleep(500);
      if (!alive()) return;

      // Path C — file ingestion: batch → submit parsed UEF → merge → commit
      append({ kind: "blank", text: "" });
      append({ kind: "step", text: "create_ingestion_batch · ", accent: `${eventId} → ${batchId}`, etl: "load" });
      await sleep(650);
      if (!alive()) return;

      append({ kind: "label", text: "add_ingestion_text · submitting parsed UEF from step 02…", etl: "load" });
      append({ kind: "progress", text: "" });
      await sleep(300);

      for (let i = 0; i < files.length; i++) {
        if (!alive()) return;
        const f = files[i];
        setIngested((prev) => new Set(prev).add(f.id));
        setProgress(Math.round(((i + 1) / files.length) * 100));
        append({
          kind: "toolcall",
          text: "mcp.soundcheck.add_ingestion_text ",
          accent: `(${f.name})`,
          etl: "load",
        });
        await sleep(280);
      }

      if (!alive()) return;
      append({ kind: "blank", text: "" });
      append({ kind: "step", text: "trigger_ingestion_merge · consolidating proposals", etl: "load" });
      await sleep(700);
      if (!alive()) return;

      append({
        kind: "step",
        text: "get_ingestion_batch_review · ",
        accent: `${members} members · ${schedule} schedule · ${ledger} ledger · merge_version 1`,
        etl: "load",
      });
      await sleep(700);
      if (!alive()) return;

      append({ kind: "blank", text: "" });
      append({
        kind: "step",
        text: "commit_ingestion_batch · ",
        accent: "confirmation_required → token issued",
        etl: "load",
      });
      await sleep(650);
      if (!alive()) return;

      append({ kind: "label", text: "commit_ingestion_batch · writing records (token resent)…", etl: "load" });
      append({ kind: "progress", text: "" });
      await sleep(300);

      for (let i = 0; i < files.length; i++) {
        if (!alive()) return;
        const f = files[i];
        setProgress(Math.round(((i + 1) / files.length) * 100));
        const tool = `mcp.soundcheck.${f.primitive}`;
        append({
          kind: "toolcall",
          text: `${tool} `,
          accent: `(${f.name})`,
          etl: "load",
        });
        opts?.onToolCall?.({
          tool,
          file: f,
          request: {
            method: tool,
            args: {
              event_id: eventId,
              batch_id: batchId,
              merge_version: 1,
              source_file: f.name,
              category: f.category,
            },
          },
          response: { ok: true, committed: true, landed_as: f.primitive },
          status: "success",
        });
        await sleep(300);
      }

      if (!alive()) return;
      append({ kind: "blank", text: "" });
      append({
        kind: "label",
        text: `ingest complete · ${files.length} / ${files.length} files committed · 100%`,
      });
      setPhase("done");
    },
    [append, ensureConnected],
  );

  const reset = useCallback(() => {
    runId.current++;
    session.current = null;
    setPhase("idle");
    setLog([]);
    setIngested(new Set());
    setProgress(0);
  }, []);

  return { phase, log, ingested, progress, run, runParse, runValidate, reset };
}
