import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Server-only Lovable AI Gateway provider. Connects the AI SDK to Lovable AI
// using the LOVABLE_API_KEY in the Lovable-API-Key header.
export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable-ai-gateway",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": apiKey,
    },
  });
}
