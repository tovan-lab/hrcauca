# HR Cậu Cả

Ứng dụng quản lý nhân sự, ca làm, chấm công, đánh giá và thông báo nội bộ xây bằng `React + Vite + Supabase`.

## Công nghệ

- React 18
- Vite 5
- TypeScript
- Tailwind CSS
- Supabase Auth / Database / Edge Functions

## Yêu cầu

- Node.js 18+
- npm
- Supabase project đã được cấu hình sẵn

## Cài đặt

```bash
npm install
```

Tạo file `.env` từ `.env.example` và điền các biến:

```env
VITE_SUPABASE_PROJECT_ID="your-project-ref"
VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-key"
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
```

## Chạy local

```bash
npm run dev
```

App mặc định chạy tại `http://localhost:8080`.

## Script chính

- `npm run dev`: chạy môi trường phát triển
- `npm run build`: build production
- `npm run build:mobile`: build web để đóng gói app
- `npm run preview`: xem bản build local
- `npm run test`: chạy test
- `npm run lint`: kiểm tra eslint

## Đóng gói Android nội bộ

Giai đoạn này giữ nguyên toàn bộ logic web, chỉ thêm lớp đóng gói bằng Capacitor.

Các bước sau khi cài Capacitor:

```bash
npm install @capacitor/core @capacitor/cli
npm run build:mobile
npx cap add android
npx cap sync
npx cap open android
```

Lưu ý:

- `capacitor.config.ts` đã trỏ `webDir` tới `dist`
- web hiện tại vẫn chạy độc lập như cũ
- thư mục `android/` chỉ được tạo khi bạn chạy `npx cap add android`

## Supabase

Thư mục `supabase/` chứa:

- `migrations/`: migration database
- `functions/`: Edge Functions
- `config.toml`: cấu hình project Supabase

Một số function cần secret ở môi trường Supabase, ví dụ:

- `GEMINI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Ví dụ deploy function:

```bash
supabase functions deploy ai-shift-assistant --project-ref <your-project-ref>
```

Ví dụ set secret:

```bash
supabase secrets set GEMINI_API_KEY=<your-key> --project-ref <your-project-ref>
```

## Lưu ý khi publish

- Không commit `.env`
- Không commit dữ liệu export `.csv` hoặc file tạm `.sql`
- Không commit `node_modules`, `dist`, `supabase/.temp`
