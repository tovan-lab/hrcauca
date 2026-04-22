import { useAuth } from '@/contexts/AuthContext';
import { ShiftMatrixGrid } from '@/components/ShiftMatrixGrid';

export default function ShiftLogsPage() {
  const { user } = useAuth();
  const canViewMatrix = user?.role === 'ADMIN' || user?.role === 'HR';

  if (!canViewMatrix) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Bạn không có quyền truy cập trang này.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Nhật ký ca làm việc</h2>
        <p className="text-sm text-muted-foreground mt-1">Bảng ma trận ca làm – chỉnh sửa trực tiếp theo giờ</p>
      </div>
      <ShiftMatrixGrid />
    </div>
  );
}
