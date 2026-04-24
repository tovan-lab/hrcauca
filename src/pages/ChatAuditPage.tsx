import { useEffect, useMemo, useState } from 'react';
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  Bot,
  CalendarIcon,
  Eye,
  Filter,
  MessageSquare,
  Search,
  ShieldAlert,
  ShieldQuestion,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type ViewMode = 'day' | 'week' | 'month';
type RoleFilter = 'all' | 'ADMIN' | 'HR';
type MutationFilter = 'all' | 'query' | 'mutation';

interface ChatAuditRecord {
  id: string;
  conversation_id: string;
  actor_name: string | null;
  user_role: 'ADMIN' | 'HR';
  branch_id: string | null;
  branch_name: string | null;
  user_message: string;
  assistant_reply: string;
  mutations_applied: boolean;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

interface AuditSummary {
  totalMessages: number;
  totalConversations: number;
  totalMutations: number;
  totalActors: number;
}

function getDateRange(mode: ViewMode, anchorDate: Date) {
  if (mode === 'day') {
    return { from: startOfDay(anchorDate), to: endOfDay(anchorDate) };
  }

  if (mode === 'week') {
    return {
      from: startOfWeek(anchorDate, { weekStartsOn: 1 }),
      to: endOfWeek(anchorDate, { weekStartsOn: 1 }),
    };
  }

  return {
    from: startOfMonth(anchorDate),
    to: endOfMonth(anchorDate),
  };
}

function roleLabel(role: 'ADMIN' | 'HR') {
  return role === 'ADMIN' ? 'HR' : 'Quản lý';
}

function roleBadgeClass(role: 'ADMIN' | 'HR') {
  return role === 'ADMIN'
    ? 'bg-rose-100 text-rose-700 border-rose-200'
    : 'bg-sky-100 text-sky-700 border-sky-200';
}

function truncateText(text: string) {
  return text?.trim() || 'Không có nội dung';
}

export default function ChatAuditPage() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [records, setRecords] = useState<ChatAuditRecord[]>([]);
  const [summary, setSummary] = useState<AuditSummary>({
    totalMessages: 0,
    totalConversations: 0,
    totalMutations: 0,
    totalActors: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [mutationFilter, setMutationFilter] = useState<MutationFilter>('all');
  const [detailRecord, setDetailRecord] = useState<ChatAuditRecord | null>(null);

  const isIT = user?.role === 'IT';
  const { from, to } = useMemo(() => getDateRange(viewMode, anchorDate), [viewMode, anchorDate]);

  const loadAuditLogs = async () => {
    setLoading(true);

    const { data, error } = await supabase.functions.invoke('it-chat-audit-manager', {
      body: {
        action: 'list',
        dateFrom: format(from, 'yyyy-MM-dd'),
        dateTo: format(to, 'yyyy-MM-dd'),
      },
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Không thể tải lịch sử chat AI.');
      setLoading(false);
      return;
    }

    setRecords((data?.records ?? []) as ChatAuditRecord[]);
    setSummary((data?.summary ?? {}) as AuditSummary);
    setSelectedIds(new Set());
    setLoading(false);
  };

  useEffect(() => {
    if (isIT) void loadAuditLogs();
  }, [isIT, viewMode, anchorDate]);

  const branches = useMemo(() => {
    const unique = new Map<string, string>();
    records.forEach((record) => {
      const value = record.branch_name || 'Toàn hệ thống';
      unique.set(value, value);
    });
    return Array.from(unique.values()).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [records]);

  const filteredRecords = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return records.filter((record) => {
      const matchesSearch = !search || [
        record.actor_name || '',
        record.user_message || '',
        record.assistant_reply || '',
      ].some((value) => value.toLowerCase().includes(search));

      const matchesRole = roleFilter === 'all' || record.user_role === roleFilter;
      const resolvedBranch = record.branch_name || 'Toàn hệ thống';
      const matchesBranch = branchFilter === 'all' || resolvedBranch === branchFilter;
      const matchesMutation =
        mutationFilter === 'all' ||
        (mutationFilter === 'mutation' && record.mutations_applied) ||
        (mutationFilter === 'query' && !record.mutations_applied);

      return matchesSearch && matchesRole && matchesBranch && matchesMutation;
    });
  }, [records, searchTerm, roleFilter, branchFilter, mutationFilter]);

  const allSelected =
    filteredRecords.length > 0 &&
    filteredRecords.every((record) => selectedIds.has(record.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        filteredRecords.forEach((record) => next.delete(record.id));
        return next;
      }

      const next = new Set(prev);
      filteredRecords.forEach((record) => next.add(record.id));
      return next;
    });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;

    setDeleting(true);
    const { data, error } = await supabase.functions.invoke('it-chat-audit-manager', {
      body: {
        action: 'delete',
        ids: Array.from(selectedIds),
      },
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Không thể xóa lịch sử chat.');
      setDeleting(false);
      return;
    }

    toast.success(`Đã xóa ${Number(data?.deletedCount ?? 0)} bản ghi lịch sử chat.`);
    setConfirmDeleteOpen(false);
    setDeleting(false);
    await loadAuditLogs();
  };

  if (!isIT) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-destructive" />
        <p className="font-semibold text-foreground">
          Bạn không có quyền truy cập trang này.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Lịch sử chat AI</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          IT theo dõi lịch sử chat của HR và quản lý, lọc theo thời gian và xử lý khi cần.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Tổng lượt chat</p>
            {loading ? <Skeleton className="mt-2 h-7 w-16" /> : <p className="text-2xl font-semibold">{summary.totalMessages}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Tổng hội thoại</p>
            {loading ? <Skeleton className="mt-2 h-7 w-16" /> : <p className="text-2xl font-semibold">{summary.totalConversations}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Lượt thao tác dữ liệu</p>
            {loading ? <Skeleton className="mt-2 h-7 w-16" /> : <p className="text-2xl font-semibold">{summary.totalMutations}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Người dùng hoạt động</p>
            {loading ? <Skeleton className="mt-2 h-7 w-16" /> : <p className="text-2xl font-semibold">{summary.totalActors}</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="border shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row">
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Ngày</SelectItem>
                  <SelectItem value="week">Tuần</SelectItem>
                  <SelectItem value="month">Tháng</SelectItem>
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="min-w-[220px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(anchorDate, 'dd/MM/yyyy', { locale: vi })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={anchorDate}
                    onSelect={(date) => date && setAnchorDate(date)}
                    initialFocus
                    className="pointer-events-auto p-3"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => void loadAuditLogs()} disabled={loading}>
                Làm mới
              </Button>
              <Button
                variant="destructive"
                className="gap-2"
                disabled={selectedIds.size === 0 || deleting}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Xóa đã chọn
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative xl:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Tìm theo tên người chat hoặc nội dung câu hỏi..."
                className="pl-9"
              />
            </div>

            <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Lọc vai trò" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả vai trò</SelectItem>
                <SelectItem value="ADMIN">HR</SelectItem>
                <SelectItem value="HR">Quản lý</SelectItem>
              </SelectContent>
            </Select>

            <div className="grid grid-cols-2 gap-3">
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Chi nhánh" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả chi nhánh</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch} value={branch}>
                      {branch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={mutationFilter} onValueChange={(value) => setMutationFilter(value as MutationFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Loại thao tác" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="query">Chỉ hỏi</SelectItem>
                  <SelectItem value="mutation">Có thay đổi data</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Bot className="h-4 w-4" />
            Bảng lịch sử chat AI
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                  </TableHead>
                  <TableHead className="w-[140px]">Thời gian</TableHead>
                  <TableHead className="w-[260px]">Người thao tác</TableHead>
                  <TableHead>Hội thoại</TableHead>
                  <TableHead className="w-[160px]">Phân loại</TableHead>
                  <TableHead className="w-[120px] text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-10 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-10 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-28" /></TableCell>
                      <TableCell><Skeleton className="ml-auto h-9 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Không có lịch sử chat phù hợp bộ lọc hiện tại.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((record) => (
                    <TableRow
                      key={record.id}
                      className="cursor-pointer transition-colors hover:bg-muted/40"
                      onClick={() => setDetailRecord(record)}
                    >
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(record.id)}
                          onCheckedChange={() => toggleSelected(record.id)}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="font-medium text-foreground">
                          {format(new Date(record.created_at), 'dd/MM/yyyy')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(record.created_at), 'HH:mm')}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="font-semibold text-foreground">
                          {record.actor_name || 'Không rõ'}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant="outline" className={roleBadgeClass(record.user_role)}>
                            {roleLabel(record.user_role)}
                          </Badge>
                          <Badge variant="outline" className="bg-muted text-muted-foreground">
                            {record.branch_name || 'Toàn hệ thống'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="line-clamp-1 text-sm font-medium text-foreground">
                          {truncateText(record.user_message)}
                        </div>
                        <div className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                          {truncateText(record.assistant_reply)}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        {record.mutations_applied ? (
                          <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700">
                            <TriangleAlert className="h-3.5 w-3.5" />
                            Thao tác dữ liệu
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 bg-slate-100 text-slate-700">
                            <ShieldQuestion className="h-3.5 w-3.5" />
                            Truy vấn
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right align-top" onClick={(event) => event.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="gap-2" onClick={() => setDetailRecord(record)}>
                          <Eye className="h-4 w-4" />
                          Xem chi tiết
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 p-4 md:hidden">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <Card key={index} className="border shadow-sm">
                  <CardContent className="space-y-3 p-4">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </CardContent>
                </Card>
              ))
            ) : filteredRecords.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Không có lịch sử chat phù hợp bộ lọc hiện tại.
              </div>
            ) : (
              filteredRecords.map((record) => (
                <Card
                  key={record.id}
                  className="cursor-pointer border shadow-sm transition-colors hover:bg-muted/30"
                  onClick={() => setDetailRecord(record)}
                >
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{record.actor_name || 'Không rõ'}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(record.created_at), 'dd/MM/yyyy HH:mm')}
                        </p>
                      </div>
                      <Checkbox
                        checked={selectedIds.has(record.id)}
                        onCheckedChange={() => toggleSelected(record.id)}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className={roleBadgeClass(record.user_role)}>
                        {roleLabel(record.user_role)}
                      </Badge>
                      <Badge variant="outline" className="bg-muted text-muted-foreground">
                        {record.branch_name || 'Toàn hệ thống'}
                      </Badge>
                      {record.mutations_applied ? (
                        <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700">
                          <TriangleAlert className="h-3.5 w-3.5" />
                          Mutation
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-100 text-slate-700">
                          Query
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="line-clamp-1 text-sm font-medium text-foreground">
                        {truncateText(record.user_message)}
                      </p>
                      <p className="line-clamp-1 text-sm text-muted-foreground">
                        {truncateText(record.assistant_reply)}
                      </p>
                    </div>

                    <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setDetailRecord(record)}>
                      <Eye className="h-4 w-4" />
                      Xem chi tiết
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Sheet open={Boolean(detailRecord)} onOpenChange={(open) => !open && setDetailRecord(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl">
          {detailRecord && (
            <>
              <SheetHeader>
                <SheetTitle>Chi tiết hội thoại AI</SheetTitle>
                <SheetDescription>
                  {detailRecord.actor_name || 'Không rõ'} • {roleLabel(detailRecord.user_role)} •{' '}
                  {detailRecord.branch_name || 'Toàn hệ thống'}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{format(new Date(detailRecord.created_at), 'dd/MM/yyyy HH:mm:ss')}</Badge>
                    {detailRecord.mutations_applied ? (
                      <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700">
                        <TriangleAlert className="h-3.5 w-3.5" />
                        Có thay đổi dữ liệu
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-slate-100 text-slate-700">
                        Chỉ truy vấn
                      </Badge>
                    )}
                  </div>
                </div>

                <ScrollArea className="h-[60vh] rounded-lg border bg-background">
                  <div className="space-y-4 p-4">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground shadow-sm">
                        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-primary-foreground/70">
                          Người dùng
                        </div>
                        <div className="whitespace-pre-wrap break-words">
                          {detailRecord.user_message || 'Không có nội dung.'}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-sm text-foreground shadow-sm">
                        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Trợ lý AI
                        </div>
                        <div className="whitespace-pre-wrap break-words">
                          {detailRecord.assistant_reply || 'Không có phản hồi.'}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border bg-slate-950 p-4 text-sm text-slate-100">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                        Mutation details / metadata
                      </div>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5">
                        {JSON.stringify(detailRecord.metadata || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa lịch sử chat</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sắp xóa <strong>{selectedIds.size}</strong> bản ghi lịch sử chat của HR và quản lý.
              Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteSelected();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Đang xóa...' : 'Xóa lịch sử'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
