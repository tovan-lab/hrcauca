CREATE TABLE IF NOT EXISTS public.ai_chat_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_role app_role NOT NULL,
  branch_id uuid NULL REFERENCES public.branches(id) ON DELETE SET NULL,
  actor_name text NULL,
  user_message text NOT NULL DEFAULT '',
  assistant_reply text NOT NULL DEFAULT '',
  mutations_applied boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_chat_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages ai chat audit logs"
  ON public.ai_chat_audit_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can read all ai chat audit logs"
  ON public.ai_chat_audit_logs FOR SELECT
  USING (has_role(auth.uid(), 'ADMIN'::app_role));

CREATE POLICY "HR can read own ai chat audit logs"
  ON public.ai_chat_audit_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_chat_audit_logs_conversation_created_at
  ON public.ai_chat_audit_logs (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_chat_audit_logs_user_created_at
  ON public.ai_chat_audit_logs (user_id, created_at DESC);
