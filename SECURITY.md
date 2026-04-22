# Security Audit

Tài liệu này ghi lại hiện trạng bảo mật của dự án theo hướng "siết dần nhưng không phá logic hiện tại".

## Kết luận nhanh

- Không thể ngăn người khác tải frontend nếu web public.
- Có thể bảo vệ dữ liệu, quyền truy cập, secret và chức năng nhạy cảm.
- Hệ thống hiện đã có nền tảng khá tốt ở `Supabase Auth + RLS`, nhưng vẫn còn một số điểm cần lưu ý.

## Các phần đã ổn

- `.env` không được commit.
- Secret nhạy cảm như `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` chỉ dùng ở Edge Function.
- Nhiều bảng chính đã bật `RLS`.
- Các function quản trị quan trọng đều kiểm tra role ở backend thay vì chỉ tin frontend.
- Ảnh check-in đã được chuyển sang bucket private và có policy theo thư mục user.

## Các phần cần chú ý

### 1. CAPTCHA hiện chưa bảo vệ thật

File: `src/components/CaptchaWrapper.tsx`

- CAPTCHA hiện tại là mock frontend.
- Không có verify token ở backend.
- Kết luận: chống bot/bruteforce chưa có hiệu lực thực tế.

Khuyến nghị:

- Thay bằng Cloudflare Turnstile hoặc reCAPTCHA thật.
- Verify token phía server trước khi cho login/register tiếp tục.

### 2. Rate limit đang ở frontend

File: `src/hooks/useLoginRateLimit.ts`

- Lock đăng nhập lưu trong `localStorage`.
- Có thể bypass bằng cách xóa localStorage, đổi browser hoặc gọi API trực tiếp.

Khuyến nghị:

- Chuyển rate limit sang backend theo `IP + email`.

### 3. Edge Function còn mở CORS rộng

Các function hiện dùng:

- `Access-Control-Allow-Origin: *`

Đây không hẳn là lỗi ngay lập tức, nhưng mở bề mặt tấn công lớn hơn cần thiết.

Khuyến nghị:

- Ở production, giới hạn về domain chính thức của web nếu có thể.

### 4. Một số function đang `verify_jwt = false`

File: `supabase/config.toml`

- Có function public là hợp lý.
- Nhưng mỗi function public cần review kỹ logic xác thực riêng.

Khuyến nghị:

- Giữ nguyên trước nếu đang chạy ổn.
- Review từng function rồi bật `verify_jwt = true` khi an toàn.

## Audit RLS theo nghiệp vụ

### profiles

- Đã bật RLS.
- User đọc/sửa hồ sơ của mình.
- Admin/HR đọc toàn bộ.
- Admin/HR được update profile.

Đánh giá:

- Hợp lý cho nghiệp vụ hiện tại.

### user_roles

- Đã bật RLS.
- User đọc role của mình.
- Admin quản lý role.

Đánh giá:

- Hợp lý.

### shifts

- Đã bật RLS.
- Nhân viên được xem/tạo/sửa/xóa ca của chính mình.
- Admin/HR xem toàn bộ.
- Admin/HR có policy tạo/sửa/xóa ở migration sau.

Đánh giá:

- Quyền này rộng, nhưng là **phù hợp với nghiệp vụ hiện tại** vì web có màn `ShiftRegistration` cho nhân viên tự đăng ký ca.
- Không nên siết ngay nếu chưa thay đổi luồng nghiệp vụ.

Khuyến nghị:

- Nếu sau này muốn an toàn hơn, chuyển sang mô hình:
  - nhân viên chỉ tạo "yêu cầu đăng ký ca"
  - HR/Admin duyệt rồi mới ghi vào `shifts`

### check_ins

- Đã bật RLS.
- Nhân viên tạo/xem/sửa check-in của mình.
- Admin/HR xem và update toàn bộ.

Đánh giá:

- Hợp lý nếu nhân viên cần check-out hoặc bổ sung dữ liệu phiên của chính mình.
- Cần kiểm tra kỹ các field nhạy cảm như `verified`, `verified_by`, `attendance_status` có bị user thường sửa trực tiếp không.

Khuyến nghị:

- Tách policy update:
  - user thường chỉ sửa `check_out_time`
  - HR/Admin mới được sửa field xác minh

### evaluations

- Đã bật RLS.
- Admin/HR quản lý toàn bộ.
- Nhân viên xem đánh giá của mình.

Đánh giá:

- Tốt.

### feedback

- Đã bật RLS.
- Nhân viên tạo/xem feedback của mình.
- Admin/HR xem/update toàn bộ.

Đánh giá:

- Tốt.

### branches

- Đã bật RLS.
- Mọi user authenticated đều được đọc.
- Admin quản lý.

Đánh giá:

- Chấp nhận được vì đây thường là dữ liệu danh mục.

### branch_assignments / shift_swap_requests / swap_request_messages / hr_notifications / early_checkout_requests / forgot_checkout_runs

- Đều đã bật RLS và có policy theo role/chi nhánh tương đối rõ.

Đánh giá:

- Đây là nhóm dữ liệu được thiết kế cẩn thận hơn mức trung bình.

## Việc nên làm theo thứ tự an toàn

### Mức 1: ít rủi ro, nên làm ngay

- Giữ security headers production.
- Tắt source map production.
- Không commit dữ liệu export.
- Rà secret định kỳ.

### Mức 2: tăng bảo mật nhưng ít ảnh hưởng logic

- CAPTCHA thật + verify server-side.
- Rate limit backend cho login/register/chatbot.
- Audit field-level cho `check_ins`.

### Mức 3: cần thiết kế lại nghiệp vụ

- Đổi `shifts` từ "nhân viên tự sửa trực tiếp" sang "gửi yêu cầu rồi HR/Admin duyệt".
- Siết toàn bộ function public về `verify_jwt = true` khi xác nhận frontend đã tương thích.

## Gợi ý triển khai tiếp

Nếu tiếp tục theo hướng an toàn tối đa nhưng ít làm gãy web, thứ tự khuyến nghị là:

1. Tích hợp CAPTCHA thật.
2. Thêm rate limit backend cho login và chatbot.
3. Audit field-level cho `check_ins`.
4. Sau cùng mới cân nhắc đổi mô hình `shifts`.
