import { useState } from "react";
import { Plug, Loader2, CheckCircle2, XCircle, Wrench, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { probeMcpServer, type McpToolInfo } from "@/lib/mcp.functions";

export type McpConnection = {
  url: string;
  token?: string;
  tools: McpToolInfo[];
};

type Status = "idle" | "connecting" | "connected" | "error";

export function ConnectionPanel({
  connection,
  onConnect,
  onDisconnect,
}: {
  connection: McpConnection | null;
  onConnect: (conn: McpConnection) => void;
  onDisconnect: () => void;
}) {
  const probe = useServerFn(probeMcpServer);
  const [url, setUrl] = useState(connection?.url ?? "");
  const [token, setToken] = useState(connection?.token ?? "");
  const [status, setStatus] = useState<Status>(connection ? "connected" : "idle");
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    if (!url.trim()) return;
    setStatus("connecting");
    setError(null);
    try {
      const result = await probe({
        data: { url: url.trim(), token: token.trim() || undefined },
      });
      if (result.ok) {
        setStatus("connected");
        onConnect({ url: url.trim(), token: token.trim() || undefined, tools: result.tools });
      } else {
        setStatus("error");
        setError(result.error);
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  }

  function handleDisconnect() {
    setStatus("idle");
    setError(null);
    onDisconnect();
  }

  const connected = status === "connected" && connection;

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-center gap-2">
        <Plug className="size-5 text-primary" />
        <h2 className="font-semibold tracking-tight">MCP Connection</h2>
        {connected && (
          <Badge variant="secondary" className="ml-auto gap-1">
            <CheckCircle2 className="size-3 text-primary" /> Connected
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="mcp-url">Server URL</Label>
          <Input
            id="mcp-url"
            placeholder="https://checkai.example.com/mcp"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={status === "connecting" || !!connected}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mcp-token">Bearer token (optional)</Label>
          <Input
            id="mcp-token"
            type="password"
            placeholder="sk-…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={status === "connecting" || !!connected}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      {connected ? (
        <Button variant="outline" onClick={handleDisconnect} className="gap-2">
          <Trash2 className="size-4" /> Disconnect
        </Button>
      ) : (
        <Button onClick={handleConnect} disabled={status === "connecting" || !url.trim()} className="gap-2">
          {status === "connecting" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Connecting…
            </>
          ) : (
            <>
              <Plug className="size-4" /> Connect & list tools
            </>
          )}
        </Button>
      )}

      {connected && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wrench className="size-4" />
            {connection.tools.length} capabilit{connection.tools.length === 1 ? "y" : "ies"}
          </div>
          <ScrollArea className="min-h-0 flex-1 rounded-md border">
            <div className="divide-y">
              {connection.tools.map((t) => (
                <div key={t.name} className="p-3">
                  <code className="text-sm font-medium text-foreground">{t.name}</code>
                  {t.description && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t.description}
                    </p>
                  )}
                </div>
              ))}
              {connection.tools.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">
                  No tools exposed by this server.
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </Card>
  );
}
