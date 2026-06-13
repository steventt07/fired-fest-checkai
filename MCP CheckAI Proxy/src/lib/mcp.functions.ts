import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ProbeInput = z.object({
  url: z.string().min(1).max(2048),
  token: z.string().max(4096).optional(),
});

export type McpToolInfo = {
  name: string;
  description?: string;
};

export type ProbeResult =
  | { ok: true; tools: McpToolInfo[] }
  | { ok: false; error: string };

// Connects to the MCP server, lists its tools, then closes the client.
// Used by the connection UI to validate the endpoint and preview capabilities.
export const probeMcpServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ProbeInput.parse(input))
  .handler(async ({ data }): Promise<ProbeResult> => {
    const { connectMcp } = await import("./mcp-client.server");
    let client: Awaited<ReturnType<typeof connectMcp>> | undefined;
    try {
      client = await connectMcp({ url: data.url, token: data.token });
      const tools = await client.tools();
      const list: McpToolInfo[] = Object.entries(tools).map(([name, t]) => ({
        name,
        description: (t as { description?: string }).description,
      }));
      return { ok: true, tools: list };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect";
      return { ok: false, error: message };
    } finally {
      await client?.close().catch(() => {});
    }
  });
