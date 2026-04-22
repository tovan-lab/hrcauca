import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, LogOut } from 'lucide-react';
import { Loader2 } from 'lucide-react';

export default function PendingPage() {
  const { user, isAuthenticated, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (user.status === 'active') {
    return <Navigate to={user.role === 'EMPLOYEE' ? '/check-in' : '/dashboard'} replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="pb-4">
          <div className="mx-auto rounded-full bg-muted p-4 mb-3">
            <Clock className="h-10 w-10 text-muted-foreground" />
          </div>
          <CardTitle className="text-lg">Tài khoản đang chờ phê duyệt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Tài khoản của bạn đang chờ quản trị viên phê duyệt. Vui lòng liên hệ quản lý để được cấp quyền.
          </p>
          <p className="text-xs text-muted-foreground">
            Email: <span className="font-medium text-foreground">{user.email}</span>
          </p>
          <Button variant="outline" className="w-full" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" /> Đăng xuất
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
