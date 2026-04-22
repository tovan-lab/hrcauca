import { HRHub } from '@/components/HRHub';
import { useAuth } from '@/contexts/AuthContext';

export default function HRHubPage() {
  const { user } = useAuth();
  if (user?.role !== 'ADMIN' && user?.role !== 'HR') {
    return <div className="text-center py-12 text-muted-foreground">Bạn không có quyền truy cập trang này.</div>;
  }
  return <HRHub />;
}
