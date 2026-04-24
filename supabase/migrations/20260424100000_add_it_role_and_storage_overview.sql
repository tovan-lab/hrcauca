DO $$
BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'IT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
