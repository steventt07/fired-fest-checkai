ALTER TABLE public.event_files
  ADD COLUMN IF NOT EXISTS category_override text,
  ADD COLUMN IF NOT EXISTS category_correct boolean,
  ADD COLUMN IF NOT EXISTS quality text;

CREATE TABLE public.generation_presets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  event_type text NOT NULL,
  details text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generation_presets TO anon, authenticated;
GRANT ALL ON public.generation_presets TO service_role;

ALTER TABLE public.generation_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view presets" ON public.generation_presets FOR SELECT USING (true);
CREATE POLICY "Anyone can add presets" ON public.generation_presets FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update presets" ON public.generation_presets FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete presets" ON public.generation_presets FOR DELETE USING (true);