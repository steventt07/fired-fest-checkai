import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { connectMcp } from "@/lib/mcp-client.server";

type ChatRequestBody = {
  messages?: unknown;
  mcp?: { url?: string; token?: string };
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ChatRequestBody;
        const { messages, mcp } = body;

        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        if (!mcp?.url) {
          return new Response("MCP server URL is required", { status: 400 });
        }

        let mcpClient: Awaited<ReturnType<typeof connectMcp>> | undefined;
        let tools = {};
        try {
          mcpClient = await connectMcp({ url: mcp.url, token: mcp.token });
          tools = await mcpClient.tools();
        } catch (err) {
          await mcpClient?.close().catch(() => {});
          const message =
            err instanceof Error ? err.message : "Failed to connect to MCP server";
          return new Response(`MCP connection failed: ${message}`, { status: 502 });
        }

        const gateway = createLovableAiGatewayProvider(key);

        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system:
            "You are checkai, an assistant that prototypes the capabilities of a connected MCP server. " +
            "Use the available MCP tools to fulfill the user's request. When you use a tool, briefly explain " +
            "what you did and summarize the result clearly.",
          messages: await convertToModelMessages(messages as UIMessage[]),
          tools,
          stopWhen: stepCountIs(50),
          onFinish: async () => {
            await mcpClient?.close().catch(() => {});
          },
          onError: async () => {
            await mcpClient?.close().catch(() => {});
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
        });
      },
    },
  },
});
