import { createMCPClient } from "@ai-sdk/mcp";

export type McpConfig = {
  url: string;
  token?: string;
};

export type McpClient = Awaited<ReturnType<typeof createMCPClient>>;

// Validate that only https (or localhost http for dev) URLs are accepted.
export function assertValidMcpUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid MCP server URL");
  }
  const isLocalhost =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocalhost)) {
    throw new Error("MCP server URL must use https");
  }
}

// Create a short-lived MCP client over Streamable HTTP transport.
// Caller is responsible for calling client.close() after use.
export async function connectMcp(config: McpConfig): Promise<McpClient> {
  assertValidMcpUrl(config.url);

  const headers: Record<string, string> = {};
  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }

  return createMCPClient({
    transport: {
      type: "http",
      url: config.url,
      headers,
    },
  });
}
