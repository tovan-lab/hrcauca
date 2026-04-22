import { supabase } from '@/integrations/supabase/client';

interface NotifyHrParams {
  requestId: string;
  // Other fields kept optional for backward compat — server reloads from DB.
  token?: string;
  branchId?: string | null;
  employeeName?: string;
  shiftId?: string | null;
  checkInTime?: string;
  earlyMinutes?: number;
  reason?: string;
}

/**
 * Notify HR (or fallback ADMIN) about a new early-checkout request.
 * The actual recipient lookup + email send runs in the
 * `notify-early-checkout-hr` edge function with service-role privileges,
 * because RLS on `profiles` blocks employees from seeing their HR's email.
 *
 * Best-effort: failures here must NOT block the request submission.
 */
export async function notifyHrByEmail(params: NotifyHrParams): Promise<void> {
  if (!params.requestId) return;
  try {
    await supabase.functions.invoke('notify-early-checkout-hr', {
      body: { requestId: params.requestId },
    });
  } catch (e) {
    console.warn('[notifyHrByEmail] failed', e);
  }
}
