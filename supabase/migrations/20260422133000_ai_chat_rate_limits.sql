CREATE TABLE IF NOT EXISTS public.ai_chat_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_preview text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_chat_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages ai_chat_rate_limits"
  ON public.ai_chat_rate_limits FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins and HR read own ai chat rate limit logs"
  ON public.ai_chat_rate_limits FOR SELECT
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'ADMIN'::app_role) OR has_role(auth.uid(), 'HR'::app_role));

CREATE INDEX IF NOT EXISTS idx_ai_chat_rate_limits_user_created_at
  ON public.ai_chat_rate_limits (user_id, created_at DESC);
