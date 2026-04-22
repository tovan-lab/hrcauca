import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State = 'loading' | 'valid' | 'already' | 'invalid' | 'success' | 'error';

export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>('loading');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`, {
          headers: { apikey: SUPABASE_KEY },
        });
        const data = await res.json();
        if (data.valid) setState('valid');
        else if (data.reason === 'already_unsubscribed') setState('already');
        else setState('invalid');
      } catch {
        setState('invalid');
      }
    })();
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('handle-email-unsubscribe', { body: { token } });
    setSubmitting(false);
    if (error || !data?.success) setState('error');
    else setState('success');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Hủy đăng ký nhận email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'loading' && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Đang kiểm tra...</div>}
          {state === 'valid' && (
            <>
              <p className="text-sm text-muted-foreground">Bạn có chắc muốn ngừng nhận email từ Cau Ca?</p>
              <Button onClick={confirm} disabled={submitting} className="w-full">
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang xử lý...</> : 'Xác nhận hủy đăng ký'}
              </Button>
            </>
          )}
          {state === 'already' && <div className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="h-5 w-5 text-primary" /> Bạn đã hủy đăng ký trước đó.</div>}
          {state === 'success' && <div className="flex items-center gap-2 text-foreground"><CheckCircle2 className="h-5 w-5 text-primary" /> Đã hủy đăng ký thành công.</div>}
          {state === 'invalid' && <div className="flex items-center gap-2 text-destructive"><XCircle className="h-5 w-5" /> Liên kết không hợp lệ hoặc đã hết hạn.</div>}
          {state === 'error' && <div className="flex items-center gap-2 text-destructive"><XCircle className="h-5 w-5" /> Có lỗi xảy ra. Vui lòng thử lại.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
