import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Server, Settings2, Loader2, Check } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateEnvironment, type McpEnvironment } from "@/lib/mcp-dev.functions";

const ENV_STYLES: Record<string, string> = {
  dev: "bg-success/15 text-success border-success",
  staging: "bg-warning/15 text-warning border-warning",
  prod: "bg-destructive/15 text-destructive border-destructive",
};

function envStyle(name: string) {
  return ENV_STYLES[name] ?? "bg-muted text-foreground border-border";
}

export function EnvironmentSwitcher({
  environments,
  active,
  onSelect,
  onChanged,
}: {
  environments: McpEnvironment[];
  active: McpEnvironment | null;
  onSelect: (name: string) => void;
  onChanged: () => void;
}) {
  const update = useServerFn(updateEnvironment);
  const [editOpen, setEditOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { url: string; token: string }>>(
    {},
  );
  const [saving, setSaving] = useState(false);

  const openEdit = () => {
    const d: Record<string, { url: string; token: string }> = {};
    for (const e of environments) d[e.id] = { url: e.url, token: e.token ?? "" };
    setDrafts(d);
    setEditOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const e of environments) {
        const draft = drafts[e.id];
        if (!draft) continue;
        if (draft.url !== e.url || (draft.token ?? "") !== (e.token ?? "")) {
          await update({
            data: { id: e.id, url: draft.url, token: draft.token || null },
          });
        }
      }
      onChanged();
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={`gap-2 border ${envStyle(active?.name ?? "")}`}
          >
            <Server className="size-4" />
            <span className="font-semibold uppercase tracking-wide">
              {active?.name ?? "—"}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>MCP environment</DropdownMenuLabel>
          {environments.map((e) => (
            <DropdownMenuItem
              key={e.id}
              onClick={() => onSelect(e.name)}
              className="flex flex-col items-start gap-0.5"
            >
              <div className="flex w-full items-center gap-2">
                <span
                  className={`rounded px-1.5 text-[10px] font-bold uppercase ${envStyle(e.name)}`}
                >
                  {e.name}
                </span>
                {active?.id === e.id && (
                  <Check className="ml-auto size-3.5 text-success" />
                )}
              </div>
              <span className="w-full truncate text-[11px] text-muted-foreground">
                {e.url}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={openEdit} className="gap-2">
            <Settings2 className="size-4" /> Edit endpoints…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>MCP endpoint configuration</DialogTitle>
            <DialogDescription>
              Configure the endpoint URL and optional bearer token for each
              environment. Saved to the database.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {environments.map((e) => (
              <div key={e.id} className="space-y-2 rounded-lg border border-border p-3">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold uppercase ${envStyle(e.name)}`}
                >
                  {e.name}
                </span>
                <div className="space-y-1">
                  <Label className="text-xs">Endpoint URL</Label>
                  <Input
                    value={drafts[e.id]?.url ?? ""}
                    onChange={(ev) =>
                      setDrafts((p) => ({
                        ...p,
                        [e.id]: { ...p[e.id], url: ev.target.value },
                      }))
                    }
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Bearer token (optional)</Label>
                  <Input
                    type="password"
                    placeholder="sk-…"
                    value={drafts[e.id]?.token ?? ""}
                    onChange={(ev) =>
                      setDrafts((p) => ({
                        ...p,
                        [e.id]: { ...p[e.id], token: ev.target.value },
                      }))
                    }
                    className="text-sm"
                  />
                </div>
              </div>
            ))}
            <Button onClick={() => void save()} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save endpoints
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
