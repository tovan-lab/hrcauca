
CREATE OR REPLACE FUNCTION public.get_storage_usage()
RETURNS TABLE (
  total_files bigint,
  total_bytes bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_files,
    COALESCE(SUM((metadata->>'size')::bigint), 0)::bigint AS total_bytes
  FROM storage.objects
  WHERE bucket_id = 'checkin-images';
$$;
