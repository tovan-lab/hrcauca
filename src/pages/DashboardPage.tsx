import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, TrendingUp, AlertTriangle, Download, DollarSign, CalendarDays, HardDrive } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEvaluation } from '@/contexts/EvaluationContext';
import { supabase } from '@/integrations/supabase/client';
import { getTopPerformers, getNeedsAttention, checkCriticalMonthlyAlert, getEvaluationBadge, getBadgeInfo } from '@/lib/reward-penalty';
import { AdjustmentModal } from '@/components/AdjustmentModal';
import { StaffFluctuationsWidget } from '@/components/StaffFluctuationsWidget';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

type TimeRange = 'week' | 'month' | 'quarter' | 'all';

function getTimeRangeStart(range: TimeRange): Date | null {
  if (range === 'all') return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  switch (range) {
    case 'week':
      return new Date(now.getTime() - 7 * 86400000);
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), qMonth, 1);
    }
  }
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { evaluations, loading: loadingEvals } = useEvaluation();
  const [adjustModal, setAdjustModal] = useState<{ id: string; name: string } | null>(null);
  const [profiles, setProfiles] = useState<Record<string, { name: string; department: string; branch_id: string | null }>>({});
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [storageUsage, setStorageUsage] = useState<{ totalFiles: number; totalBytes: number } | null>(null);
  const [shiftCount, setShiftCount] = useState<number>(0);

  const isHR = user?.role === 'HR';
  const isAdmin = user?.role === 'ADMIN';
  const userBranchId = (user as any)?.branch_id ?? null;

  // Fetch storage usage (real-time polling every 30s)
  useEffect(() => {
    const fetchUsage = async () => {
      const { data } = await supabase.rpc('get_storage_usage');
      if (data && data.length > 0) {
        setStorageUsage({ totalFiles: Number(data[0].total_files), totalBytes: Number(data[0].total_bytes) });
      }
    };
    fetchUsage();
    const interval = setInterval(fetchUsage, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let query = supabase.from('profiles').select('user_id, name, department, branch_id');
    if (isHR && userBranchId) {
      query = query.eq('branch_id', userBranchId);
    }
    query.then(({ data }) => {
      if (data) {
        const map: Record<string, { name: string; department: string; branch_id: string | null }> = {};
        data.forEach(p => { map[p.user_id] = { name: p.name, department: p.department || '', branch_id: (p as any).branch_id ?? null }; });
        setProfiles(map);
      }
      setLoadingProfiles(false);
    });
  }, [isHR, userBranchId]);

  // Fetch shift count (scoped by branch for HR via actual_branch_id)
  useEffect(() => {
    const fetchShifts = async () => {
      const start = getTimeRangeStart(timeRange);
      let q = supabase.from('shifts').select('id', { count: 'exact', head: true });
      if (start) q = q.gte('shift_date', start.toISOString().slice(0, 10));
      if (isHR && userBranchId) {
        // HR: count shifts whose actual_branch_id falls in their branch (covers both home + biệt phái đến)
        q = q.eq('actual_branch_id', userBranchId);
      }
      const { count } = await q;
      setShiftCount(count ?? 0);
    };
    fetchShifts();
  }, [timeRange, isHR, userBranchId]);

  const filteredEvals = useMemo(() => {
    const start = getTimeRangeStart(timeRange);
    if (!start) return evaluations;
    return evaluations.filter(e => new Date(e.evaluation_date) >= start);
  }, [evaluations, timeRange]);

  const topPerformers = useMemo(() => getTopPerformers(filteredEvals), [filteredEvals]);
  const needsAttention = useMemo(() => getNeedsAttention(filteredEvals), [filteredEvals]);

  const criticalAlerts = useMemo(() => {
    return Object.keys(profiles).filter(id => checkCriticalMonthlyAlert(evaluations, id));
  }, [evaluations, profiles]);

  const chartData = useMemo(() => {
    const start = getTimeRangeStart(timeRange);
    const now = new Date();
    let days: number;
    let labelFn: (d: Date) => string;

    if (timeRange === 'quarter') {
      // Group by week for quarter
      const weeks: { date: string; avg: number; count: number }[] = [];
      const startDate = start || new Date(now.getTime() - 90 * 86400000);
      const totalWeeks = Math.ceil((now.getTime() - startDate.getTime()) / (7 * 86400000));
      for (let i = 0; i < totalWeeks; i++) {
        const weekStart = new Date(startDate.getTime() + i * 7 * 86400000);
        const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
        const weekEvals = filteredEvals.filter(e => {
          const d = new Date(e.evaluation_date);
          return d >= weekStart && d < weekEnd;
        });
        const avg = weekEvals.length > 0 ? Math.round(weekEvals.reduce((s, e) => s + e.total_score, 0) / weekEvals.length) : 0;
        weeks.push({
          date: `T${weekStart.getDate()}/${weekStart.getMonth() + 1}`,
          avg,
          count: weekEvals.length,
        });
      }
      return weeks;
    }

    // For week / month / all: show daily
    if (timeRange === 'week') {
      days = 7;
    } else if (timeRange === 'month') {
      const d = new Date();
      days = d.getDate(); // days so far this month
    } else {
      days = Math.min(30, filteredEvals.length > 0
        ? Math.ceil((now.getTime() - new Date(filteredEvals[filteredEvals.length - 1].evaluation_date).getTime()) / 86400000) + 1
        : 30);
    }

    const result: { date: string; avg: number; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      const dayEvals = filteredEvals.filter(e => new Date(e.evaluation_date).toDateString() === d.toDateString());
      const avg = dayEvals.length > 0 ? Math.round(dayEvals.reduce((s, e) => s + e.total_score, 0) / dayEvals.length) : 0;
      result.push({ date: dateStr, avg, count: dayEvals.length });
    }
    return result;
  }, [filteredEvals, timeRange]);

  const totalEvals = filteredEvals.length;
  const overallAvg = totalEvals > 0 ? Math.round(filteredEvals.reduce((s, e) => s + e.total_score, 0) / totalEvals) : 0;
  const employeeCount = Object.keys(profiles).length;

  const getName = (id: string) => profiles[id]?.name ?? id.slice(0, 8);

  const exportCSV = () => {
    const header = 'Nhân viên,Ngày,Điểm,Nhận xét\n';
    const rows = filteredEvals.map(e =>
      `"${getName(e.employee_id)}","${new Date(e.evaluation_date).toLocaleDateString('vi-VN')}",${e.total_score},"${e.manager_comment}"`
    ).join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bao_cao_danh_gia_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = loadingProfiles || loadingEvals;

  const timeRangeLabel: Record<TimeRange, string> = {
    week: '7 ngày qua',
    month: 'Tháng này',
    quarter: 'Quý này',
    all: 'Tất cả',
  };

  const StatsCard = ({ title, icon: Icon, value, valueClass }: { title: string; icon: React.ElementType; value: React.ReactNode; valueClass?: string }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-16" /> : <p className={cn('text-2xl font-bold', valueClass)}>{value}</p>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Bảng điều khiển</h2>
          <p className="text-sm text-muted-foreground mt-1">Xin chào, {user?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={v => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[150px] h-9">
              <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">7 ngày qua</SelectItem>
              <SelectItem value="month">Tháng này</SelectItem>
              <SelectItem value="quarter">Quý này</SelectItem>
              <SelectItem value="all">Tất cả</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" /> Xuất CSV
          </Button>
        </div>
      </div>

      {criticalAlerts.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="py-4 space-y-2">
            {criticalAlerts.map(id => (
              <div key={id} className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                <p className="text-sm font-semibold text-destructive">
                  CẢNH BÁO: {getName(id)} — 3 lần {'<'}70 điểm/tháng - Xem xét cho nghỉ
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatsCard title={isHR ? 'NV chi nhánh' : 'Nhân viên'} icon={Users} value={employeeCount} />
        <StatsCard title="Đánh giá" icon={TrendingUp} value={totalEvals} />
        <StatsCard title="Số ca làm" icon={CalendarDays} value={shiftCount} />
        <StatsCard title="Cần chú ý" icon={AlertTriangle} value={needsAttention.length} valueClass="text-destructive" />
      </div>

      {!isHR && (
        <Card>
          <CardContent className="py-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Điểm trung bình toàn hệ thống</span>
            <span className={cn('text-lg font-bold', overallAvg < 70 ? 'text-destructive' : 'text-foreground')}>
              {overallAvg}<span className="text-xs font-normal text-muted-foreground">/100</span>
            </span>
          </CardContent>
        </Card>
      )}

      <StaffFluctuationsWidget branchId={(user as any)?.branch_id ?? null} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Xu hướng điểm trung bình ({timeRangeLabel[timeRange]})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                  <Bar dataKey="avg" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Điểm TB" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">🏆 Nhân viên xuất sắc (Điểm TB {'>'} 90)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : topPerformers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Chưa có dữ liệu</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead className="text-xs">Nhân viên</TableHead><TableHead className="text-xs text-right">Điểm TB</TableHead><TableHead className="text-xs text-right">Thưởng</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {topPerformers.map(p => (
                      <TableRow key={p.employeeId}>
                        <TableCell className="text-sm font-medium">{getName(p.employeeId)}</TableCell>
                        <TableCell className="text-sm text-right font-semibold text-primary">{p.avgScore}</TableCell>
                        <TableCell className="text-right"><Badge className="text-xs">+200k - 500k</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">⚠️ Cần chú ý (Điểm TB {'<'} 70)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : needsAttention.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Không có</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead className="text-xs">Nhân viên</TableHead><TableHead className="text-xs text-right">Điểm TB</TableHead><TableHead className="text-xs text-right">Hành động</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {needsAttention.map(p => (
                      <TableRow key={p.employeeId}>
                        <TableCell className="text-sm font-medium">{getName(p.employeeId)}</TableCell>
                        <TableCell className="text-sm text-right font-semibold text-destructive">{p.avgScore}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAdjustModal({ id: p.employeeId, name: getName(p.employeeId) })}>
                            <DollarSign className="h-3 w-3 mr-1" /> Điều chỉnh
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Đánh giá gần đây</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {filteredEvals.slice(0, 15).map(ev => {
              const badge = getEvaluationBadge(ev.total_score);
              const badgeInfo = badge ? getBadgeInfo(badge) : null;
              return (
                <div key={ev.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{getName(ev.employee_id)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(ev.evaluation_date).toLocaleDateString('vi-VN')}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {badgeInfo && <Badge variant={badgeInfo.variant} className="text-xs whitespace-nowrap">{badgeInfo.label}</Badge>}
                    <span className={cn('text-sm font-bold tabular-nums w-8 text-right', ev.total_score < 70 ? 'text-destructive' : ev.total_score > 90 ? 'text-primary' : 'text-foreground')}>{ev.total_score}</span>
                  </div>
                </div>
              );
            })}
            {filteredEvals.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Chưa có đánh giá nào.</p>
            )}
          </div>
        </CardContent>
      </Card>
      {/* Storage usage widget */}
      {user?.role === 'ADMIN' && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <HardDrive className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Dung lượng Storage</span>
                  {storageUsage ? (
                    <span className="font-semibold text-foreground">
                      {(storageUsage.totalBytes / (1024 * 1024)).toFixed(1)} MB
                      <span className="text-muted-foreground font-normal"> / 1,000 MB</span>
                      <span className="text-muted-foreground font-normal ml-2">({storageUsage.totalFiles} files)</span>
                    </span>
                  ) : (
                    <Skeleton className="h-4 w-32" />
                  )}
                </div>
                {storageUsage && (
                  <Progress
                    value={Math.min((storageUsage.totalBytes / (1024 * 1024 * 1024)) * 100, 100)}
                    className={cn('h-2', storageUsage.totalBytes > 800 * 1024 * 1024 ? '[&>div]:bg-destructive' : '')}
                  />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {adjustModal && (
        <AdjustmentModal employeeId={adjustModal.id} employeeName={adjustModal.name} open={!!adjustModal} onOpenChange={() => setAdjustModal(null)} />
      )}
    </div>
  );
}
