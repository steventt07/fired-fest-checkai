import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, Bookmark, Plus, Trash2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  generateEventFiles,
  listPresets,
  savePreset,
  deletePreset,
  type Preset,
} from "@/lib/generate.functions";
import { eventFileFromGenerated, type EventFile } from "@/lib/ingest-data";

const QUICK = [
  "Summer music festival",
  "Corporate product launch",
  "Underground club night",
  "Arena tour stop",
  "Wedding reception",
  "Conference keynote",
];

export function GeneratorDialog({
  onGenerated,
  disabled,
  open: openProp,
  onOpenChange,
  hideTrigger,
}: {
  onGenerated: (files: EventFile[]) => void;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const generate = useServerFn(generateEventFiles);
  const fetchPresets = useServerFn(listPresets);
  const createPreset = useServerFn(savePreset);
  const removePreset = useServerFn(deletePreset);

  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [eventType, setEventType] = useState("");
  const [details, setDetails] = useState("");
  const [count, setCount] = useState(8);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);

  const loadPresets = useCallback(async () => {
    const res = await fetchPresets();
    if (res.ok) setPresets(res.presets);
  }, [fetchPresets]);

  useEffect(() => {
    if (open) void loadPresets();
  }, [open, loadPresets]);

  const applyPreset = (p: Preset) => {
    setEventType(p.event_type);
    setDetails(p.details ?? "");
  };

  const onSavePreset = async () => {
    const name = presetName.trim();
    const type = eventType.trim();
    if (!name || !type) {
      setError("Enter a preset name and an event type to save.");
      return;
    }
    setSavingPreset(true);
    setError(null);
    try {
      const res = await createPreset({
        data: { name, eventType: type, details: details.trim() || undefined },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPresetName("");
      await loadPresets();
    } finally {
      setSavingPreset(false);
    }
  };

  const onDeletePreset = async (id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
    const res = await removePreset({ data: { id } });
    if (!res.ok) {
      setError(res.error);
      await loadPresets();
    }
  };

  const run = async () => {
    const type = eventType.trim();
    if (!type) {
      setError("Describe an event type first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await generate({
        data: { eventType: type, details: details.trim() || undefined, count },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onGenerated(res.files.map(eventFileFromGenerated));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="secondary" disabled={disabled} className="gap-2">
            <Sparkles className="size-4" /> Generate files
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Synthetic event generator
          </DialogTitle>
          <DialogDescription>
            Generate realistic mock documents with Lovable AI, shaped to parse cleanly
            into the Universal Event Format before ingestion through the Soundcheck MCP pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Saved presets */}
          {presets.length > 0 && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Bookmark className="size-3.5 text-primary" /> Saved presets
              </Label>
              <div className="flex flex-col gap-1.5">
                {presets.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-sm font-medium text-foreground">
                        {p.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {p.event_type}
                        {p.details ? ` · ${p.details}` : ""}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeletePreset(p.id)}
                      className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive"
                      aria-label="Delete preset"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="event-type">Event type</Label>
            <Input
              id="event-type"
              placeholder="e.g. Two-night arena tour for an indie band"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {QUICK.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setEventType(p)}
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground transition hover:border-primary hover:bg-primary/15"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="details">Extra context (optional)</Label>
            <Textarea
              id="details"
              placeholder="Venue, headliner, budget, dates, anything to flavor the docs…"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
            />
          </div>

          {/* Save current config as preset */}
          <div className="flex items-end gap-2 rounded-lg bg-muted p-2.5">
            <div className="flex-1 space-y-1">
              <Label htmlFor="preset-name" className="text-xs">
                Save current as preset
              </Label>
              <Input
                id="preset-name"
                placeholder="Preset name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              onClick={() => void onSavePreset()}
              disabled={savingPreset}
            >
              {savingPreset ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Save
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="count">Number of files: {count}</Label>
            <input
              id="count"
              type="range"
              min={1}
              max={12}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={run} disabled={loading} className="w-full gap-2">
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Generate {count} file{count === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
