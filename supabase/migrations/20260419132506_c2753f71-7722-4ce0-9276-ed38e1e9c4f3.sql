-- Track which (branch, date) already received the forgot-checkout summary email,
-- to ensure exactly-once delivery per day per branch.
CREATE TABLE IF NOT EXISTS public.forgot_checkout_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL,
  report_date date NOT NULL,
  employee_count integer NOT NULL DEFAULT 0,
  hr_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forgot_checkout_runs_branch_date_unique UNIQUE (branch_id, report_date)
);

ALTER TABLE public.forgot_checkout_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages forgot_checkout_runs"
  ON public.forgot_checkout_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins read forgot_checkout_runs"
  ON public.forgot_checkout_runs FOR SELECT
  USING (has_role(auth.uid(), 'ADMIN'::app_role));

CREATE POLICY "HR read own branch forgot_checkout_runs"
  ON public.forgot_checkout_runs FOR SELECT
  USING (has_role(auth.uid(), 'HR'::app_role) AND branch_id = current_user_branch_id());

CREATE INDEX IF NOT EXISTS idx_forgot_checkout_runs_branch_date
  ON public.forgot_checkout_runs (branch_id, report_date DESC);