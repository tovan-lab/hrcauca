
-- Create branches table
CREATE TABLE public.branches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_name TEXT NOT NULL,
  address TEXT DEFAULT '',
  manager_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view branches" ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage branches" ON public.branches FOR ALL USING (has_role(auth.uid(), 'ADMIN'));

CREATE TRIGGER update_branches_updated_at
BEFORE UPDATE ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add branch_id and is_active to profiles
ALTER TABLE public.profiles
  ADD COLUMN branch_id UUID REFERENCES public.branches(id),
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- Add branch_id to check_ins
ALTER TABLE public.check_ins
  ADD COLUMN branch_id UUID REFERENCES public.branches(id);

-- Add branch_id to evaluations
ALTER TABLE public.evaluations
  ADD COLUMN branch_id UUID REFERENCES public.branches(id);
