-- Cho phép hủy ca làm việc mà vẫn giữ lịch sử check-in (set shift_id về NULL trên check_ins)
ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_shift_id_fkey;

ALTER TABLE public.check_ins
  ADD CONSTRAINT check_ins_shift_id_fkey
  FOREIGN KEY (shift_id)
  REFERENCES public.shifts(id)
  ON DELETE SET NULL;

-- Tương tự cho early_checkout_requests để hủy ca không bị chặn
ALTER TABLE public.early_checkout_requests
  DROP CONSTRAINT IF EXISTS early_checkout_requests_shift_id_fkey;

-- Cột shift_id có thể chưa có FK chính thức, thêm để rõ ràng + cho phép NULL khi ca bị xóa
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'early_checkout_requests'
      AND column_name = 'shift_id'
  ) THEN
    BEGIN
      ALTER TABLE public.early_checkout_requests
        ADD CONSTRAINT early_checkout_requests_shift_id_fkey
        FOREIGN KEY (shift_id)
        REFERENCES public.shifts(id)
        ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;