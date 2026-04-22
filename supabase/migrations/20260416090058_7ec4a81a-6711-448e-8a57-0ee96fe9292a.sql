
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS allowed_radius_meters integer NOT NULL DEFAULT 50;
