import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ---- Types ----

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(z.string(), jsonSchema),
  ]),
);

export type McpLog = {
  id: string;
  tool_name: string;
  file_name: string;
  request: Json;
  response: Json;
  status: string;
  environment: string;
  created_at: string;
};

export type McpEnvironment = {
  id: string;
  name: string;
  url: string;
  token: string | null;
  sort_order: number;
  created_at: string;
};

export type TestCase = {
  id: string;
  name: string;
  file_name: string;
  file_type: string;
  category: string;
  expected_tool: string;
  created_at: string;
};

export type MutResult = { ok: true; id?: string } | { ok: false; error: string };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ---- Logs ----

const LogInput = z.object({
  tool_name: z.string().min(1).max(200),
  file_name: z.string().min(1).max(300),
  request: jsonSchema,
  response: jsonSchema,
  status: z.enum(["success", "error"]),
  environment: z.string().min(1).max(60),
});

export const logMcpCall = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LogInput.parse(input))
  .handler(async ({ data }): Promise<MutResult> => {
    try {
      const supabaseAdmin = await admin();
      const { error } = await supabaseAdmin.from("mcp_logs").insert({
        tool_name: data.tool_name,
        file_name: data.file_name,
        request: data.request,
        response: data.response,
        status: data.status,
        environment: data.environment,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  });

export type LogListResult =
  | { ok: true; logs: McpLog[] }
  | { ok: false; error: string };

export const listMcpLogs = createServerFn({ method: "GET" }).handler(
  async (): Promise<LogListResult> => {
    try {
      const supabaseAdmin = await admin();
      const { data, error } = await supabaseAdmin
        .from("mcp_logs")
        .select("id,tool_name,file_name,request,response,status,environment,created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) return { ok: false, error: error.message };
      return { ok: true, logs: (data ?? []) as McpLog[] };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  },
);

export const clearMcpLogs = createServerFn({ method: "POST" }).handler(
  async (): Promise<MutResult> => {
    try {
      const supabaseAdmin = await admin();
      const { error } = await supabaseAdmin
        .from("mcp_logs")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  },
);

// ---- Environments ----

export type EnvListResult =
  | { ok: true; environments: McpEnvironment[] }
  | { ok: false; error: string };

export const listEnvironments = createServerFn({ method: "GET" }).handler(
  async (): Promise<EnvListResult> => {
    try {
      const supabaseAdmin = await admin();
      const { data, error } = await supabaseAdmin
        .from("mcp_environments")
        .select("id,name,url,token,sort_order,created_at")
        .order("sort_order", { ascending: true });
      if (error) return { ok: false, error: error.message };
      return { ok: true, environments: (data ?? []) as McpEnvironment[] };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  },
);

const UpdateEnvInput = z.object({
  id: z.string().uuid(),
  url: z.string().min(1).max(2048),
  token: z.string().max(4096).nullable().optional(),
});

export const updateEnvironment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateEnvInput.parse(input))
  .handler(async ({ data }): Promise<MutResult> => {
    try {
      const supabaseAdmin = await admin();
      const { error } = await supabaseAdmin
        .from("mcp_environments")
        .update({ url: data.url, token: data.token ?? null })
        .eq("id", data.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  });

// ---- Test cases ----

export type TestListResult =
  | { ok: true; cases: TestCase[] }
  | { ok: false; error: string };

export const listTestCases = createServerFn({ method: "GET" }).handler(
  async (): Promise<TestListResult> => {
    try {
      const supabaseAdmin = await admin();
      const { data, error } = await supabaseAdmin
        .from("mcp_test_cases")
        .select("id,name,file_name,file_type,category,expected_tool,created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) return { ok: false, error: error.message };
      return { ok: true, cases: (data ?? []) as TestCase[] };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  },
);

const SaveTestInput = z.object({
  name: z.string().min(1).max(160),
  file_name: z.string().min(1).max(300),
  file_type: z.string().min(1).max(20),
  category: z.string().min(1).max(40),
  expected_tool: z.string().min(1).max(200),
});

export const saveTestCase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SaveTestInput.parse(input))
  .handler(async ({ data }): Promise<MutResult> => {
    try {
      const supabaseAdmin = await admin();
      const { error } = await supabaseAdmin.from("mcp_test_cases").insert(data);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  });

const DeleteTestInput = z.object({ id: z.string().uuid() });

export const deleteTestCase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteTestInput.parse(input))
  .handler(async ({ data }): Promise<MutResult> => {
    try {
      const supabaseAdmin = await admin();
      const { error } = await supabaseAdmin
        .from("mcp_test_cases")
        .delete()
        .eq("id", data.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  });
