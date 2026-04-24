CREATE OR REPLACE FUNCTION public.is_it_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'IT'::public.app_role
  );
$$;

CREATE OR REPLACE FUNCTION public.get_total_storage_usage()
RETURNS TABLE (
  total_bytes bigint,
  total_files bigint,
  bucket_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT
    COALESCE(SUM(COALESCE((objects.metadata->>'size')::bigint, 0)), 0) AS total_bytes,
    COUNT(*)::bigint AS total_files,
    COUNT(DISTINCT objects.bucket_id)::bigint AS bucket_count
  FROM storage.objects AS objects;
$$;

CREATE OR REPLACE FUNCTION public.get_storage_usage_by_bucket()
RETURNS TABLE (
  bucket_id text,
  total_bytes bigint,
  total_files bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT
    objects.bucket_id::text,
    COALESCE(SUM(COALESCE((objects.metadata->>'size')::bigint, 0)), 0) AS total_bytes,
    COUNT(*)::bigint AS total_files
  FROM storage.objects AS objects
  GROUP BY objects.bucket_id
  ORDER BY total_bytes DESC, bucket_id ASC;
$$;

CREATE OR REPLACE FUNCTION public.prevent_it_role_modification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.role = 'IT'::public.app_role THEN
    RAISE EXCEPTION 'Không được xóa quyền IT.';
  END IF;

  IF TG_OP = 'UPDATE' AND (OLD.role = 'IT'::public.app_role OR NEW.role = 'IT'::public.app_role) THEN
    RAISE EXCEPTION 'Không được chỉnh sửa quyền IT.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS lock_it_user_roles ON public.user_roles;
CREATE TRIGGER lock_it_user_roles
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_it_role_modification();

GRANT EXECUTE ON FUNCTION public.is_it_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_total_storage_usage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_storage_usage_by_bucket() TO authenticated;
