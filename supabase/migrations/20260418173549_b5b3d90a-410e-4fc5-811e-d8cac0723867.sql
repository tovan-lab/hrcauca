
-- Tạo bảng yêu cầu xin checkout sớm (vượt ngưỡng 30 phút)
CREATE TABLE IF NOT EXISTS public.early_checkout_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  check_in_id UUID NOT NULL,
  shift_id UUID,
  branch_id UUID,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  responded_by UUID,
  responded_at TIMESTAMP WITH TIME ZONE,
  response_note TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_early_checkout_emp ON public.early_checkout_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_early_checkout_branch_status ON public.early_checkout_requests(branch_id, status);

-- RLS
ALTER TABLE public.early_checkout_requests ENABLE ROW LEVEL SECURITY;

-- Nhân viên: tạo & xem yêu cầu của chính mình
CREATE POLICY "Employees create own early-checkout requests"
ON public.early_checkout_requests
FOR INSERT
WITH CHECK (auth.uid() = employee_id);

CREATE POLICY "Employees view own early-checkout requests"
ON public.early_checkout_requests
FOR SELECT
USING (auth.uid() = employee_id);

-- HR (quản lý chi nhánh): xem & duyệt yêu cầu của chi nhánh mình
CREATE POLICY "HR view branch early-checkout requests"
ON public.early_checkout_requests
FOR SELECT
USING (has_role(auth.uid(), 'HR'::app_role) AND branch_id = current_user_branch_id());

CREATE POLICY "HR update branch early-checkout requests"
ON public.early_checkout_requests
FOR UPDATE
USING (has_role(auth.uid(), 'HR'::app_role) AND branch_id = current_user_branch_id());

-- Admin: full access
CREATE POLICY "Admins manage all early-checkout requests"
ON public.early_checkout_requests
FOR ALL
USING (has_role(auth.uid(), 'ADMIN'::app_role));

-- Trigger updated_at
CREATE TRIGGER update_early_checkout_updated_at
BEFORE UPDATE ON public.early_checkout_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.early_checkout_requests;
