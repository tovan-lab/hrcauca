import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Search, Download, Users, Clock, AlertTriangle, Star, TrendingUp,
  CalendarIcon, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addWeeks, addMonths,
} from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { calcEffectiveHours, calcActualEffectiveHours, formatHours } from '@/lib/shift-utils';
import { getEvaluationBadge, getBadgeInfo } from '@/lib/reward-penalty';

type RangeMode = 'day' | 'week' | 'month';

interface EmployeeSummary {
  userId: string;
  name: string;
  branchName: string;
  totalShifts: number;
  totalHours: number;
  effectiveHours: number;
  nightHours: number;
  lateCount: number;
  earlyLeaveCount: number;
  avgScore: number;
  evalCount: number;
  lowScoreCount: number;
  highScoreCount: number;
}

export default function EmployeeReportPage() {
  const { user } = useAuth();
  const isHR = user?.role === 'HR';
  const userBranchId = (user as any)?.branch_id;

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [rangeMode, setRangeMode] = useState<RangeMode>('month');
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());

  const [profiles, setProfiles] = useState<{ user_id: string; name: string; branch_id: string | null }[]>([]);
  const [branches, setBranches] = useState<{ id: string; branch_name: string }[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [checkIns, setCheckIns] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<any[]>([]);

  const { rangeStart, rangeEnd, rangeLabel } = useMemo(() => {
    if (rangeMode === 'day') {
      return {
        rangeStart: anchorDate,
        rangeEnd: anchorDate,
        rangeLabel: format(anchorDate, 'EEEE, dd/MM/yyyy', { locale: vi }),
      };
    }
    if (rangeMode === 'week') {
      const s = startOfWeek(anchorDate, { weekStartsOn: 1 });
      const e = endOfWeek(anchorDate, { weekStartsOn: 1 });
      return {
        rangeStart: s,
        rangeEnd: e,
        rangeLabel: `Tuần: ${format(s, 'dd/MM')} – ${format(e, 'dd/MM/yyyy')}`,
      };
    }
    return {
      rangeStart: startOfMonth(anchorDate),
      rangeEnd: endOfMonth(anchorDate),
      rangeLabel: format(anchorDate, 'MMMM yyyy', { locale: vi }),
    };
  }, [rangeMode, anchorDate]);

  const rangeStartStr = format(rangeStart, 'yyyy-MM-dd');
  const rangeEndStr = format(rangeEnd, 'yyyy-MM-dd');

  const shiftRange = useCallback((dir: 1 | -1) => {
    setAnchorDate(prev => {
      if (rangeMode === 'day') return addDays(prev, dir);
      if (rangeMode === 'week') return addWeeks(prev, dir);
      return addMonths(prev, dir);
    });
  }, [rangeMode]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: profs }, { data: branchList }, { data: shiftData }, { data: checkInData }, { data: evalData }] = await Promise.all([
      supabase.from('profiles').select('user_id, name, branch_id').eq('status', 'active'),
      supabase.from('branches').select('id, branch_name'),
      supabase.from('shifts').select('*').gte('shift_date', rangeStartStr).lte('shift_date', rangeEndStr),
      supabase.from('check_ins').select('*').gte('check_in_time', rangeStartStr).lte('check_in_time', rangeEndStr + 'T23:59:59'),
      supabase.from('evaluations').select('*').gte('evaluation_date', rangeStartStr).lte('evaluation_date', rangeEndStr),
    ]);
    setProfiles(profs || []);
    setBranches(branchList as any || []);
    setShifts(shiftData || []);
    setCheckIns(checkInData || []);
    setEvaluations(evalData || []);
    setLoading(false);
  }, [rangeStartStr, rangeEndStr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const summaries = useMemo(() => {
    let profs = profiles;
    if (isHR && userBranchId) {
      profs = profs.filter(p => p.branch_id === userBranchId);
    }

    const branchMap = new Map(branches.map(b => [b.id, b.branch_name]));

    return profs.map(p => {
      const userShifts = shifts.filter(s => s.user_id === p.user_id);
      const userCheckIns = checkIns.filter(c => c.user_id === p.user_id);
      const userEvals = evaluations.filter(e => e.employee_id === p.user_id);

      let totalHours = 0, effectiveHours = 0, nightHours = 0;
      userShifts.forEach(s => {
        // Find matching check-in for this shift to compute ACTUAL paid hours.
        const matchingCI = userCheckIns.find(ci => ci.shift_id === s.id);
        const calc = matchingCI
          ? calcActualEffectiveHours(
              s.shift_date,
              s.start_time.slice(0, 5),
              s.end_time.slice(0, 5),
              matchingCI.check_in_time,
              matchingCI.check_out_time,
            )
          : calcEffectiveHours(s.start_time.slice(0, 5), s.end_time.slice(0, 5));
        totalHours += calc.totalHours;
        effectiveHours += calc.effectiveHours;
        nightHours += calc.nightHours;
      });

      const lateCount = userCheckIns.filter(c => c.attendance_status === 'late' || c.attendance_status === 'late_and_early').length;
      const earlyLeaveCount = userCheckIns.filter(c => c.attendance_status === 'early_leave' || c.attendance_status === 'late_and_early').length;

      const scores = userEvals.map(e => Number(e.total_score));
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

      return {
        userId: p.user_id,
        name: p.name,
        branchName: p.branch_id ? branchMap.get(p.branch_id) || '' : '',
        totalShifts: userShifts.length,
        totalHours: Math.round(totalHours * 100) / 100,
        effectiveHours: Math.round(effectiveHours * 100) / 100,
        nightHours: Math.round(nightHours * 100) / 100,
        lateCount,
        earlyLeaveCount,
        avgScore,
        evalCount: userEvals.length,
        lowScoreCount: scores.filter(s => s < 70).length,
        highScoreCount: scores.filter(s => s > 90).length,
      } as EmployeeSummary;
    }).filter(s => s.totalShifts > 0 || s.evalCount > 0);
  }, [profiles, shifts, checkIns, evaluations, branches, isHR, userBranchId]);

  const filtered = useMemo(() => {
    let result = summaries;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s => s.name.toLowerCase().includes(q));
    }
    if (branchFilter !== 'all') {
      result = result.filter(s => {
        const p = profiles.find(pr => pr.user_id === s.userId);
        return p?.branch_id === branchFilter;
      });
    }
    return result.sort((a, b) => b.effectiveHours - a.effectiveHours);
  }, [summaries, search, branchFilter, profiles]);

  const totals = useMemo(() => ({
    shifts: filtered.reduce((a, s) => a + s.totalShifts, 0),
    hours: filtered.reduce((a, s) => a + s.totalHours, 0),
    effective: filtered.reduce((a, s) => a + s.effectiveHours, 0),
    late: filtered.reduce((a, s) => a + s.lateCount, 0),
    avgScore: filtered.length > 0 ? Math.round(filtered.reduce((a, s) => a + s.avgScore, 0) / filtered.filter(s => s.evalCount > 0).length || 0) : 0,
  }), [filtered]);

  const downloadCSV = () => {
    const bom = '\uFEFF';
    const headers = ['Họ tên', 'Chi nhánh', 'Số ca', 'Tổng giờ', 'Quy đổi', 'Giờ đêm', 'Đi trễ', 'Về sớm', 'Điểm TB', 'Số lần chấm', 'Điểm thấp (<70)', 'Điểm cao (>90)'];
    const rows = filtered.map(s => [
      s.name, s.branchName, s.totalShifts, formatHours(s.totalHours), formatHours(s.effectiveHours),
      formatHours(s.nightHours), s.lateCount, s.earlyLeaveCount, s.avgScore, s.evalCount, s.lowScoreCount, s.highScoreCount,
    ]);
    const csv = bom + [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileTag = rangeMode === 'day' ? format(anchorDate, 'yyyy-MM-dd')
      : rangeMode === 'week' ? `tuan-${format(rangeStart, 'yyyy-MM-dd')}`
      : format(anchorDate, 'MM-yyyy');
    a.download = `bao-cao-nhan-vien-${fileTag}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Đã tải báo cáo');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Báo cáo tổng hợp nhân viên</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Thống kê giờ làm, chấm công, đánh giá theo {rangeMode === 'day' ? 'ngày' : rangeMode === 'week' ? 'tuần' : 'tháng'}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={downloadCSV}>
          <Download className="h-4 w-4" /> Xuất CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="Tìm nhân viên..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Range mode tabs */}
        <div className="flex rounded-md border bg-background p-0.5">
          {(['day', 'week', 'month'] as RangeMode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setRangeMode(m)}
              className={cn(
                'px-3 h-8 text-xs font-medium rounded transition-colors',
                rangeMode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {m === 'day' ? 'Ngày' : m === 'week' ? 'Tuần' : 'Tháng'}
            </button>
          ))}
        </div>

        {/* Date navigator */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-9 w-8" onClick={() => shiftRange(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 min-w-[200px] justify-start font-normal">
                <CalendarIcon className="h-3.5 w-3.5" />
                {rangeLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={anchorDate}
                onSelect={d => d && setAnchorDate(d)}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" className="h-9 w-8" onClick={() => shiftRange(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {!isHR && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue placeholder="Chi nhánh" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả chi nhánh</SelectItem>
              {branches.map(b => (
                <SelectItem key={b.id} value={b.id}>{b.branch_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Nhân viên</p>
              <p className="text-lg font-bold">{filtered.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Clock className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tổng giờ quy đổi</p>
              <p className="text-lg font-bold text-emerald-600">{formatHours(totals.effective)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tổng ca</p>
              <p className="text-lg font-bold">{totals.shifts}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Đi trễ</p>
              <p className="text-lg font-bold text-destructive">{totals.late}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Star className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Điểm TB</p>
              <p className="text-lg font-bold">{totals.avgScore || '—'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detail table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Họ tên</TableHead>
                  <TableHead className="text-xs">Chi nhánh</TableHead>
                  <TableHead className="text-xs text-center">Số ca</TableHead>
                  <TableHead className="text-xs text-right">Tổng giờ</TableHead>
                  <TableHead className="text-xs text-right">Quy đổi</TableHead>
                  <TableHead className="text-xs text-center">Đi trễ</TableHead>
                  <TableHead className="text-xs text-center">Về sớm</TableHead>
                  <TableHead className="text-xs text-center">Điểm TB</TableHead>
                  <TableHead className="text-xs text-center">Đánh giá</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-12" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">Không có dữ liệu</TableCell>
                  </TableRow>
                ) : (
                  filtered.map(s => {
                    const badge = s.avgScore > 0 ? getEvaluationBadge(s.avgScore) : null;
                    const badgeInfo = badge ? getBadgeInfo(badge) : null;
                    return (
                      <TableRow key={s.userId}>
                        <TableCell className="font-medium text-sm">{s.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.branchName || '—'}</TableCell>
                        <TableCell className="text-sm text-center">{s.totalShifts}</TableCell>
                        <TableCell className="text-sm text-right">{formatHours(s.totalHours)}</TableCell>
                        <TableCell className="text-sm text-right font-medium">{formatHours(s.effectiveHours)}</TableCell>
                        <TableCell className="text-center">
                          {s.lateCount > 0 ? (
                            <Badge variant="destructive" className="text-xs">{s.lateCount}</Badge>
                          ) : <span className="text-xs text-muted-foreground">0</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {s.earlyLeaveCount > 0 ? (
                            <Badge variant="destructive" className="text-xs">{s.earlyLeaveCount}</Badge>
                          ) : <span className="text-xs text-muted-foreground">0</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className={`text-sm font-semibold ${s.avgScore < 70 ? 'text-destructive' : s.avgScore > 90 ? 'text-primary' : ''}`}>
                              {s.avgScore || '—'}
                            </span>
                            {badgeInfo && <Badge variant={badgeInfo.variant} className="text-[10px] ml-1">{badgeInfo.label}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-xs">{s.evalCount}</span>
                            {s.lowScoreCount > 0 && (
                              <Badge variant="destructive" className="text-[10px]">{s.lowScoreCount} thấp</Badge>
                            )}
                            {s.highScoreCount > 0 && (
                              <Badge variant="default" className="text-[10px]">{s.highScoreCount} cao</Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
