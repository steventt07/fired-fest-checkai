CREATE TABLE public.event_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  category TEXT NOT NULL,
  size TEXT NOT NULL,
  content TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.event_files TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_files TO authenticated;
GRANT ALL ON public.event_files TO service_role;

ALTER TABLE public.event_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view training files"
  ON public.event_files FOR SELECT
  USING (true);

CREATE POLICY "Anyone can add training files"
  ON public.event_files FOR INSERT
  WITH CHECK (true);

CREATE INDEX event_files_created_at_idx ON public.event_files (created_at DESC);