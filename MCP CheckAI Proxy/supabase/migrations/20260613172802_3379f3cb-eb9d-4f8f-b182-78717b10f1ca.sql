CREATE TABLE public.harness_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  model text NOT NULL,
  input_summary text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'running',
  current_stage text NOT NULL DEFAULT 'intake',
  attempts integer NOT NULL DEFAULT 1,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.harness_runs TO anon, authenticated;
GRANT ALL ON public.harness_runs TO service_role;

ALTER TABLE public.harness_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view harness runs" ON public.harness_runs FOR SELECT USING (true);
CREATE POLICY "Anyone can add harness runs" ON public.harness_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update harness runs" ON public.harness_runs FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete harness runs" ON public.harness_runs FOR DELETE USING (true);

CREATE TABLE public.harness_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.harness_runs(id) ON DELETE CASCADE,
  checkpoint_id text NOT NULL,
  ordinal integer NOT NULL,
  status text NOT NULL,
  criteria text NOT NULL DEFAULT '',
  evidence jsonb,
  material_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.harness_checkpoints TO anon, authenticated;
GRANT ALL ON public.harness_checkpoints TO service_role;

ALTER TABLE public.harness_checkpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view harness checkpoints" ON public.harness_checkpoints FOR SELECT USING (true);
CREATE POLICY "Anyone can add harness checkpoints" ON public.harness_checkpoints FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update harness checkpoints" ON public.harness_checkpoints FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete harness checkpoints" ON public.harness_checkpoints FOR DELETE USING (true);

CREATE INDEX idx_harness_checkpoints_run ON public.harness_checkpoints(run_id, ordinal);

CREATE TRIGGER update_harness_runs_updated_at
  BEFORE UPDATE ON public.harness_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();