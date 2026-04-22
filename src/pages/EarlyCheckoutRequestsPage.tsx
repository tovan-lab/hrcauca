import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Hourglass, Check, X, RefreshCw, Clock, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface EarlyRequest {
  id: string;
  employee_id: string;
  check_in_id: string;
  shift_id: string | null;
  branch_id: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  responded_at: string | null;
  response_note: string | null;
  // joined
  employee_name?: string;
  shift_start?: string;
  shift_end?: string;
  check_in_time?: string;
}

export default function EarlyCheckoutRequestsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<EarlyRequest[]>([]);
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [rejectDialog, setRejectDialog] = useState<EarlyRequest | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('early_checkout_requests')
        .select('*')
        .order('requested_at', { ascending: false });
      if (error) throw error;
      const list = (data as EarlyRequest[]) || [];

      // Enrich: join names + shift times + check-in time
      const employeeIds = Array.from(new Set(list.map(r => r.employee_id)));
      const shiftIds = Array.from(new Set(list.map(r => r.shift_id).filter(Boolean) as string[]));
      const ciIds = Array.from(new Set(list.map(r => r.check_in_id)));

      const [{ data: profiles }, { data: shifts }, { data: cis }] = await Promise.all([
        supabase.from('profiles').select('user_id, name').in('user_id', employeeIds),
        shiftIds.length
          ? supabase.from('shifts').select('id, start_time, end_time').in('id', shiftIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('check_ins').select('id, check_in_time').in('id', ciIds),
      ]);

      const nameMap = new Map((profiles || []).map((p: any) => [p.user_id, p.name]));
      const shiftMap = new Map((shifts || []).map((s: any) => [s.id, s]));
      const ciMap = new Map((cis || []).map((c: any) => [c.id, c.check_in_time]));

      setRequests(
        list.map(r => ({
          ...r,
          employee_name: nameMap.get(r.employee_id) || 'Nhân viên',
          shift_start: r.shift_id ? shiftMap.get(r.shift_id)?.start_time : undefined,
          shift_end: r.shift_id ? shiftMap.get(r.shift_id)?.end_time : undefined,
          check_in_time: ciMap.get(r.check_in_id),
        }))
      );
    } catch (e: any) {
      toast.error('Không tải được danh sách: ' + (e?.message || 'lỗi không xác định'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (req: EarlyRequest) => {
    if (!user) return;
    setActingId(req.id);
    try {
      const { error } = await (supabase as any)
        .from('early_checkout_requests')
        .update({
          status: 'approved',
          responded_by: user.id,
          responded_at: new Date().toISOString(),
        })
        .eq('id', req.id);
      if (error) throw error;
      toast.success(`Đã duyệt yêu cầu của ${req.employee_name}`);
      await fetchRequests();
    } catch (e: any) {
      toast.error('Lỗi duyệt: ' + (e?.message || 'thử lại'));
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async () => {
    if (!user || !rejectDialog) return;
    setActingId(rejectDialog.id);
    try {
      const { error } = await (supabase as any)
        .from('early_checkout_requests')
        .update({
          status: 'rejected',
          responded_by: user.id,
          responded_at: new Date().toISOString(),
          response_note: rejectNote.trim() || 'Không được duyệt',
        })
        .eq('id', rejectDialog.id);
      if (error) throw error;
      toast.success('Đã từ chối yêu cầu');
      setRejectDialog(null);
      setRejectNote('');
      await fetchRequests();
    } catch (e: any) {
      toast.error('Lỗi: ' + (e?.message || 'thử lại'));
    } finally {
      setActingId(null);
    }
  };

  const filtered = requests.filter(r => r.status === tab);

  const renderCard = (req: EarlyRequest) => {
    const checkInStr = req.check_in_time
      ? format(new Date(req.check_in_time), 'HH:mm dd/MM')
      : '—';
    const shiftStr = req.shift_start && req.shift_end
      ? `${req.shift_start.slice(0, 5)}–${req.shift_end.slice(0, 5)}`
      : 'Không có ca đăng ký';

    return (
      <Card key={req.id} className="border-border">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{req.employee_name}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Ca: {shiftStr}
                </span>
                <span>Check-in: {checkInStr}</span>
              </div>
            </div>
            <Badge
              variant={req.status === 'pending' ? 'outline' : req.status === 'approved' ? 'default' : 'destructive'}
              className="shrink-0 text-xs"
            >
              {req.status === 'pending' ? 'Chờ duyệt' : req.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
            </Badge>
          </div>

          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
            <p className="text-xs font-medium text-muted-foreground mb-1">Lý do:</p>
            <p className="whitespace-pre-wrap">{req.reason || '(không có)'}</p>
          </div>

          {req.status !== 'pending' && req.response_note && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              <span className="font-medium text-muted-foreground">Ghi chú phản hồi: </span>
              <span className="text-foreground">{req.response_note}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Gửi lúc {format(new Date(req.requested_at), 'HH:mm dd/MM/yyyy', { locale: vi })}
            </span>
            {req.responded_at && (
              <span>
                Phản hồi {format(new Date(req.responded_at), 'HH:mm dd/MM', { locale: vi })}
              </span>
            )}
          </div>

          {req.status === 'pending' && (
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => handleApprove(req)}
                disabled={actingId === req.id}
                className="gap-1.5 flex-1"
              >
                <Check className="h-4 w-4" />
                Duyệt cho về sớm
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setRejectDialog(req); setRejectNote(''); }}
                disabled={actingId === req.id}
                className="gap-1.5"
              >
                <X className="h-4 w-4" />
                Từ chối
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Hourglass className="h-5 w-5 text-primary" />
            Yêu cầu xin về sớm
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Duyệt yêu cầu nhân viên xin checkout sớm hơn ca đăng ký.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading} className="gap-1.5 shrink-0">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="pending" className="gap-1.5">
            Chờ duyệt
            {pendingCount > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">Đã duyệt</TabsTrigger>
          <TabsTrigger value="rejected">Từ chối</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-3">
          {loading ? (
            <>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {tab === 'pending'
                  ? 'Không có yêu cầu nào đang chờ duyệt.'
                  : tab === 'approved'
                  ? 'Chưa có yêu cầu nào đã duyệt.'
                  : 'Chưa có yêu cầu nào bị từ chối.'}
              </CardContent>
            </Card>
          ) : (
            filtered.map(renderCard)
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!rejectDialog} onOpenChange={(v) => !v && setRejectDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Từ chối yêu cầu</DialogTitle>
            <DialogDescription>
              Từ chối yêu cầu xin về sớm của <span className="font-semibold text-foreground">{rejectDialog?.employee_name}</span>.
              Vui lòng ghi chú lý do (tùy chọn).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reject-note">Ghi chú</Label>
            <Textarea
              id="reject-note"
              placeholder="VD: Quán đang đông khách, cần ở lại đến hết ca..."
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)} disabled={!!actingId}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={!!actingId}>
              {actingId ? 'Đang xử lý…' : 'Xác nhận từ chối'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
