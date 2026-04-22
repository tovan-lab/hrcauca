-- Add approval token column for one-click email approval
ALTER TABLE public.early_checkout_requests
  ADD COLUMN IF NOT EXISTS approval_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS approval_action_at timestamptz;

-- Backfill tokens for existing pending rows (so they can still be approved)
UPDATE public.early_checkout_requests
SET approval_token = encode(gen_random_bytes(24), 'hex')
WHERE approval_token IS NULL;

-- Trigger to auto-generate token on insert
CREATE OR REPLACE FUNCTION public.set_early_checkout_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approval_token IS NULL THEN
    NEW.approval_token := encode(gen_random_bytes(24), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_early_checkout_token ON public.early_checkout_requests;
CREATE TRIGGER trg_set_early_checkout_token
  BEFORE INSERT ON public.early_checkout_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_early_checkout_token();

-- Public RPC to approve/reject by token (no auth required, token IS the proof)
CREATE OR REPLACE FUNCTION public.approve_early_checkout_by_token(
  _token text,
  _action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req record;
  _new_status text;
BEGIN
  IF _action NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  SELECT * INTO _req
  FROM public.early_checkout_requests
  WHERE approval_token = _token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_not_found');
  END IF;

  IF _req.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'already_processed',
      'status', _req.status,
      'employee_id', _req.employee_id
    );
  END IF;

  _new_status := CASE WHEN _action = 'approve' THEN 'approved' ELSE 'rejected' END;

  UPDATE public.early_checkout_requests
  SET status = _new_status,
      responded_at = now(),
      approval_action_at = now(),
      response_note = CASE WHEN _action = 'reject' THEN COALESCE(NULLIF(response_note, ''), 'Từ chối qua email') ELSE response_note END
  WHERE id = _req.id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', _new_status,
    'employee_id', _req.employee_id
  );
END;
$$;

-- Allow anonymous/authenticated to call this RPC (token is the auth)
GRANT EXECUTE ON FUNCTION public.approve_early_checkout_by_token(text, text) TO anon, authenticated;