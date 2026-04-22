
DO $$
DECLARE
  branch1 uuid := '8001bf49-ac82-4ad4-a96e-ae27a8d36cf5';
  branch2 uuid := 'ec9a89f8-89dc-4f97-9c81-165aa02b4ab1';
  uids uuid[];
  uid uuid;
  names text[] := ARRAY['Test Nguyễn An','Test Trần Bình','Test Lê Cường','Test Phạm Dung','Test Hoàng Em',
                        'Test Vũ Phong','Test Đỗ Giang','Test Bùi Hà','Test Ngô Inh','Test Lý Khoa'];
  i int;
  d int;
  shift_d date;
  ci_time timestamptz;
  co_time timestamptz;
  late_min int;
  early_min int;
  status_val text;
  scores jsonb;
  total numeric;
  bonus numeric;
  hr_uid uuid;
BEGIN
  uids := ARRAY[]::uuid[];

  -- Create 10 auth users (needed for FK constraint on profiles)
  FOR i IN 1..10 LOOP
    uid := gen_random_uuid();
    uids := array_append(uids, uid);
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'testemp' || i || '@mock.local',
      crypt('TestPass123!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', names[i]),
      now(), now(), '', '', '', ''
    );
  END LOOP;

  -- handle_new_user trigger creates profiles + EMPLOYEE roles automatically.
  -- Update profiles with branch + approved status
  FOR i IN 1..10 LOOP
    UPDATE profiles
    SET department = CASE WHEN i % 2 = 0 THEN 'Phục vụ' ELSE 'Bếp' END,
        branch_id = CASE WHEN i <= 5 THEN branch1 ELSE branch2 END,
        status = 'approved',
        is_active = true
    WHERE user_id = uids[i];
  END LOOP;

  SELECT user_id INTO hr_uid FROM user_roles WHERE role IN ('ADMIN','HR') LIMIT 1;
  IF hr_uid IS NULL THEN hr_uid := uids[1]; END IF;

  FOR i IN 1..10 LOOP
    FOR d IN 0..6 LOOP
      shift_d := CURRENT_DATE - d;
      INSERT INTO shifts (user_id, shift_date, shift_type, start_time, end_time)
      VALUES (uids[i], shift_d, 'FULL_TIME_8H', '08:00', '17:00');

      IF i IN (1,2,5,7) THEN
        late_min := 0; early_min := 0; status_val := 'on_time';
        ci_time := shift_d + time '07:55'; co_time := shift_d + time '17:05';
      ELSIF i IN (3,8) THEN
        late_min := 15; early_min := 0; status_val := 'late';
        ci_time := shift_d + time '08:15'; co_time := shift_d + time '17:10';
      ELSIF i IN (4,9) THEN
        late_min := 0; early_min := 20; status_val := 'early_leave';
        ci_time := shift_d + time '07:58'; co_time := shift_d + time '16:40';
      ELSE
        late_min := 25; early_min := 15; status_val := 'late_and_early';
        ci_time := shift_d + time '08:25'; co_time := shift_d + time '16:45';
      END IF;

      INSERT INTO check_ins (user_id, image_url, check_in_time, check_out_time,
                             attendance_status, late_minutes, early_leave_minutes,
                             branch_id, status, verified)
      VALUES (uids[i], 'https://placehold.co/200', ci_time, co_time,
              status_val::attendance_status, late_min, early_min,
              CASE WHEN i <= 5 THEN branch1 ELSE branch2 END, true, true);
    END LOOP;

    IF i = 1 THEN total := 95; bonus := 5;
    ELSIF i = 2 THEN total := 92; bonus := 3;
    ELSIF i = 3 THEN total := 80; bonus := 0;
    ELSIF i = 4 THEN total := 75; bonus := 0;
    ELSIF i = 5 THEN total := 78; bonus := 0;
    ELSIF i = 6 THEN total := 65; bonus := 0;
    ELSIF i = 7 THEN total := 60; bonus := 0;
    ELSE total := 82; bonus := 2;
    END IF;

    scores := jsonb_build_object(
      'thai_do', total*0.3, 'tac_phong', total*0.25,
      'ky_nang', total*0.25, 'hieu_qua', total*0.2
    );

    INSERT INTO evaluations (employee_id, hr_id, branch_id, total_score, bonus_score,
                             categories_scores, manager_comment, evaluation_date)
    VALUES (uids[i], hr_uid,
            CASE WHEN i <= 5 THEN branch1 ELSE branch2 END,
            total, bonus, scores,
            'Đánh giá test cho ' || names[i], CURRENT_DATE - 1);

    IF i = 7 THEN
      INSERT INTO evaluations (employee_id, hr_id, branch_id, total_score, bonus_score, categories_scores, manager_comment, evaluation_date)
      VALUES (uids[i], hr_uid, branch2, 55, 0, scores, 'Lần 2', CURRENT_DATE - 5),
             (uids[i], hr_uid, branch2, 62, 0, scores, 'Lần 3', CURRENT_DATE - 10);
    END IF;

    IF i IN (3, 8) THEN
      INSERT INTO shift_edit_logs (employee_id, edited_by, edit_month, edit_count, penalty_amount)
      VALUES (uids[i], hr_uid, to_char(CURRENT_DATE, 'YYYY-MM'),
              CASE WHEN i = 3 THEN 2 ELSE 4 END,
              CASE WHEN i = 3 THEN 0 ELSE 100000 END);
    END IF;
  END LOOP;
END $$;
