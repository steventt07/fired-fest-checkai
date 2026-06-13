import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ScrollText,
  Loader2,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronDown,
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listMcpLogs, clearMcpLogs, type McpLog } from "@/lib/mcp-dev.functions";

const ALL = "__all__";

function StatusBadge({ status }: { status: string }) {
  const ok = status === "success";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        ok ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
      }`}
    >
      {ok ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
      {status}
    </span>
  );
}

export function LogPanel({
  open: openProp,
  onOpenChange,
  hideTrigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
} = {}) {
  const fetchLogs = useServerFn(listMcpLogs);
  const clear = useServerFn(clearMcpLogs);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [logs, setLogs] = useState<McpLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [toolFilter, setToolFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [fileQuery, setFileQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLogs();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLogs(res.logs);
    } finally {
      setLoading(false);
    }
  }, [fetchLogs]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const tools = useMemo(
    () => Array.from(new Set(logs.map((l) => l.tool_name))).sort(),
    [logs],
  );

  const filtered = useMemo(
    () =>
      logs.filter((l) => {
        if (toolFilter !== ALL && l.tool_name !== toolFilter) return false;
        if (statusFilter !== ALL && l.status !== statusFilter) return false;
        if (fileQuery && !l.file_name.toLowerCase().includes(fileQuery.toLowerCase()))
          return false;
        return true;
      }),
    [logs, toolFilter, statusFilter, fileQuery],
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const doClear = async () => {
    await clear();
    await load();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <ScrollText className="size-4" /> Logs
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="size-4 text-primary" /> MCP request/response log
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {filtered.length}
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
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => void doClear()}
            >
              <Trash2 className="size-3.5" /> Clear
            </Button>
          </DialogTitle>
          <DialogDescription>
            Every MCP tool call captured with full payloads, status, and timestamp.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Select value={toolFilter} onValueChange={setToolFilter}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Tool" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All tools</SelectItem>
              {tools.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Filter by file…"
            value={fileQuery}
            onChange={(e) => setFileQuery(e.target.value)}
            className="text-xs"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="h-[55vh] overflow-y-auto rounded-lg border border-border">
          {loading && logs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              No log entries — run an ingestion to capture MCP tool calls.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((l) => {
                const isOpen = expanded.has(l.id);
                return (
                  <div key={l.id}>
                    <button
                      type="button"
                      onClick={() => toggle(l.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-muted"
                    >
                      {isOpen ? (
                        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span
                        className={`shrink-0 rounded px-1.5 text-[10px] font-bold uppercase ${
                          l.environment === "prod"
                            ? "bg-destructive/15 text-destructive"
                            : l.environment === "staging"
                              ? "bg-warning/15 text-warning"
                              : "bg-success/15 text-success"
                        }`}
                      >
                        {l.environment}
                      </span>
                      <code className="shrink-0 font-mono text-[12px] text-primary">
                        {l.tool_name}
                      </code>
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted-foreground">
                        {l.file_name}
                      </span>
                      <StatusBadge status={l.status} />
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {new Date(l.created_at).toLocaleTimeString()}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="grid grid-cols-1 gap-3 bg-muted/60 px-9 py-3 sm:grid-cols-2">
                        <div>
                          <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
                            Request
                          </div>
                          <pre className="overflow-x-auto rounded bg-card p-2 text-[11px] text-foreground">
                            {JSON.stringify(l.request, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
                            Response
                          </div>
                          <pre className="overflow-x-auto rounded bg-card p-2 text-[11px] text-foreground">
                            {JSON.stringify(l.response, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
