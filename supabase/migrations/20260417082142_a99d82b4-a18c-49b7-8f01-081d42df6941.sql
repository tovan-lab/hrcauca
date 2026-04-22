CREATE OR REPLACE FUNCTION public.handle_swap_request_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    IF NEW.shift_id IS NOT NULL THEN
      UPDATE public.shifts
      SET actual_branch_id = NEW.to_branch_id,
          swap_request_id = NEW.id
      WHERE id = NEW.shift_id;
    ELSE
      -- UPSERT: nếu nhân viên đã có ca trong ngày đó thì update, chưa có thì tạo mới
      INSERT INTO public.shifts (user_id, shift_date, shift_type, start_time, end_time, actual_branch_id, swap_request_id)
      VALUES (
        NEW.employee_id,
        NEW.shift_date,
        COALESCE(NEW.shift_type, 'FULL_TIME_8H'::shift_type),
        COALESCE(NEW.start_time, '08:00'::time),
        COALESCE(NEW.end_time, '17:00'::time),
        NEW.to_branch_id,
        NEW.id
      )
      ON CONFLICT (user_id, shift_date) DO UPDATE
      SET actual_branch_id = EXCLUDED.actual_branch_id,
          swap_request_id = EXCLUDED.swap_request_id,
          shift_type = EXCLUDED.shift_type,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          updated_at = now();
    END IF;

    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;