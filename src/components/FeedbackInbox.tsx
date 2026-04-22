import { useState, useEffect } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Feedback } from '@/lib/types';
import { MessageSquare, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function FeedbackInbox() {
  const [feedbacks, setFeedbacks] = useState<(Feedback & { user_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: fbs }, { data: profs }] = await Promise.all([
      supabase.from('feedback').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('user_id, name'),
    ]);

    if (profs) {
      const map: Record<string, string> = {};
      profs.forEach(p => { map[p.user_id] = p.name; });
      setProfiles(map);
    }

    setFeedbacks((fbs || []) as Feedback[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const markAsRead = async (id: string) => {
    const { error } = await supabase.from('feedback').update({ is_read: true } as any).eq('id', id);
    if (error) {
      toast.error('Không thể cập nhật');
      return;
    }
    setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, is_read: true } : f));
    toast.success('Đã đánh dấu đã đọc');
  };

  const unreadCount = feedbacks.filter(f => !f.is_read).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Phản hồi từ nhân viên
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-xs">{unreadCount} mới</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 max-h-80 overflow-y-auto">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
        ) : feedbacks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Chưa có phản hồi nào</p>
        ) : (
          feedbacks.map(fb => (
            <div key={fb.id} className={`rounded-lg border p-3 space-y-1 ${!fb.is_read ? 'bg-primary/5 border-primary/20' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{profiles[fb.user_id] || 'Ẩn danh'}</p>
                  <p className="text-sm font-medium text-foreground truncate">{fb.subject}</p>
                </div>
                {!fb.is_read && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => markAsRead(fb.id)}>
                    <CheckCheck className="h-3 w-3 mr-1" /> Đã đọc
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{fb.message}</p>
              <p className="text-xs text-muted-foreground/60">
                {new Date(fb.created_at).toLocaleString('vi-VN')}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
