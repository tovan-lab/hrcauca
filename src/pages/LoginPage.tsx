import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, ShieldAlert, Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { useLoginRateLimit } from '@/hooks/useLoginRateLimit';
import { CaptchaWrapper } from '@/components/CaptchaWrapper';
import loginBg from '@/assets/login-bg.jpg';

export default function LoginPage() {
  const { isAuthenticated, user, login, register, loading } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { isLocked, attempts, remainingSeconds, recordFailedAttempt, resetAttempts, maxAttempts } = useLoginRateLimit();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated && user) {
    return <Navigate to={user.role === 'EMPLOYEE' ? '/check-in' : user.role === 'IT' ? '/storage' : '/dashboard'} replace />;
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || submitting) return;
    if (!captchaToken) {
      toast.error('Vui lòng xác minh CAPTCHA trước khi tiếp tục.');
      return;
    }

    setSubmitting(true);
    const result = isRegister
      ? await register(email, password, name)
      : await login(email, password);

    if (result.error) {
      toast.error(result.error);
      if (!isRegister) recordFailedAttempt();
    } else {
      resetAttempts();
      if (isRegister) toast.success('Đăng ký thành công!');
    }
    setSubmitting(false);
  };

  const loginDisabled = submitting || isLocked || !captchaToken;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-900">
      {/* Background image — full screen on all devices */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${loginBg})` }}
        aria-hidden="true"
      />
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-slate-950/50" aria-hidden="true" />

      <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">
        {/* Left brand area (desktop only — visual breathing room) */}
        <div className="hidden lg:block lg:w-1/2" aria-hidden="true" />

        {/* Form area */}
        <div className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-10">
          <div className="w-full max-w-md">
            {/* Card */}
            <div className="rounded-2xl bg-white/15 backdrop-blur-2xl shadow-2xl border border-white/25 p-6 sm:p-8 ring-1 ring-white/10">
              {/* Brand header */}
              <div className="text-center mb-6">
                <h1 className="text-2xl sm:text-[1.75rem] font-bold text-white leading-tight drop-shadow-md">
                  Hệ thống Quản lý Nhân sự
                </h1>
                <p className="text-sm text-white/80 mt-1 drop-shadow">Cậu Cả HR Performance System</p>

                {/* Cậu Cả wordmark logo */}
                <div className="mt-5 mb-1 flex justify-center">
                  <div className="inline-flex flex-col items-center">
                    <span
                      className="font-serif font-black text-3xl sm:text-4xl tracking-tight bg-gradient-to-b from-amber-300 via-orange-400 to-amber-500 bg-clip-text text-transparent select-none drop-shadow-lg"
                      style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: '-0.02em' }}
                    >
                      CẬU&nbsp;CẢ
                    </span>
                    <span className="text-[10px] tracking-[0.35em] text-amber-300/90 mt-0.5 font-semibold drop-shadow">
                      FROM DANANG
                    </span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                {isRegister && (
                  <div className="relative">
                    <Input
                      id="name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Họ và tên"
                      required
                      className="h-11 pl-4 bg-white/15 backdrop-blur border-white/30 text-white placeholder:text-white/60 focus-visible:ring-amber-400 focus-visible:bg-white/20"
                    />
                  </div>
                )}

                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60 pointer-events-none z-10" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Địa chỉ Email"
                    required
                    disabled={isLocked}
                    className="h-11 pl-10 bg-white/15 backdrop-blur border-white/30 text-white placeholder:text-white/60 focus-visible:ring-amber-400 focus-visible:bg-white/20"
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60 pointer-events-none z-10" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mật khẩu"
                    required
                    minLength={6}
                    disabled={isLocked}
                    className="h-11 pl-10 pr-10 bg-white/15 backdrop-blur border-white/30 text-white placeholder:text-white/60 focus-visible:ring-amber-400 focus-visible:bg-white/20"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors z-10"
                    onClick={() => setShowPassword(v => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* CAPTCHA */}
                <CaptchaWrapper onVerified={(token) => setCaptchaToken(token)} />

                {/* Rate-limit warnings */}
                {isLocked && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
                    <ShieldAlert className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-destructive">Tài khoản tạm khóa</p>
                      <p className="text-muted-foreground mt-1">
                        Bạn đã nhập sai mật khẩu {maxAttempts} lần. Vui lòng thử lại sau{' '}
                        <span className="font-semibold text-destructive">{formatTime(remainingSeconds)}</span>.
                      </p>
                    </div>
                  </div>
                )}
                {!isLocked && attempts > 0 && attempts < maxAttempts && (
                  <p className="text-xs text-amber-700 flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Còn {maxAttempts - attempts} lần thử trước khi tạm khóa
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={loginDisabled}
                  className="h-11 w-full mt-1 bg-gradient-to-r from-amber-700 to-orange-800 hover:from-amber-800 hover:to-orange-900 text-white font-semibold shadow-md hover:shadow-lg transition-all"
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLocked
                    ? `Đã khóa (${formatTime(remainingSeconds)})`
                    : isRegister ? 'Đăng ký' : 'Đăng nhập'}
                </Button>

                <div className="flex justify-between items-center text-sm pt-1">
                  <button
                    type="button"
                    className="text-white/70 hover:text-amber-300 transition-colors"
                    onClick={() => toast.info('Vui lòng liên hệ quản trị viên để đặt lại mật khẩu.')}
                  >
                    Quên mật khẩu?
                  </button>
                  <button
                    type="button"
                    className="text-amber-300 hover:text-amber-200 font-medium transition-colors"
                    onClick={() => { setIsRegister(!isRegister); setCaptchaToken(null); }}
                  >
                    {isRegister ? 'Đã có tài khoản?' : 'Tạo tài khoản mới?'}
                  </button>
                </div>
              </form>
            </div>

            {/* Footer */}
            <p className="text-center text-xs text-white/70 mt-5 tracking-wide drop-shadow">
              v1.0.0 · FROM DANANG · © 2024 CẬU CẢ GROUP · All Rights Reserved
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
