DELETE FROM check_ins;
DELETE FROM shifts;

-- Allow ADMIN and HR to delete shifts
CREATE POLICY "Admins and HR can delete shifts"
ON public.shifts
FOR DELETE
USING (has_role(auth.uid(), 'ADMIN'::app_role) OR has_role(auth.uid(), 'HR'::app_role));