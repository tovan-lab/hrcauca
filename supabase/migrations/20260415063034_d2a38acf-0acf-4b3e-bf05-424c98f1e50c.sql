
-- Create shift type enum
CREATE TYPE public.shift_type AS ENUM ('PART_TIME_4H', 'FULL_TIME_8H');

-- Create attendance status enum
CREATE TYPE public.attendance_status AS ENUM ('on_time', 'late', 'early_leave', 'late_and_early');

-- Create shifts table
CREATE TABLE public.shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  shift_date DATE NOT NULL,
  shift_type public.shift_type NOT NULL DEFAULT 'FULL_TIME_8H',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, shift_date)
);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own shifts" ON public.shifts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Employees can create own shifts" ON public.shifts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Employees can update own shifts" ON public.shifts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Employees can delete own shifts" ON public.shifts FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins and HR can view all shifts" ON public.shifts FOR SELECT USING (has_role(auth.uid(), 'ADMIN') OR has_role(auth.uid(), 'HR'));

-- Add columns to check_ins
ALTER TABLE public.check_ins
  ADD COLUMN check_out_time TIMESTAMP WITH TIME ZONE,
  ADD COLUMN late_minutes INTEGER DEFAULT 0,
  ADD COLUMN early_leave_minutes INTEGER DEFAULT 0,
  ADD COLUMN attendance_status public.attendance_status DEFAULT 'on_time',
  ADD COLUMN verified BOOLEAN DEFAULT false,
  ADD COLUMN verified_by UUID,
  ADD COLUMN shift_id UUID REFERENCES public.shifts(id);

-- Allow Admin/HR to update check_ins (for verification)
CREATE POLICY "Admins and HR can update check-ins" ON public.check_ins FOR UPDATE USING (has_role(auth.uid(), 'ADMIN') OR has_role(auth.uid(), 'HR'));

-- Allow employees to update own check-ins (for check-out)
CREATE POLICY "Employees can update own check-ins" ON public.check_ins FOR UPDATE USING (auth.uid() = user_id);

-- Trigger for shifts updated_at
CREATE TRIGGER update_shifts_updated_at
BEFORE UPDATE ON public.shifts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
