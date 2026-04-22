ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS scheduled_shift_date date,
  ADD COLUMN IF NOT EXISTS scheduled_start_time time,
  ADD COLUMN IF NOT EXISTS scheduled_end_time time;
