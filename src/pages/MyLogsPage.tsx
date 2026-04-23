import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { getSignedImageUrls } from '@/lib/signed-urls';
import { formatMinutesAsHours } from '@/lib/duration';

interface LogEntry {
  id: string;
  check_in_time: string;
  check_out_time: string | null;
  image_url: string;
  attendance_status: string | null;
  late_minutes: number | null;
  early_leave_minutes: number | null;
  verified: boolean | null;
  shift_id: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  on_time: {
    label: 'Đúng giờ',
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    icon: CheckCircle2,
  },
  late: {
    label: 'Trễ',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    icon: AlertTriangle,
  },
  early_leave: {
    label: 'Về sớm',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    icon: AlertTriangle,
  },
  late_and_early: {
    label: 'Trễ & Về sớm',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    icon: AlertTriangle,
  },
};

export default function MyLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!user) return;

    const fetchLogs = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('check_ins')
        .select('*')
        .eq('user_id', user.id)
        .order('check_in_time', { ascending: false })
        .limit(30);

      const entries = (data as LogEntry[]) || [];
      setLogs(entries);

      const urls = entries.map((entry) => entry.image_url).filter(Boolean);
      if (urls.length > 0) {
        const resolved = await getSignedImageUrls(urls);
        setSignedUrls(resolved);
      }

      setLoading(false);
    };

    fetchLogs();
  }, [user]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Nhật ký của tôi</h2>
        <p className="mt-1 text-sm text-muted-foreground">Lịch sử chấm công cá nhân 30 ngày gần nhất</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Chưa có dữ liệu chấm công
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const status = STATUS_CONFIG[log.attendance_status || 'on_time'] || STATUS_CONFIG.on_time;
            const StatusIcon = status.icon;

            return (
              <Card key={log.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-center gap-4 p-4">
                    {log.image_url ? (
                      <img
                        src={signedUrls.get(log.image_url) || ''}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted">
                        <Clock className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {format(new Date(log.check_in_time), 'EEEE, dd/MM/yyyy', { locale: vi })}
                      </p>

                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Vào: {format(new Date(log.check_in_time), 'HH:mm')}
                        </span>

                        {log.check_out_time && (
                          <span className="text-xs text-muted-foreground">
                            • Ra: {format(new Date(log.check_out_time), 'HH:mm')}
                          </span>
                        )}

                        {(log.late_minutes ?? 0) > 0 && (
                          <span className="text-xs font-medium text-red-500">
                            Trễ {formatMinutesAsHours(log.late_minutes)}
                          </span>
                        )}

                        {(log.early_leave_minutes ?? 0) > 0 && (
                          <span className="text-xs font-medium text-amber-600">
                            • Về sớm {formatMinutesAsHours(log.early_leave_minutes)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Badge variant="outline" className={`border-0 text-xs ${status.color}`}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {status.label}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
