
-- Allow ADMIN and HR to insert shifts for any employee
CREATE POLICY "Admins and HR can create shifts"
ON public.shifts
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'ADMIN'::app_role)
  OR public.has_role(auth.uid(), 'HR'::app_role)
);

-- Allow ADMIN and HR to update shifts for any employee
CREATE POLICY "Admins and HR can update shifts"
ON public.shifts
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'ADMIN'::app_role)
  OR public.has_role(auth.uid(), 'HR'::app_role)
);
