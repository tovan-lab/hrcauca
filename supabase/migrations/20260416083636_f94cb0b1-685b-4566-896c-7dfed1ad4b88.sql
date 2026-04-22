
-- Table to track monthly shift edits per employee for penalty system
CREATE TABLE public.shift_edit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  edited_by UUID NOT NULL,
  edit_month TEXT NOT NULL, -- format: YYYY-MM
  edit_count INTEGER NOT NULL DEFAULT 0,
  penalty_amount INTEGER NOT NULL DEFAULT 0, -- in VND
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(employee_id, edit_month)
);

-- Enable RLS
ALTER TABLE public.shift_edit_logs ENABLE ROW LEVEL SECURITY;

-- Admins and HR can manage
CREATE POLICY "Admins and HR can manage shift edit logs"
ON public.shift_edit_logs
FOR ALL
USING (has_role(auth.uid(), 'ADMIN'::app_role) OR has_role(auth.uid(), 'HR'::app_role));

-- Employees can view own
CREATE POLICY "Employees can view own shift edit logs"
ON public.shift_edit_logs
FOR SELECT
USING (auth.uid() = employee_id);

-- Trigger for updated_at
CREATE TRIGGER update_shift_edit_logs_updated_at
BEFORE UPDATE ON public.shift_edit_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
