CREATE TABLE public.mcp_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tool_name text NOT NULL,
  file_name text NOT NULL,
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'success',
  environment text NOT NULL DEFAULT 'dev',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_logs TO anon, authenticated;
GRANT ALL ON public.mcp_logs TO service_role;
ALTER TABLE public.mcp_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view mcp logs" ON public.mcp_logs FOR SELECT USING (true);
CREATE POLICY "Anyone can add mcp logs" ON public.mcp_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete mcp logs" ON public.mcp_logs FOR DELETE USING (true);
CREATE INDEX idx_mcp_logs_created_at ON public.mcp_logs (created_at DESC);

CREATE TABLE public.mcp_environments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  url text NOT NULL,
  token text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_environments TO anon, authenticated;
GRANT ALL ON public.mcp_environments TO service_role;
ALTER TABLE public.mcp_environments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view environments" ON public.mcp_environments FOR SELECT USING (true);
CREATE POLICY "Anyone can add environments" ON public.mcp_environments FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update environments" ON public.mcp_environments FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete environments" ON public.mcp_environments FOR DELETE USING (true);

INSERT INTO public.mcp_environments (name, url, sort_order) VALUES
  ('dev', 'https://dev.mcp.soundcheck.live/mcp', 0),
  ('staging', 'https://staging.mcp.soundcheck.live/mcp', 1),
  ('prod', 'https://mcp.soundcheck.live/mcp', 2);

CREATE TABLE public.mcp_test_cases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  category text NOT NULL,
  expected_tool text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_test_cases TO anon, authenticated;
GRANT ALL ON public.mcp_test_cases TO service_role;
ALTER TABLE public.mcp_test_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view test cases" ON public.mcp_test_cases FOR SELECT USING (true);
CREATE POLICY "Anyone can add test cases" ON public.mcp_test_cases FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update test cases" ON public.mcp_test_cases FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete test cases" ON public.mcp_test_cases FOR DELETE USING (true);