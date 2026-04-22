
-- Add status column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- Update existing profiles to active (they're already approved)
UPDATE public.profiles SET status = 'active' WHERE status = 'pending';

-- Update the handle_new_user function to set status = 'pending'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, name, email, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    'pending'
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'EMPLOYEE');
  RETURN NEW;
END;
$function$;

-- Create feedback table
CREATE TABLE public.feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can create own feedback"
  ON public.feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Employees can view own feedback"
  ON public.feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins and HR can view all feedback"
  ON public.feedback FOR SELECT
  USING (public.has_role(auth.uid(), 'ADMIN'::app_role) OR public.has_role(auth.uid(), 'HR'::app_role));

CREATE POLICY "Admins and HR can update feedback"
  ON public.feedback FOR UPDATE
  USING (public.has_role(auth.uid(), 'ADMIN'::app_role) OR public.has_role(auth.uid(), 'HR'::app_role));

-- Allow Admin and HR to update any profile (for approval)
CREATE POLICY "Admins and HR can update profiles"
  ON public.profiles FOR UPDATE
  USING (public.has_role(auth.uid(), 'ADMIN'::app_role) OR public.has_role(auth.uid(), 'HR'::app_role));

-- Create storage bucket for check-in images
INSERT INTO storage.buckets (id, name, public) VALUES ('checkin-images', 'checkin-images', true);

-- Storage policies for check-in images
CREATE POLICY "Anyone can view checkin images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'checkin-images');

CREATE POLICY "Authenticated users can upload checkin images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'checkin-images' AND auth.role() = 'authenticated');
