import { useEffect, useState, useCallback } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  related_id: string | null;
  is_read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('hr_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setItems((data as Notification[]) || []);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hr_notifications', filter: `user_id=eq.${user.id}` },
        () => fetchNotifications(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications]);

  const unread = items.filter((n) => !n.is_read).length;

  const markRead = async (id: string) => {
    await supabase.from('hr_notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('hr_notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
  };

  const handleClick = async (n: Notification) => {
    if (!n.is_read) await markRead(n.id);
    setOpen(false);
    if (n.type.startsWith('swap_request') && n.related_id) {
      navigate(`/hr-hub?req=${n.related_id}`);
    } else if (n.type.startsWith('assignment')) {
      navigate('/hr-hub?tab=assignments');
    }
  };

  if (!user || (user.role !== 'ADMIN' && user.role !== 'HR')) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] leading-none flex items-center justify-center"
            >
              {unread > 9 ? '9+' : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Thông báo</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
              <CheckCheck className="h-3 w-3 mr-1" /> Đọc tất cả
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Chưa có thông báo</p>
          ) : (
            <div className="divide-y">
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 hover:bg-accent transition-colors',
                    !n.is_read && 'bg-primary/5',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', !n.is_read ? 'bg-primary' : 'bg-transparent')} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: vi })}
                      </p>
                    </div>
                    {n.is_read && <Check className="h-3 w-3 text-muted-foreground mt-1 shrink-0" />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
