import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  FlaskConical,
  Loader2,
  Play,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
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
import {
  listTestCases,
  saveTestCase,
  deleteTestCase,
  type TestCase,
} from "@/lib/mcp-dev.functions";
import {
  resolveToolCall,
  type EventFile,
  type FileType,
} from "@/lib/ingest-data";

type RunResult = {
  id: string;
  name: string;
  file_name: string;
  expected: string;
  actual: string;
  pass: boolean;
};

export function TestSuiteDialog({
  files,
  activeEnvironment,
  open: openProp,
  onOpenChange,
  hideTrigger,
}: {
  files: EventFile[];
  activeEnvironment: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const fetchCases = useServerFn(listTestCases);
  const save = useServerFn(saveTestCase);
  const remove = useServerFn(deleteTestCase);

  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [cases, setCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<RunResult[] | null>(null);

  // New-case form
  const [selectedFileId, setSelectedFileId] = useState<string>("");
  const [caseName, setCaseName] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCases();
      if (res.ok) setCases(res.cases);
      else setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load test cases");
    } finally {
      setLoading(false);
    }
  }, [fetchCases]);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const selectedFile = useMemo(
    () => files.find((f) => f.id === selectedFileId) ?? null,
    [files, selectedFileId],
  );

  const addCase = useCallback(async () => {
    if (!selectedFile) return;
    setBusy(true);
    setError(null);
    try {
      const expected = resolveToolCall(selectedFile.name, selectedFile.type).tool;
      const res = await save({
        data: {
          name: caseName.trim() || selectedFile.name,
          file_name: selectedFile.name,
          file_type: selectedFile.type,
          category: selectedFile.category,
          expected_tool: expected,
        },
      });
      if (res.ok) {
        setCaseName("");
        setSelectedFileId("");
        await reload();
      } else {
        setError(res.error);
      }
    } finally {
      setBusy(false);
    }
  }, [selectedFile, caseName, save, reload]);

  const deleteCase = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        const res = await remove({ data: { id } });
        if (res.ok) await reload();
        else setError(res.error);
      } finally {
        setBusy(false);
      }
    },
    [remove, reload],
  );

  const runSuite = useCallback(() => {
    setBusy(true);
    const out: RunResult[] = cases.map((c) => {
      const actual = resolveToolCall(c.file_name, c.file_type as FileType).tool;
      return {
        id: c.id,
        name: c.name,
        file_name: c.file_name,
        expected: c.expected_tool,
        actual,
        pass: actual === c.expected_tool,
      };
    });
    setResults(out);
    setBusy(false);
  }, [cases]);

  const passCount = results?.filter((r) => r.pass).length ?? 0;
  const total = results?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <FlaskConical className="size-4" /> Test suite
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="size-4" /> Regression test suite
          </DialogTitle>
          <DialogDescription>
            Save file → expected MCP tool pairs, then replay them against the{" "}
            <span className="font-semibold">{activeEnvironment}</span> environment to
            catch behavior changes.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Add a new case from currently dropped files */}
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              File from current drop
            </label>
            <Select value={selectedFileId} onValueChange={setSelectedFileId}>
              <SelectTrigger>
                <SelectValue placeholder={files.length ? "Choose a file…" : "No files dropped"} />
              </SelectTrigger>
              <SelectContent>
                {files.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Test name (optional)
            </label>
            <Input
              value={caseName}
              onChange={(e) => setCaseName(e.target.value)}
              placeholder="e.g. Invoice → payments"
            />
          </div>
          <Button onClick={addCase} disabled={!selectedFile || busy} className="gap-2">
            <Plus className="size-4" /> Save case
          </Button>
        </div>

        {/* Run + report */}
        <div className="flex items-center justify-between">
          <Button onClick={runSuite} disabled={busy || cases.length === 0} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run suite ({cases.length})
          </Button>
          {results && (
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                passCount === total
                  ? "bg-success/15 text-success"
                  : "bg-destructive/15 text-destructive"
              }`}
            >
              {passCount} / {total} passing
            </span>
          )}
        </div>

        <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-border">
          {loading ? (
            <div className="flex items-center justify-center p-6 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : cases.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No saved test cases yet. Add one above.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {cases.map((c) => {
                const result = results?.find((r) => r.id === c.id);
                return (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    {result ? (
                      result.pass ? (
                        <CheckCircle2 className="size-4 shrink-0 text-success" />
                      ) : (
                        <XCircle className="size-4 shrink-0 text-destructive" />
                      )
                    ) : (
                      <span className="size-4 shrink-0 rounded-full border border-border" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{c.name}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {c.file_name} → {c.expected_tool}
                      </p>
                      {result && !result.pass && (
                        <p className="truncate font-mono text-xs text-destructive">
                          got: {result.actual}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteCase(c.id)}
                      disabled={busy}
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
