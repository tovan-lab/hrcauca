import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Search, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addWeeks, addMonths } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getSignedImageUrls } from '@/lib/signed-urls';
import AttendanceSummary from '@/components/AttendanceSummary';

interface CheckInRow {
  id: string;
  user_id: string;
  image_url: string;
  check_in_time: string;
  check_out_time: string | null;
  status: boolean;
  attendance_status: string | null;
  shift_id: string | null;
  late_minutes: number | null;
  early_leave_minutes: number | null;
  verified: boolean | null;
  verified_by: string | null;
}

const PAGE_SIZE = 10;

const ATTENDANCE_LABELS: Record<string, string> = {
  on_time: 'Đúng giờ',
  late: 'Trễ',
  early_leave: 'Về sớm',
  late_and_early: 'Trễ & Về sớm',
  no_shift: 'Không có ca',
};

export default function LogsPage() {
  const { user } = useAuth();
  const isHR = user?.role === 'HR';
  const userBranchId = (user as any)?.branch_id;
  const [checkIns, setCheckIns] = useState<CheckInRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [profileBranches, setProfileBranches] = useState<Record<string, string>>({});
  const [branches, setBranches] = useState<{ id: string; branch_name: string }[]>([]);
  const [todayShifts, setTodayShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
  const [quickFilter, setQuickFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());

  const fetchData = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: cis }, { data: profs }, { data: branchList }, { data: shiftsData }] = await Promise.all([
      supabase.from('check_ins').select('*').order('check_in_time', { ascending: false }),
      supabase.from('profiles').select('user_id, name, branch_id'),
      supabase.from('branches').select('id, branch_name'),
      supabase.from('shifts').select('id, user_id, shift_date, start_time, end_time').eq('shift_date', today),
    ]);
    if (profs) {
      const map: Record<string, string> = {};
      const bmap: Record<string, string> = {};
      profs.forEach(p => {
        map[p.user_id] = p.name;
        if ((p as any).branch_id) bmap[p.user_id] = (p as any).branch_id;
      });
      setProfiles(map);
      setProfileBranches(bmap);
    }
    if (branchList) setBranches(branchList as any);
    setTodayShifts((shiftsData as any[]) || []);
    let allCheckIns = (cis as CheckInRow[]) || [];
    // HR can only see check-ins from their own branch
    if (isHR && userBranchId && profs) {
      const branchUsers = new Set(
        profs.filter(p => (p as any).branch_id === userBranchId).map(p => p.user_id)
      );
      allCheckIns = allCheckIns.filter(ci => branchUsers.has(ci.user_id));
    }
    setCheckIns(allCheckIns);
    // Resolve signed URLs for images
    const urls = allCheckIns.map(ci => ci.image_url).filter(Boolean);
    if (urls.length > 0) {
      const resolved = await getSignedImageUrls(urls);
      setSignedUrls(resolved);
    }
    setLoading(false);
  }, [isHR, userBranchId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const applyQuickFilter = useCallback((value: string) => {
    setQuickFilter(value);
    const now = new Date();
    if (value === 'day') {
      setFromDate(now);
      setToDate(now);
    } else if (value === 'week') {
      setFromDate(startOfWeek(now, { weekStartsOn: 1 }));
      setToDate(endOfWeek(now, { weekStartsOn: 1 }));
    } else if (value === 'month') {
      setFromDate(startOfMonth(now));
      setToDate(endOfMonth(now));
    } else {
      setFromDate(undefined);
      setToDate(undefined);
    }
  }, []);

  const navigateRange = useCallback((dir: 1 | -1) => {
    if (!quickFilter || !fromDate) return;
    if (quickFilter === 'day') {
      const d = addDays(fromDate, dir);
      setFromDate(d); setToDate(d);
    } else if (quickFilter === 'week') {
      const anchor = addWeeks(fromDate, dir);
      setFromDate(startOfWeek(anchor, { weekStartsOn: 1 }));
      setToDate(endOfWeek(anchor, { weekStartsOn: 1 }));
    } else if (quickFilter === 'month') {
      const anchor = addMonths(fromDate, dir);
      setFromDate(startOfMonth(anchor));
      setToDate(endOfMonth(anchor));
    }
  }, [quickFilter, fromDate]);

  const filtered = useMemo(() => {
    let result = checkIns;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(ci => (profiles[ci.user_id] || '').toLowerCase().includes(q));
    }
    if (branchFilter !== 'all') {
      result = result.filter(ci => profileBranches[ci.user_id] === branchFilter);
    }
    if (fromDate) {
      const from = new Date(fromDate); from.setHours(0, 0, 0, 0);
      result = result.filter(ci => new Date(ci.check_in_time) >= from);
    }
    if (toDate) {
      const to = new Date(toDate); to.setHours(23, 59, 59, 999);
      result = result.filter(ci => new Date(ci.check_in_time) <= to);
    }
    return result;
  }, [checkIns, search, fromDate, toDate, profiles, branchFilter, profileBranches]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  useEffect(() => { setPage(0); }, [search, fromDate, toDate]);

  const handleVerify = async (ciId: string, verified: boolean) => {
    if (!user) return;
    await supabase.from('check_ins').update({ verified, verified_by: user.id }).eq('id', ciId);
    setCheckIns(prev => prev.map(ci => ci.id === ciId ? { ...ci, verified, verified_by: user.id } : ci));
    toast.success(verified ? 'Đã xác nhận hợp lệ' : 'Đã bỏ xác nhận');
  };

  const downloadReport = () => {
    const branchMap: Record<string, string> = {};
    branches.forEach(b => { branchMap[b.id] = b.branch_name; });
    const bom = '\uFEFF';
    const headers = ['Họ tên', 'Chi nhánh', 'Ngày', 'Giờ vào', 'Giờ ra', 'Trạng thái', 'Trễ (phút)', 'Về sớm (phút)', 'Xác nhận'];
    const rows = filtered.map(ci => [
      profiles[ci.user_id] || ci.user_id.slice(0, 8),
      branchMap[profileBranches[ci.user_id]] || '',
      format(new Date(ci.check_in_time), 'dd/MM/yyyy'),
      format(new Date(ci.check_in_time), 'HH:mm'),
      ci.check_out_time ? format(new Date(ci.check_out_time), 'HH:mm') : '',
      ATTENDANCE_LABELS[ci.attendance_status || 'on_time'] || 'Đúng giờ',
      ci.late_minutes || 0,
      ci.early_leave_minutes || 0,
      ci.verified ? 'Có' : 'Chưa',
    ]);
    const csv = bom + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bao-cao-cham-cong-${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Đã tải báo cáo');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Nhật ký chấm công</h2>
          <p className="text-sm text-muted-foreground mt-1">Xem và xác nhận chấm công nhân viên</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={downloadReport}>
          <Download className="h-4 w-4" /> Tải báo cáo
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="Tìm theo tên nhân viên..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={quickFilter} onValueChange={applyQuickFilter}>
          <SelectTrigger className="w-[140px] h-9 text-xs">
            <SelectValue placeholder="Lọc nhanh" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="day">Hôm nay</SelectItem>
            <SelectItem value="week">Tuần này</SelectItem>
            <SelectItem value="month">Tháng này</SelectItem>
          </SelectContent>
        </Select>
        {quickFilter && quickFilter !== 'all' && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-9 w-8" onClick={() => navigateRange(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-8" onClick={() => navigateRange(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
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
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn('text-xs', !fromDate && 'text-muted-foreground')}>
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
              {fromDate ? format(fromDate, 'dd/MM/yyyy') : 'Từ ngày'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={fromDate} onSelect={setFromDate} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn('text-xs', !toDate && 'text-muted-foreground')}>
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
              {toDate ? format(toDate, 'dd/MM/yyyy') : 'Đến ngày'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={toDate} onSelect={setToDate} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        {(fromDate || toDate || search) && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setSearch(''); setFromDate(undefined); setToDate(undefined); setQuickFilter(''); }}>
            Xóa bộ lọc
          </Button>
        )}
      </div>

      <AttendanceSummary
        shifts={todayShifts}
        checkIns={checkIns}
        profiles={profiles}
        profileBranches={profileBranches}
        branches={branches}
        branchFilter={branchFilter}
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-16">Ảnh</TableHead>
                  <TableHead className="text-xs">Họ tên</TableHead>
                  <TableHead className="text-xs">Giờ vào</TableHead>
                  <TableHead className="text-xs">Giờ ra</TableHead>
                  <TableHead className="text-xs">Trạng thái</TableHead>
                  <TableHead className="text-xs">Chi tiết</TableHead>
                  <TableHead className="text-xs text-center">Xác nhận</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-10 w-10 rounded" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Không có dữ liệu</TableCell>
                  </TableRow>
                ) : (
                  paged.map(ci => {
                    const statusLabel = ATTENDANCE_LABELS[ci.attendance_status || 'on_time'] || 'Đúng giờ';
                    const isLate = ci.attendance_status === 'late' || ci.attendance_status === 'late_and_early';
                    const isEarly = ci.attendance_status === 'early_leave' || ci.attendance_status === 'late_and_early';
                    const isNoShift = ci.attendance_status === 'no_shift';

                    return (
                      <TableRow key={ci.id}>
                        <TableCell>
                          {ci.image_url ? (
                            <img src={signedUrls.get(ci.image_url) || ci.image_url} alt="" className="h-10 w-10 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setPreviewImage(signedUrls.get(ci.image_url) || ci.image_url)} />
                          ) : (
                            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">N/A</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{profiles[ci.user_id] || ci.user_id.slice(0, 8)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(ci.check_in_time).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {ci.check_out_time ? format(new Date(ci.check_out_time), 'HH:mm dd/MM') : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={isLate || isEarly || isNoShift ? 'destructive' : 'default'} className="text-xs">
                            {statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {isLate && <span className="text-destructive">Trễ {ci.late_minutes}p</span>}
                          {isLate && isEarly && ' • '}
                          {isEarly && <span className="text-destructive">Sớm {ci.early_leave_minutes}p</span>}
                          {!isLate && !isEarly && '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={ci.verified || false}
                            onCheckedChange={(checked) => handleVerify(ci.id, !!checked)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {!loading && filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Hiển thị {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} / {filtered.length}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle className="sr-only">Xem ảnh chấm công</DialogTitle>
          {previewImage && <img src={previewImage} alt="" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
