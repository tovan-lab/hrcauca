-- Đổi default sang true để mọi check-in mới tự động được xác nhận
ALTER TABLE public.check_ins
  ALTER COLUMN verified SET DEFAULT true;

-- Cập nhật các bản ghi cũ đang chưa verified
UPDATE public.check_ins
SET verified = true
WHERE verified IS DISTINCT FROM true;