import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function useSessionTimeout() {
  const { isAuthenticated, logout } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigateRef = useRef<ReturnType<typeof useNavigate> | null>(null);

  try {
    navigateRef.current = useNavigate();
  } catch {
    // Outside router context
  }

  const handleTimeout = useCallback(async () => {
    if (!isAuthenticated) return;
    await logout();
    toast.error('Phiên đăng nhập đã hết hạn để bảo mật. Vui lòng đăng nhập lại.', {
      duration: 6000,
    });
    navigateRef.current?.('/login');
  }, [isAuthenticated, logout]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isAuthenticated) {
      timerRef.current = setTimeout(handleTimeout, TIMEOUT_MS);
    }
  }, [isAuthenticated, handleTimeout]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const events = ['mousedown', 'keydown', 'mousemove', 'touchstart', 'scroll'];
    const handler = () => resetTimer();

    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isAuthenticated, resetTimer]);
}
