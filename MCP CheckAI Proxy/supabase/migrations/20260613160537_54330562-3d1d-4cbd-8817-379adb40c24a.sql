ALTER TABLE public.event_files
  ADD COLUMN IF NOT EXISTS batch_id uuid,
  ADD COLUMN IF NOT EXISTS batch_label text;

CREATE INDEX IF NOT EXISTS event_files_batch_id_idx ON public.event_files (batch_id);