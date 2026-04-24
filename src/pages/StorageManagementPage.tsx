import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  CalendarIcon,
  ClipboardList,
  Database,
  Download,
  HardDrive,
  ImageIcon,
  ShieldAlert,
  Star,
  Trash2,
} from 'lucide-react';

type Category = 'check_in_images' | 'shifts' | 'evaluations';

interface DeleteResult {
  category: string;
  count: number;
}

interface StorageOverview {
  totalBytes: number;
  totalFiles: number;
  bucketCount: number;
}

interface BucketUsage {
  bucket_id: string;
  total_bytes: number;
  total_files: number;
}

const STORAGE_QUOTA_MB = 1000;

function formatBytes(bytes: number) {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function objectArrayToCsv(title: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return `${title}\nKhông có dữ liệu\n`;
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csvRows = [
    title,
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
    '',
  ];
  return csvRows.join('\n');
}

export default function StorageManagementPage() {
  const { user } = useAuth();
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [categories, setCategories] = useState<Set<Category>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<DeleteResult[]>([]);
  const [overview, setOverview] = useState<StorageOverview | null>(null);
  const [bucketUsage, setBucketUsage] = useState<BucketUsage[]>([]);
  const [usageLoading, setUsageLoading] = useState(true);

  const isIT = user?.role === 'IT';
  const hasDateRange = Boolean(dateFrom && dateTo);
  const canDelete = hasDateRange && categories.size > 0;
  const usedMb = (overview?.totalBytes ?? 0) / (1024 * 1024);
  const quotaBytes = STORAGE_QUOTA_MB * 1024 * 1024;

  const fetchUsage = async () => {
    setUsageLoading(true);
    const [{ data: totalData, error: totalError }, { data: bucketData, error: bucketError }] = await Promise.all([
      supabase.rpc('get_total_storage_usage'),
      supabase.rpc('get_storage_usage_by_bucket'),
    ]);

    if (totalError || bucketError) {
      toast.error('Không thể tải thống kê dung lượng hệ thống.');
      setUsageLoading(false);
      return;
    }

    const total = totalData?.[0];
    setOverview({
      totalBytes: Number(total?.total_bytes ?? 0),
      totalFiles: Number(total?.total_files ?? 0),
      bucketCount: Number(total?.bucket_count ?? 0),
    });
    setBucketUsage((bucketData ?? []).map((item) => ({
      bucket_id: item.bucket_id,
      total_bytes: Number(item.total_bytes ?? 0),
      total_files: Number(item.total_files ?? 0),
    })));
    setUsageLoading(false);
  };

  useEffect(() => {
    if (isIT) void fetchUsage();
  }, [isIT]);

  useEffect(() => {
    setBackupDownloaded(false);
    setBackupConfirmed(false);
  }, [dateFrom, dateTo, categories]);

  const toggleCategory = (cat: Category) => {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const callStorageManager = async (action: 'export' | 'cleanup') => {
    if (!dateFrom || !dateTo) throw new Error('Vui lòng chọn khoảng ngày.');
    const { data, error } = await supabase.functions.invoke('it-storage-manager', {
      body: {
        action,
        dateFrom: format(dateFrom, 'yyyy-MM-dd'),
        dateTo: format(dateTo, 'yyyy-MM-dd'),
        categories: Array.from(categories),
      },
    });
    if (error || data?.error) {
      throw new Error(data?.error || error?.message || 'Không thể xử lý yêu cầu.');
    }
    return data;
  };

  const handleExport = async () => {
    if (!canDelete) return;
    setExporting(true);
    try {
      const data = await callStorageManager('export');
      const exportData = data?.data ?? {};
      const sections: string[] = [];

      sections.push(`BÁO CÁO BACKUP DỮ LIỆU IT`);
      sections.push(`Từ ngày,${data.date_from}`);
      sections.push(`Đến ngày,${data.date_to}`);
      sections.push(`Xuất lúc,${data.exported_at}`);
      sections.push('');

      if (Array.isArray(exportData.check_in_images)) {
        sections.push(objectArrayToCsv('ẢNH CHẤM CÔNG', exportData.check_in_images as Record<string, unknown>[]));
      }
      if (Array.isArray(exportData.shifts)) {
        sections.push(objectArrayToCsv('NHẬT KÝ CA LÀM', exportData.shifts as Record<string, unknown>[]));
      }
      if (Array.isArray(exportData.evaluations)) {
        sections.push(objectArrayToCsv('BẢNG CHẤM ĐIỂM', exportData.evaluations as Record<string, unknown>[]));
      }

      const filename = `backup-it-${data.date_from}-to-${data.date_to}.csv`;
      downloadCsv(filename, sections.join('\n'));
      setBackupDownloaded(true);
      toast.success('Đã tải file backup dữ liệu.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tải backup.');
    } finally {
      setExporting(false);
    }
  };

  const verifyItPassword = async () => {
    if (!user?.email) throw new Error('Không tìm thấy email tài khoản IT.');
    const tempClient = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          storageKey: 'it-password-check',
        },
      },
    );

    const { error } = await tempClient.auth.signInWithPassword({
      email: user.email,
      password,
    });
    await tempClient.auth.signOut();
    if (error) {
      throw new Error('Mật khẩu tài khoản IT không đúng.');
    }
  };

  const handleDelete = async () => {
    if (!isIT || !canDelete || confirmText !== 'CONFIRM' || !backupDownloaded || !backupConfirmed) return;

    setDeleting(true);
    setProgress(15);
    setResults([]);

    try {
      await verifyItPassword();
      setProgress(40);
      const data = await callStorageManager('cleanup');
      const deleteResults = ((data?.results ?? []) as DeleteResult[]).map((item) => ({
        category: item.category,
        count: Number(item.count ?? 0),
      }));

      setResults(deleteResults);
      setProgress(100);
      setCategories(new Set());
      setDateFrom(undefined);
      setDateTo(undefined);
      setShowConfirm(false);
      setConfirmText('');
      setPassword('');
      setBackupDownloaded(false);
      setBackupConfirmed(false);
      await fetchUsage();

      const totalDeleted = deleteResults.reduce((sum, item) => sum + Math.max(item.count, 0), 0);
      toast.success(`Đã xóa ${totalDeleted} bản ghi thành công.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể xóa dữ liệu.');
    } finally {
      setDeleting(false);
    }
  };

  const resetConfirmState = () => {
    setConfirmText('');
    setPassword('');
    setBackupConfirmed(false);
    setShowConfirm(false);
  };

  if (!isIT) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
        <p className="font-semibold text-foreground">Bạn không có quyền truy cập trang này.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Quản lý lưu trữ hệ thống</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Quyền IT theo dõi tổng dung lượng, export dữ liệu cũ và xóa theo khoảng ngày bất kỳ.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <HardDrive className="h-5 w-5 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Đã dùng / tổng quota</p>
                {usageLoading ? <Skeleton className="h-6 w-36" /> : <p className="text-xl font-semibold">{usedMb.toFixed(1)} MB / {STORAGE_QUOTA_MB} MB</p>}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Tổng file</p>
                {usageLoading ? <Skeleton className="h-6 w-20" /> : <p className="text-xl font-semibold">{overview?.totalFiles ?? 0}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <HardDrive className="h-5 w-5 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Số bucket đang dùng</p>
                {usageLoading ? <Skeleton className="h-6 w-20" /> : <p className="text-xl font-semibold">{overview?.bucketCount ?? 0}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Tổng dung lượng hệ thống</span>
            {usageLoading ? <Skeleton className="h-4 w-36" /> : <span className="font-semibold">{formatBytes(overview?.totalBytes ?? 0)} / {STORAGE_QUOTA_MB} MB</span>}
          </div>
          <Progress value={Math.min(((overview?.totalBytes ?? 0) / quotaBytes) * 100, 100)} className="h-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Dung lượng theo bucket</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {usageLoading ? (
            Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-11 w-full" />)
          ) : bucketUsage.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu lưu trữ nào.</p>
          ) : (
            bucketUsage.map((bucket) => {
              const percent = overview?.totalBytes ? (bucket.total_bytes / overview.totalBytes) * 100 : 0;
              return (
                <div key={bucket.bucket_id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm gap-4">
                    <span className="font-medium text-foreground">{bucket.bucket_id}</span>
                    <span className="text-muted-foreground">{formatBytes(bucket.total_bytes)} · {bucket.total_files} files</span>
                  </div>
                  <Progress value={Math.min(percent, 100)} className="h-2" />
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/5">
        <ShieldAlert className="h-4 w-4 text-yellow-600" />
        <AlertTitle className="text-yellow-700 font-semibold">Chế độ an toàn</AlertTitle>
        <AlertDescription className="text-yellow-600 text-sm">
          Trước khi xóa, IT phải tải file backup dữ liệu, xác nhận lần nữa và nhập lại mật khẩu tài khoản IT.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" /> Từ ngày
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !dateFrom && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, 'dd/MM/yyyy', { locale: vi }) : 'Chọn ngày bắt đầu...'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" /> Đến ngày
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !dateTo && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, 'dd/MM/yyyy', { locale: vi }) : 'Chọn ngày kết thúc...'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Database className="h-4 w-4" /> Danh mục cleanup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border hover:bg-muted/50 transition-colors">
            <Checkbox checked={categories.has('check_in_images')} onCheckedChange={() => toggleCategory('check_in_images')} />
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Ảnh chấm công</p>
              <p className="text-xs text-muted-foreground">Export manifest ảnh + dữ liệu check-in rồi mới xóa.</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border hover:bg-muted/50 transition-colors">
            <Checkbox checked={categories.has('shifts')} onCheckedChange={() => toggleCategory('shifts')} />
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Nhật ký ca làm</p>
              <p className="text-xs text-muted-foreground">Backup ra file CSV để mở bằng Excel trước khi xóa.</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border hover:bg-muted/50 transition-colors">
            <Checkbox checked={categories.has('evaluations')} onCheckedChange={() => toggleCategory('evaluations')} />
            <Star className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Bảng chấm điểm hiệu suất</p>
              <p className="text-xs text-muted-foreground">Xuất dữ liệu đánh giá thành một file CSV trước khi xóa.</p>
            </div>
          </label>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" className="gap-2" disabled={!canDelete || exporting} onClick={handleExport}>
          <Download className="h-4 w-4" />
          {exporting ? 'Đang tải backup...' : 'Tải file backup (.csv)'}
        </Button>
        <Button variant="destructive" className="gap-2" disabled={!canDelete || deleting} onClick={() => setShowConfirm(true)}>
          <Trash2 className="h-4 w-4" />
          Xóa dữ liệu đã chọn
        </Button>
      </div>

      {deleting && (
        <Card>
          <CardContent className="py-6 space-y-3">
            <p className="text-sm font-medium text-foreground">Đang xóa dữ liệu...</p>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">{progress}%</p>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && !deleting && (
        <Card className="border-green-500/30">
          <CardContent className="py-6 space-y-2">
            <p className="text-sm font-semibold text-green-700">Hoàn tất dọn dữ liệu</p>
            {results.map((result) => (
              <p key={result.category} className="text-sm text-foreground">
                {result.category}: <strong>{result.count} bản ghi</strong>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={showConfirm} onOpenChange={(open) => !open && resetConfirmState()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> Xác nhận xóa dữ liệu hệ thống
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Bạn sắp xóa dữ liệu từ <strong>{dateFrom ? format(dateFrom, 'dd/MM/yyyy') : ''}</strong> đến{' '}
                <strong>{dateTo ? format(dateTo, 'dd/MM/yyyy') : ''}</strong> cho <strong>{categories.size} danh mục</strong>.
              </p>
              <div className="space-y-2 rounded-md border p-3">
                <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={exporting}>
                  <Download className="h-4 w-4" />
                  {exporting ? 'Đang tải backup...' : 'Tải backup trước khi xóa'}
                </Button>
                <div className="flex items-center gap-2">
                  <Checkbox checked={backupConfirmed} onCheckedChange={(value) => setBackupConfirmed(Boolean(value))} />
                  <Label>Tôi xác nhận đã tải và lưu file backup.</Label>
                </div>
              </div>
              <div className="pt-2 space-y-2">
                <Label className="text-foreground">Nhập <strong>CONFIRM</strong> để xác nhận lần nữa:</Label>
                <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="CONFIRM" className="font-mono" />
              </div>
              <div className="pt-2 space-y-2">
                <Label className="text-foreground">Nhập lại mật khẩu tài khoản IT:</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mật khẩu tài khoản IT" />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={resetConfirmState}>Hủy</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!backupDownloaded || !backupConfirmed || confirmText !== 'CONFIRM' || !password || deleting}
              onClick={handleDelete}
            >
              Bắt đầu xóa
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
