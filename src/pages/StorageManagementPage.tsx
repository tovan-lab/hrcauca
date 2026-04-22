import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { CalendarIcon, Trash2, ShieldAlert, Database, ImageIcon, ClipboardList, Star } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Category = 'check_in_images' | 'shifts' | 'evaluations';

interface DeleteResult {
  category: string;
  count: number;
}

export default function StorageManagementPage() {
  const { user } = useAuth();
  const [cutoffDate, setCutoffDate] = useState<Date | undefined>();
  const [categories, setCategories] = useState<Set<Category>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<DeleteResult[]>([]);

  const maxDate = useMemo(() => subDays(new Date(), 90), []);

  const isAdmin = user?.role === 'ADMIN';

  const toggleCategory = (cat: Category) => {
    setCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const canDelete = cutoffDate && categories.size > 0 && cutoffDate <= maxDate;

  const handleDelete = async () => {
    if (confirmText !== 'CONFIRM' || !cutoffDate || !isAdmin) return;
    setShowConfirm(false);
    setConfirmText('');
    setDeleting(true);
    setProgress(0);
    setResults([]);

    const cutoffISO = cutoffDate.toISOString();
    const cutoffDateStr = format(cutoffDate, 'yyyy-MM-dd');
    const cats = Array.from(categories);
    const totalSteps = cats.length;
    let step = 0;
    const deleteResults: DeleteResult[] = [];

    for (const cat of cats) {
      try {
        if (cat === 'check_in_images') {
          // 1. Fetch check-in records to get image paths
          const { data: records } = await supabase
            .from('check_ins')
            .select('id, image_url')
            .lt('check_in_time', cutoffISO);

          if (records && records.length > 0) {
            // Extract storage paths from image_url
            const storagePaths = records
              .map(r => {
                // image_url could be a signed URL or a path like "userId/timestamp.jpg"
                const url = r.image_url;
                if (!url || url.startsWith('data:')) return null;
                // If it's a path (contains userId/), use directly
                const match = url.match(/checkin-images\/([^?]+)/);
                if (match) return match[1];
                // If it looks like a plain path
                if (url.match(/^[a-f0-9-]+\/\d+\.jpg$/)) return url;
                return null;
              })
              .filter(Boolean) as string[];

            // Batch delete storage files (max 100 per call)
            for (let i = 0; i < storagePaths.length; i += 100) {
              const batch = storagePaths.slice(i, i + 100);
              await supabase.storage.from('checkin-images').remove(batch);
            }

            // Delete DB records
            await supabase.from('check_ins').delete().lt('check_in_time', cutoffISO);
            deleteResults.push({ category: 'Ảnh chấm công', count: records.length });
          } else {
            deleteResults.push({ category: 'Ảnh chấm công', count: 0 });
          }
        } else if (cat === 'shifts') {
          const { data } = await supabase
            .from('shifts')
            .delete()
            .lt('shift_date', cutoffDateStr)
            .select('id');
          deleteResults.push({ category: 'Nhật ký ca làm', count: data?.length || 0 });
        } else if (cat === 'evaluations') {
          const { data } = await supabase
            .from('evaluations')
            .delete()
            .lt('evaluation_date', cutoffDateStr)
            .select('id');
          deleteResults.push({ category: 'Bảng chấm điểm', count: data?.length || 0 });
        }
      } catch (err) {
        console.error(`Error deleting ${cat}:`, err);
        deleteResults.push({ category: cat, count: -1 });
      }

      step++;
      setProgress(Math.round((step / totalSteps) * 100));
    }

    setResults(deleteResults);
    setDeleting(false);
    setCategories(new Set());
    setCutoffDate(undefined);

    const totalDeleted = deleteResults.reduce((s, r) => s + Math.max(r.count, 0), 0);
    toast.success(`Đã xóa ${totalDeleted} bản ghi thành công.`);
  };

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
        <p className="font-semibold text-foreground">Bạn không có quyền truy cập trang này.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Quản lý lưu trữ</h2>
        <p className="text-sm text-muted-foreground mt-1">Xóa dữ liệu cũ để tiết kiệm dung lượng</p>
      </div>

      <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/5">
        <ShieldAlert className="h-4 w-4 text-yellow-600" />
        <AlertTitle className="text-yellow-700 font-semibold">Chế độ an toàn</AlertTitle>
        <AlertDescription className="text-yellow-600 text-sm">
          Chế độ xóa dữ liệu chỉ mở khóa cho các bản ghi sau 3 tháng lưu trữ để đảm bảo tính minh bạch.
          Dữ liệu bị xóa <strong>không thể khôi phục</strong>.
        </AlertDescription>
      </Alert>

      {/* Date picker */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" /> Chọn mốc thời gian xóa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Tất cả bản ghi <strong>trước ngày</strong> này sẽ bị xóa. Chỉ cho phép chọn ngày cách đây ít nhất 90 ngày.
          </p>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !cutoffDate && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {cutoffDate ? format(cutoffDate, 'dd/MM/yyyy', { locale: vi }) : 'Chọn ngày...'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={cutoffDate}
                onSelect={setCutoffDate}
                disabled={(date) => date > maxDate || date > new Date()}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
        </CardContent>
      </Card>

      {/* Category selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Database className="h-4 w-4" /> Xóa theo danh mục
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border hover:bg-muted/50 transition-colors">
            <Checkbox
              checked={categories.has('check_in_images')}
              onCheckedChange={() => toggleCategory('check_in_images')}
            />
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Ảnh chấm công</p>
              <p className="text-xs text-muted-foreground">Xóa ảnh trong Storage + bản ghi check-in trong DB</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border hover:bg-muted/50 transition-colors">
            <Checkbox
              checked={categories.has('shifts')}
              onCheckedChange={() => toggleCategory('shifts')}
            />
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Nhật ký ca làm</p>
              <p className="text-xs text-muted-foreground">Xóa bản ghi lịch ca trong DB</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border hover:bg-muted/50 transition-colors">
            <Checkbox
              checked={categories.has('evaluations')}
              onCheckedChange={() => toggleCategory('evaluations')}
            />
            <Star className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Bảng chấm điểm hiệu suất</p>
              <p className="text-xs text-muted-foreground">Xóa bản ghi đánh giá trong DB</p>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* Progress & results */}
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
            <p className="text-sm font-semibold text-green-700">✓ Hoàn tất xóa dữ liệu</p>
            {results.map((r, i) => (
              <p key={i} className="text-sm text-foreground">
                {r.category}: <strong>{r.count >= 0 ? `${r.count} bản ghi` : 'Lỗi'}</strong>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Delete button */}
      <Button
        variant="destructive"
        size="lg"
        className="w-full gap-2"
        disabled={!canDelete || deleting}
        onClick={() => setShowConfirm(true)}
      >
        <Trash2 className="h-4 w-4" />
        Xóa vĩnh viễn
      </Button>

      {/* Strict confirmation dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> Xác nhận xóa vĩnh viễn
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Bạn sắp xóa tất cả dữ liệu trước ngày{' '}
                <strong>{cutoffDate ? format(cutoffDate, 'dd/MM/yyyy') : ''}</strong> cho{' '}
                <strong>{categories.size} danh mục</strong>.
              </p>
              <p className="text-destructive font-semibold">
                Hành động này KHÔNG THỂ hoàn tác. Dữ liệu sẽ bị xóa vĩnh viễn.
              </p>
              <div className="pt-2 space-y-2">
                <Label className="text-foreground">Nhập <strong>CONFIRM</strong> để tiếp tục:</Label>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="CONFIRM"
                  className="font-mono"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmText('')}>Hủy</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={confirmText !== 'CONFIRM'}
              onClick={handleDelete}
            >
              Xóa vĩnh viễn
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
