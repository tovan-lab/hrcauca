import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useEvaluation } from '@/contexts/EvaluationContext';
import { usePenalty } from '@/contexts/PenaltyContext';
import { getEvaluationBadge, getBadgeInfo } from '@/lib/reward-penalty';
import { cn } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentMonth, formatVND, FREE_EDITS } from '@/lib/penalty-utils';
import { calcActualEffectiveHours, calcEffectiveHours, formatHours } from '@/lib/shift-utils';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { AlertTriangle, Clock, Moon, TrendingUp } from 'lucide-react';

export function MyPerformance() {
  const { user } = useAuth();
  const { evaluations } = useEvaluation();
  const { getRecordsForEmployee } = usePenalty();

  // Shift edit penalty data
  const [editCount, setEditCount] = useState(0);
  const [penaltyAmount, setPenaltyAmount] = useState(0);

  // Actual paid hours this month (clamped to registered shift window)
  const [paidHours, setPaidHours] = useState({ total: 0, night: 0, effective: 0, shifts: 0 });

  useEffect(() => {
    if (!user) return;
    const currentMonth = getCurrentMonth();
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

    Promise.all([
      supabase
        .from('shift_edit_logs')
        .select('edit_count, penalty_amount')
        .eq('employee_id', user.id)
        .eq('edit_month', currentMonth)
        .maybeSingle(),
      supabase
        .from('shifts')
        .select('id, shift_date, start_time, end_time')
        .eq('user_id', user.id)
        .gte('shift_date', monthStart)
        .lte('shift_date', monthEnd),
      supabase
        .from('check_ins')
        .select('shift_id, check_in_time, check_out_time')
        .eq('user_id', user.id)
        .gte('check_in_time', monthStart)
        .lte('check_in_time', monthEnd + 'T23:59:59'),
    ]).then(([editRes, shiftsRes, checkInsRes]) => {
      if (editRes.data) {
        setEditCount((editRes.data as any).edit_count || 0);
        setPenaltyAmount((editRes.data as any).penalty_amount || 0);
      }
      const shifts = shiftsRes.data || [];
      const checkIns = checkInsRes.data || [];
      let total = 0, night = 0, effective = 0;
      shifts.forEach((s: any) => {
        const ci = checkIns.find((c: any) => c.shift_id === s.id);
        const calc = ci
          ? calcActualEffectiveHours(s.shift_date, s.start_time.slice(0, 5), s.end_time.slice(0, 5), ci.check_in_time, ci.check_out_time)
          : calcEffectiveHours(s.start_time.slice(0, 5), s.end_time.slice(0, 5));
        total += calc.totalHours;
        night += calc.nightHours;
        effective += calc.effectiveHours;
      });
      setPaidHours({
        total: Math.round(total * 100) / 100,
        night: Math.round(night * 100) / 100,
        effective: Math.round(effective * 100) / 100,
        shifts: shifts.length,
      });
    });
  }, [user]);

  const myEvals = useMemo(
    () => evaluations.filter(e => e.employee_id === user?.id).sort((a, b) =>
      new Date(a.evaluation_date).getTime() - new Date(b.evaluation_date).getTime()
    ),
    [evaluations, user]
  );

  const myRecords = useMemo(
    () => user ? getRecordsForEmployee(user.id) : [],
    [user, getRecordsForEmployee]
  );

  const chartData = useMemo(
    () => myEvals.map(e => ({
      date: new Date(e.evaluation_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
      score: e.total_score,
    })),
    [myEvals]
  );

  const avgScore = myEvals.length > 0
    ? Math.round(myEvals.reduce((s, e) => s + e.total_score, 0) / myEvals.length)
    : 0;

  const freeEditsUsed = Math.min(editCount, FREE_EDITS);

  return (
    <div className="space-y-5">
      {/* Paid hours this month — based on actual check-in/out clamped to registered shift */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Giờ thực tế (tháng này)</p>
                <p className="text-lg font-bold">{formatHours(paidHours.total)}</p>
              </div>
            </div>

            {paidHours.night > 0 && (
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Moon className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Giờ đêm (x1.25)</p>
                  <p className="text-lg font-bold text-amber-600">{formatHours(paidHours.night)}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Clock className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Quy đổi trả công</p>
                <p className="text-lg font-bold text-emerald-600">{formatHours(paidHours.effective)}</p>
              </div>
            </div>

            <Badge variant="secondary" className="text-xs">
              {paidHours.shifts} ca
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            * Tính theo giờ check-in/check-out thực tế, giới hạn trong khung ca đã đăng ký. Đến/về sớm không cộng giờ; đến trễ/về sớm bị trừ giờ.
          </p>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">Điểm TB</p>
            <p className={cn('text-2xl font-bold', avgScore < 70 ? 'text-destructive' : 'text-primary')}>
              {avgScore}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">Số ca đánh giá</p>
            <p className="text-2xl font-bold text-foreground">{myEvals.length}</p>
          </CardContent>
        </Card>

        {/* Penalty Card */}
        <Card className={cn(penaltyAmount > 0 && 'border-destructive/50')}>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              {penaltyAmount > 0 && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
              <p className="text-xs text-muted-foreground">Tiền phạt sửa ca</p>
            </div>
            <p className={cn('text-2xl font-bold', penaltyAmount > 0 ? 'text-destructive' : 'text-foreground')}>
              {penaltyAmount > 0 ? `- ${formatVND(penaltyAmount)}` : '0đ'}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Đã sửa lịch {freeEditsUsed}/{FREE_EDITS} lần miễn phí tháng này
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Score trend */}
      {chartData.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Xu hướng điểm</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                  />
                  <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Điểm" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evaluation history */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Lịch sử đánh giá</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-72 overflow-y-auto">
          {myEvals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Chưa có đánh giá nào.</p>
          ) : (
            [...myEvals].reverse().map(ev => {
              const badge = getEvaluationBadge(ev.total_score);
              const badgeInfo = badge ? getBadgeInfo(badge) : null;
              return (
                <div key={ev.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {new Date(ev.evaluation_date).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                    </span>
                    <div className="flex items-center gap-2">
                      {badgeInfo && (
                        <Badge variant={badgeInfo.variant} className="text-xs">
                          {badgeInfo.label}
                        </Badge>
                      )}
                      <span className={cn(
                        'text-sm font-bold tabular-nums',
                        ev.total_score < 70 ? 'text-destructive' : ev.total_score > 90 ? 'text-primary' : 'text-foreground'
                      )}>
                        {ev.total_score}
                      </span>
                    </div>
                  </div>
                  {ev.manager_comment && (
                    <p className="text-xs text-muted-foreground italic">"{ev.manager_comment}"</p>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Financial records */}
      {myRecords.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Thưởng / Phạt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myRecords.map(r => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm text-foreground">{r.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.date).toLocaleDateString('vi-VN')}
                  </p>
                </div>
                <Badge variant={r.type === 'reward' ? 'default' : 'destructive'} className="text-xs">
                  {r.type === 'reward' ? '+' : ''}{r.amount.toLocaleString('vi-VN')}đ
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
