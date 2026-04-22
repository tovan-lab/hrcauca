-- 1. Dọn duplicates: giữ bản ghi sớm nhất cho mỗi (user_id, shift_id)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id, shift_id ORDER BY check_in_time ASC, id ASC) AS rn
  FROM public.check_ins
  WHERE shift_id IS NOT NULL
)
DELETE FROM public.check_ins
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Dọn duplicates "đang mở" (check_out_time IS NULL): chỉ giữ 1 bản đang mở mới nhất / user
-- (sau khi đã dọn theo shift, vẫn có thể còn bản ghi shift_id NULL trùng nhau)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY check_in_time DESC, id DESC) AS rn
  FROM public.check_ins
  WHERE check_out_time IS NULL
)
DELETE FROM public.check_ins
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3. Dọn duplicates no_shift (1 ngày/user)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, date_trunc('day', check_in_time AT TIME ZONE 'Asia/Ho_Chi_Minh')
           ORDER BY check_in_time ASC, id ASC
         ) AS rn
  FROM public.check_ins
  WHERE shift_id IS NULL
)
DELETE FROM public.check_ins
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 4. Tạo các unique partial index
CREATE UNIQUE INDEX IF NOT EXISTS check_ins_unique_user_shift
  ON public.check_ins (user_id, shift_id)
  WHERE shift_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS check_ins_one_active_per_user
  ON public.check_ins (user_id)
  WHERE check_out_time IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS check_ins_no_shift_one_per_day
  ON public.check_ins (user_id, (date_trunc('day', check_in_time AT TIME ZONE 'Asia/Ho_Chi_Minh')))
  WHERE shift_id IS NULL;