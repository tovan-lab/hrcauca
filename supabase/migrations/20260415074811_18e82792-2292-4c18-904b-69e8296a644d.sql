-- Allow admins to delete any profile
CREATE POLICY "Admins can delete profiles"
ON public.profiles FOR DELETE
USING (public.has_role(auth.uid(), 'ADMIN'::public.app_role));

-- Allow HR to delete profiles in their branch
CREATE POLICY "HR can delete branch profiles"
ON public.profiles FOR DELETE
USING (
  public.has_role(auth.uid(), 'HR'::public.app_role)
  AND branch_id = (SELECT branch_id FROM public.profiles WHERE user_id = auth.uid())
);

-- Allow admins to delete any check-ins
CREATE POLICY "Admins can delete check-ins"
ON public.check_ins FOR DELETE
USING (public.has_role(auth.uid(), 'ADMIN'::public.app_role));

-- Allow HR to delete check-ins for their branch
CREATE POLICY "HR can delete branch check-ins"
ON public.check_ins FOR DELETE
USING (
  public.has_role(auth.uid(), 'HR'::public.app_role)
  AND branch_id = (SELECT branch_id FROM public.profiles WHERE user_id = auth.uid())
);

-- Allow admins/HR to delete evaluations
CREATE POLICY "Admins can delete evaluations"
ON public.evaluations FOR DELETE
USING (public.has_role(auth.uid(), 'ADMIN'::public.app_role));

-- Allow admins/HR to delete feedback
CREATE POLICY "Admins can delete feedback"
ON public.feedback FOR DELETE
USING (public.has_role(auth.uid(), 'ADMIN'::public.app_role));

CREATE POLICY "HR can delete branch feedback"
ON public.feedback FOR DELETE
USING (
  public.has_role(auth.uid(), 'HR'::public.app_role)
  AND user_id IN (
    SELECT user_id FROM public.profiles 
    WHERE branch_id = (SELECT branch_id FROM public.profiles WHERE user_id = auth.uid())
  )
);
