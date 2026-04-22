CREATE TABLE IF NOT EXISTS public.admin_action_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_key text NOT NULL,
  target_hint text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_action_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages admin_action_rate_limits"
  ON public.admin_action_rate_limits FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins and HR read own admin action rate limit logs"
  ON public.admin_action_rate_limits FOR SELECT
  USING (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'ADMIN'::app_role)
    OR has_role(auth.uid(), 'HR'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_admin_action_rate_limits_user_action_created
  ON public.admin_action_rate_limits (user_id, action_key, created_at DESC);
