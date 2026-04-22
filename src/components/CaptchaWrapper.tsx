import { useState, useCallback, useEffect, useRef } from 'react';
import { Shield, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CaptchaWrapperProps {
  onVerified: (token: string) => void;
  className?: string;
}

/**
 * CAPTCHA Wrapper — Mock UI for Cloudflare Turnstile / reCAPTCHA v3.
 * 
 * To integrate a real CAPTCHA:
 * 1. Replace the mock verification with the actual SDK
 * 2. Set the site key via environment variable
 * 3. Verify the token server-side in your edge function
 * 
 * Env: VITE_TURNSTILE_SITE_KEY or VITE_RECAPTCHA_SITE_KEY
 */
export function CaptchaWrapper({ onVerified, className }: CaptchaWrapperProps) {
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const callbackRef = useRef(onVerified);
  callbackRef.current = onVerified;

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => {
    // If a real Turnstile key is set, load the script
    if (siteKey) {
      // TODO: Load Cloudflare Turnstile script
      // <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
      console.info('[CAPTCHA] Real Turnstile site key detected. Integrate SDK here.');
    }
  }, [siteKey]);

  const handleClick = useCallback(() => {
    if (verified || verifying) return;
    setVerifying(true);

    // Mock: simulate verification delay
    setTimeout(() => {
      const mockToken = `mock_captcha_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      setVerified(true);
      setVerifying(false);
      callbackRef.current(mockToken);
    }, 800);
  }, [verified, verifying]);

  return (
    <div
      onClick={handleClick}
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all select-none',
        verified
          ? 'border-green-500/50 bg-green-500/5'
          : verifying
            ? 'border-primary/50 bg-primary/5'
            : 'border-border hover:border-primary/30 hover:bg-muted/50',
        className
      )}
    >
      <div className={cn(
        'flex items-center justify-center h-6 w-6 rounded border-2 transition-colors',
        verified ? 'border-green-500 bg-green-500' : 'border-muted-foreground/30'
      )}>
        {verified && <CheckCircle2 className="h-4 w-4 text-white" />}
        {verifying && <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
      </div>
      <span className="text-sm text-foreground">
        {verified ? 'Đã xác minh' : verifying ? 'Đang xác minh...' : 'Tôi không phải robot'}
      </span>
      <Shield className="h-4 w-4 text-muted-foreground ml-auto" />
    </div>
  );
}
