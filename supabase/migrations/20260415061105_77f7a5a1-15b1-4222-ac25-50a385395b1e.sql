
-- Create check_ins table
CREATE TABLE public.check_ins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  check_in_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own check-ins"
  ON public.check_ins FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Employees can create own check-ins"
  ON public.check_ins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins and HR can view all check-ins"
  ON public.check_ins FOR SELECT
  USING (public.has_role(auth.uid(), 'ADMIN'::app_role) OR public.has_role(auth.uid(), 'HR'::app_role));

-- Create evaluations table
CREATE TABLE public.evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  hr_id UUID NOT NULL,
  evaluation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_score NUMERIC NOT NULL DEFAULT 0,
  categories_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  feedback_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  bonus_score NUMERIC NOT NULL DEFAULT 0,
  manager_comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and HR can manage evaluations"
  ON public.evaluations FOR ALL
  USING (public.has_role(auth.uid(), 'ADMIN'::app_role) OR public.has_role(auth.uid(), 'HR'::app_role));

CREATE POLICY "Employees can view own evaluations"
  ON public.evaluations FOR SELECT
  USING (auth.uid() = employee_id);

-- Trigger for updated_at on evaluations
CREATE TRIGGER update_evaluations_updated_at
  BEFORE UPDATE ON public.evaluations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
