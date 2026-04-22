import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

interface Props {
  children: React.ReactNode;
  roles: UserRole[];
}

export function ProtectedRoute({ children, roles }: Props) {
  const { user, isAuthenticated, loading } = useAuth();
  const toasted = useRef(false);

  const isPending = !loading && isAuthenticated && user && user.status === 'pending';
  const isInactive = !loading && isAuthenticated && user && user.status === 'inactive';
  const denied = !loading && isAuthenticated && user && user.status === 'active' && !roles.includes(user.role);

  useEffect(() => {
    if (denied && !toasted.current) {
      toasted.current = true;
      toast.error('Truy cập bị từ chối');
    }
  }, [denied]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (isPending || isInactive) return <Navigate to="/pending" replace />;
  if (!roles.includes(user.role)) {
    const fallback = user.role === 'EMPLOYEE' ? '/check-in' : '/dashboard';
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
