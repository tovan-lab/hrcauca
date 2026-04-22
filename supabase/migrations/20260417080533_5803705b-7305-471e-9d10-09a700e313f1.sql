-- ============ 1. SHIFTS: thêm cột actual_branch_id, assignment_id, swap_request_id ============
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS actual_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_id uuid,
  ADD COLUMN IF NOT EXISTS swap_request_id uuid;

CREATE INDEX IF NOT EXISTS idx_shifts_actual_branch ON public.shifts(actual_branch_id);
CREATE INDEX IF NOT EXISTS idx_shifts_assignment ON public.shifts(assignment_id);

-- ============ 2. BRANCH_ASSIGNMENTS: biệt phái dài ngày ============
CREATE TABLE IF NOT EXISTS public.branch_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  from_branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  to_branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active', -- active | cancelled | ended
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (from_branch_id <> to_branch_id)
);

CREATE INDEX IF NOT EXISTS idx_assign_emp ON public.branch_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_assign_from ON public.branch_assignments(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_assign_to ON public.branch_assignments(to_branch_id);
CREATE INDEX IF NOT EXISTS idx_assign_dates ON public.branch_assignments(start_date, end_date);

ALTER TABLE public.branch_assignments ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_assign_updated_at
  BEFORE UPDATE ON public.branch_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: lấy branch_id của user hiện tại
CREATE OR REPLACE FUNCTION public.current_user_branch_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT branch_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Helper: lấy home branch của 1 nhân viên
CREATE OR REPLACE FUNCTION public.get_employee_home_branch(_employee_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT branch_id FROM public.profiles WHERE user_id = _employee_id LIMIT 1;
$$;

-- RLS branch_assignments
CREATE POLICY "Admins manage all assignments" ON public.branch_assignments
  FOR ALL USING (has_role(auth.uid(), 'ADMIN'::app_role));

CREATE POLICY "HR view assignments of their branch" ON public.branch_assignments
  FOR SELECT USING (
    has_role(auth.uid(), 'HR'::app_role)
    AND (from_branch_id = current_user_branch_id() OR to_branch_id = current_user_branch_id())
  );

CREATE POLICY "HR create assignments from their branch" ON public.branch_assignments
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'HR'::app_role)
    AND from_branch_id = current_user_branch_id()
    AND from_branch_id = get_employee_home_branch(employee_id)
  );

CREATE POLICY "HR update assignments of their branch" ON public.branch_assignments
  FOR UPDATE USING (
    has_role(auth.uid(), 'HR'::app_role)
    AND (from_branch_id = current_user_branch_id() OR to_branch_id = current_user_branch_id())
  );

CREATE POLICY "Employees view own assignments" ON public.branch_assignments
  FOR SELECT USING (auth.uid() = employee_id);

-- ============ 3. SHIFT_SWAP_REQUESTS: yêu cầu chi viện / đổi ca ============
CREATE TABLE IF NOT EXISTS public.shift_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL DEFAULT 'support', -- support | swap | transfer
  from_branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  to_branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL, -- nhân viên được biệt phái (thuộc from_branch)
  shift_date date NOT NULL,
  shift_id uuid, -- ca cụ thể (nullable nếu là support chung)
  start_time time,
  end_time time,
  shift_type shift_type DEFAULT 'FULL_TIME_8H',
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected | cancelled
  requested_by uuid NOT NULL,
  responded_by uuid,
  responded_at timestamptz,
  response_note text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_branch_id <> to_branch_id)
);

CREATE INDEX IF NOT EXISTS idx_swap_from ON public.shift_swap_requests(from_branch_id, status);
CREATE INDEX IF NOT EXISTS idx_swap_to ON public.shift_swap_requests(to_branch_id, status);
CREATE INDEX IF NOT EXISTS idx_swap_emp ON public.shift_swap_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_swap_date ON public.shift_swap_requests(shift_date);

ALTER TABLE public.shift_swap_requests ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_swap_updated_at
  BEFORE UPDATE ON public.shift_swap_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS swap requests
CREATE POLICY "Admins manage all swap requests" ON public.shift_swap_requests
  FOR ALL USING (has_role(auth.uid(), 'ADMIN'::app_role));

