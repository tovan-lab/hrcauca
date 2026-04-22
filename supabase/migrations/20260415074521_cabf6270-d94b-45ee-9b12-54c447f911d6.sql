-- Make checkin-images bucket private
UPDATE storage.buckets SET public = false WHERE id = 'checkin-images';

-- Drop existing public select policy if any
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for checkin-images" ON storage.objects;

-- Authenticated users can view their own check-in photos
CREATE POLICY "Users can view own checkin images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'checkin-images'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR public.has_role(auth.uid(), 'HR'::public.app_role)
  )
);

-- Users can upload to their own folder
CREATE POLICY "Users can upload own checkin images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'checkin-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can update their own files (for avatar upsert)
CREATE POLICY "Users can update own checkin images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'checkin-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Block anonymous access completely
REVOKE ALL ON ALL TABLES IN SCHEMA storage FROM anon;
