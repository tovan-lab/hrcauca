import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function Index() {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (user.status !== 'active') return <Navigate to="/pending" replace />;
  if (user.role === 'EMPLOYEE') return <Navigate to="/check-in" replace />;
  return <Navigate to="/dashboard" replace />;
}