CREATE POLICY "HR view swap requests of their branch" ON public.shift_swap_requests
  FOR SELECT USING (
    has_role(auth.uid(), 'HR'::app_role)
    AND (from_branch_id = current_user_branch_id() OR to_branch_id = current_user_branch_id())
  );

CREATE POLICY "HR create swap requests from their branch" ON public.shift_swap_requests
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'HR'::app_role)
    AND from_branch_id = current_user_branch_id()
    AND from_branch_id = get_employee_home_branch(employee_id)
  );

CREATE POLICY "HR update swap requests of their branch" ON public.shift_swap_requests
  FOR UPDATE USING (
    has_role(auth.uid(), 'HR'::app_role)
    AND (from_branch_id = current_user_branch_id() OR to_branch_id = current_user_branch_id())
  );

CREATE POLICY "Employees view own swap requests" ON public.shift_swap_requests
  FOR SELECT USING (auth.uid() = employee_id);

-- ============ 4. SWAP_REQUEST_MESSAGES: chat giữa 2 HR ============
CREATE TABLE IF NOT EXISTS public.swap_request_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.shift_swap_requests(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swap_msg_req ON public.swap_request_messages(request_id, created_at);

ALTER TABLE public.swap_request_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all swap messages" ON public.swap_request_messages
  FOR ALL USING (has_role(auth.uid(), 'ADMIN'::app_role));

CREATE POLICY "HR view messages of their branch requests" ON public.swap_request_messages
  FOR SELECT USING (
    has_role(auth.uid(), 'HR'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.shift_swap_requests r
      WHERE r.id = request_id
        AND (r.from_branch_id = current_user_branch_id() OR r.to_branch_id = current_user_branch_id())
    )
  );

CREATE POLICY "HR send messages on their branch requests" ON public.swap_request_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND has_role(auth.uid(), 'HR'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.shift_swap_requests r
      WHERE r.id = request_id
        AND (r.from_branch_id = current_user_branch_id() OR r.to_branch_id = current_user_branch_id())
    )
  );

-- ============ 5. HR_NOTIFICATIONS: thông báo in-app ============
CREATE TABLE IF NOT EXISTS public.hr_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL, -- swap_request_new | swap_request_approved | swap_request_rejected | swap_request_message | assignment_started | assignment_ended
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  related_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON public.hr_notifications(user_id, is_read, created_at DESC);

ALTER TABLE public.hr_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications" ON public.hr_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications" ON public.hr_notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users delete own notifications" ON public.hr_notifications
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Service & HR can insert notifications" ON public.hr_notifications
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role'
    OR has_role(auth.uid(), 'ADMIN'::app_role)
    OR has_role(auth.uid(), 'HR'::app_role)
  );

-- ============ 6. TRIGGER: khi swap_request được approve, tự cập nhật actual_branch_id ============
CREATE OR REPLACE FUNCTION public.apply_swap_request_on_approve()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    -- Cập nhật ca cụ thể nếu có shift_id
    IF NEW.shift_id IS NOT NULL THEN
      UPDATE public.shifts
      SET actual_branch_id = NEW.to_branch_id,
          swap_request_id = NEW.id
      WHERE id = NEW.shift_id;
    ELSE
      -- Nếu không có ca cụ thể, tạo mới ca cho nhân viên
      INSERT INTO public.shifts (user_id, shift_date, shift_type, start_time, end_time, actual_branch_id, swap_request_id)
      VALUES (
        NEW.employee_id,
        NEW.shift_date,
        COALESCE(NEW.shift_type, 'FULL_TIME_8H'::shift_type),
        COALESCE(NEW.start_time, '08:00'::time),
        COALESCE(NEW.end_time, '17:00'::time),
        NEW.to_branch_id,
        NEW.id
      );
    END IF;

    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_swap_on_approve
  BEFORE UPDATE ON public.shift_swap_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_swap_request_on_approve();

-- ============ 7. REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.hr_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_swap_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.swap_request_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.branch_assignments;
ALTER TABLE public.hr_notifications REPLICA IDENTITY FULL;
ALTER TABLE public.shift_swap_requests REPLICA IDENTITY FULL;
ALTER TABLE public.swap_request_messages REPLICA IDENTITY FULL;
ALTER TABLE public.branch_assignments REPLICA IDENTITY FULL;