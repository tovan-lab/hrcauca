DO $$
DECLARE
  keep_ids uuid[] := ARRAY[
    '21b315cf-7627-4c21-824c-c55e44a4ac9d'::uuid,
    '0d79c0cd-cc9f-4972-bf81-d2df0cb628e7'::uuid
  ];
BEGIN
  DELETE FROM public.early_checkout_requests;
  DELETE FROM public.swap_request_messages;
  DELETE FROM public.shift_swap_requests;
  DELETE FROM public.branch_assignments;
  DELETE FROM public.shift_edit_logs;
  DELETE FROM public.check_ins;
  DELETE FROM public.shifts;
  DELETE FROM public.evaluations;
  DELETE FROM public.feedback;
  DELETE FROM public.hr_notifications;

  DELETE FROM public.user_roles WHERE user_id <> ALL(keep_ids);
  DELETE FROM public.profiles WHERE user_id <> ALL(keep_ids);
  DELETE FROM auth.users WHERE id <> ALL(keep_ids);
END $$;