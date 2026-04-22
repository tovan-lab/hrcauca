import { ShiftRegistration } from '@/components/ShiftRegistration';

export default function ShiftPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-1 sm:px-0">
      <div>
        <h2 className="text-lg sm:text-xl font-semibold text-foreground">Quản lý ca làm việc</h2>
        <p className="text-sm text-muted-foreground mt-1">Đăng ký và quản lý lịch làm việc hàng tuần</p>
      </div>
      <ShiftRegistration />
    </div>
  );
}
