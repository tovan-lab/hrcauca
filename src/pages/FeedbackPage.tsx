import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquarePlus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Feedback } from '@/lib/types';
import { useEffect } from 'react';
import { sanitizeForSubmit } from '@/lib/sanitize';

export default function FeedbackPage() {
  const { user } = useAuth();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const fetchFeedbacks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false });
    setFeedbacks((data || []) as Feedback[]);
    setLoading(false);
  };

  useEffect(() => { fetchFeedbacks(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim() || !user) {
      toast.error('Vui lòng điền đầy đủ thông tin');
      return;
    }
    setSending(true);
    const { error } = await supabase.from('feedback').insert({
      user_id: user.id,
      subject: sanitizeForSubmit(subject),
      message: sanitizeForSubmit(message),
    } as any);

    if (error) {
      toast.error('Không thể gửi phản hồi');
    } else {
      toast.success('Đã gửi phản hồi thành công');
      setSubject('');
      setMessage('');
      fetchFeedbacks();
    }
    setSending(false);
  };

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Gửi phản hồi</h2>
        <p className="text-sm text-muted-foreground mt-1">Gửi ý kiến hoặc báo cáo cho quản lý</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4" /> Phản hồi mới
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Tiêu đề</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Nhập tiêu đề..." />
            </div>
            <div className="space-y-2">
              <Label>Nội dung</Label>
              <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Nhập nội dung phản hồi..." rows={4} />
            </div>
            <Button type="submit" className="w-full" disabled={sending}>
              <Send className="h-4 w-4 mr-2" />
              {sending ? 'Đang gửi...' : 'Gửi phản hồi'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Lịch sử phản hồi của bạn</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
          ) : feedbacks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Chưa có phản hồi nào</p>
          ) : (
            feedbacks.map(fb => (
              <div key={fb.id} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{fb.subject}</p>
                  <Badge variant={fb.is_read ? 'secondary' : 'default'} className="text-xs">
                    {fb.is_read ? 'Đã đọc' : 'Chờ xem'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{fb.message}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(fb.created_at).toLocaleString('vi-VN')}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
