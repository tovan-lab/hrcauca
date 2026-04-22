import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Plus, Send, Check, X, MessageSquare, Inbox, Outdent, History, ArrowLeftRight } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SwapRequest {
  id: string;
  request_type: string;
  from_branch_id: string;
  to_branch_id: string;
  employee_id: string;
  shift_date: string;
  shift_id: string | null;
  start_time: string | null;
  end_time: string | null;
  shift_type: string | null;
  note: string;
  status: string;
  requested_by: string;
  responded_by: string | null;
  responded_at: string | null;
  response_note: string;
  created_at: string;
}

interface Branch { id: string; branch_name: string; }
interface Profile { user_id: string; name: string; branch_id: string | null; }
interface SwapMessage { id: string; request_id: string; sender_id: string; message: string; created_at: string; }

interface TransactionalEmailRequest {
  templateName: string;
  recipientEmail: string;
  idempotencyKey: string;
  templateData: Record<string, unknown>;
}

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Chờ duyệt', variant: 'secondary' },
  approved: { label: 'Đã duyệt', variant: 'default' },
  rejected: { label: 'Từ chối', variant: 'destructive' },
  cancelled: { label: 'Đã huỷ', variant: 'outline' },
};

const TYPE_LABEL: Record<string, string> = {
  support: 'Yêu cầu chi viện',
  swap: 'Đổi ca liên chi nhánh',
  transfer: 'Biệt phái 1 ca',
};

export function HRHub() {
  const { user } = useAuth();
  const userBranchId = (user as any)?.branch_id as string | null;
  const isAdmin = user?.role === 'ADMIN';
  const [searchParams, setSearchParams] = useSearchParams();

  const [requests, setRequests] = useState<SwapRequest[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeRequest, setActiveRequest] = useState<SwapRequest | null>(null);
  const [messages, setMessages] = useState<SwapMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');

  const invokeTransactionalEmail = useCallback(async (body: TransactionalEmailRequest) => {
    const result = await supabase.functions.invoke('send-transactional-email', { body });
    if (result.error) throw result.error;
    return result;
  }, []);

  // Create form state
  const [form, setForm] = useState({
    request_type: 'support',
    employee_id: '',
    to_branch_id: '',
    shift_date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '08:00',
    end_time: '17:00',
    note: '',
  });

  const branchById = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b.branch_name])), [branches]);
  const profileById = useMemo(() => Object.fromEntries(profiles.map((p) => [p.user_id, p])), [profiles]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: reqs }, { data: brs }, { data: profs }] = await Promise.all([
      supabase.from('shift_swap_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('branches').select('id, branch_name'),
      supabase.from('profiles').select('user_id, name, branch_id').eq('status', 'active'),
    ]);
    setRequests((reqs as SwapRequest[]) || []);
    setBranches((brs as Branch[]) || []);
    setProfiles((profs as Profile[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel('hr-hub-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_swap_requests' }, () => fetchAll())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  // Open dialog from notification deep-link
  useEffect(() => {
    const reqId = searchParams.get('req');
    if (reqId && requests.length > 0) {
      const r = requests.find((x) => x.id === reqId);
      if (r) setActiveRequest(r);
    }
  }, [searchParams, requests]);

  // Load messages when activeRequest changes
  useEffect(() => {
    if (!activeRequest) {
      setMessages([]);
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from('swap_request_messages')
        .select('*')
        .eq('request_id', activeRequest.id)
        .order('created_at');
      setMessages((data as SwapMessage[]) || []);
    };
    load();
    const ch = supabase
      .channel(`msg-${activeRequest.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'swap_request_messages', filter: `request_id=eq.${activeRequest.id}` },
        (payload) => setMessages((prev) => [...prev, payload.new as SwapMessage]),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [activeRequest]);

  // Phân loại nghiêm ngặt — KHÔNG trộn lẫn:
  //   • "đến" = chi nhánh mình NHẬN yêu cầu (to_branch_id == mình, from != mình)
  //   • "đi"  = chi nhánh mình GỬI đi      (from_branch_id == mình, to != mình)
  // Admin không có branch sẽ không có yêu cầu đến/đi cá nhân — xem tất cả ở "Lịch sử".
  const incoming = userBranchId
    ? requests.filter((r) => r.to_branch_id === userBranchId && r.from_branch_id !== userBranchId)
    : [];
  const outgoing = userBranchId
    ? requests.filter((r) => r.from_branch_id === userBranchId && r.to_branch_id !== userBranchId)
    : [];
  const pendingIncoming = incoming.filter((r) => r.status === 'pending');
  const myEmployees = profiles.filter((p) => p.branch_id === userBranchId);
  const otherBranches = branches.filter((b) => b.id !== userBranchId);

  const handleCreate = async () => {
    if (!form.employee_id || !form.to_branch_id || !form.shift_date) {
      toast.error('Vui lòng điền đầy đủ thông tin');
      return;
    }
    if (!userBranchId) {
      toast.error('Bạn chưa được gán chi nhánh');
      return;
    }
    const employee = profileById[form.employee_id];
    if (!employee || employee.branch_id !== userBranchId) {
      toast.error('Chỉ có thể yêu cầu cho nhân viên thuộc chi nhánh của bạn');
      return;
    }

    // Tự động tìm ca hiện có của nhân viên trong ngày đó để gắn vào request
    const { data: existingShift } = await supabase
      .from('shifts')
      .select('id, start_time, end_time, shift_type')
      .eq('user_id', form.employee_id)
      .eq('shift_date', form.shift_date)
      .maybeSingle();

    const { data, error } = await supabase
      .from('shift_swap_requests')
      .insert({
        request_type: form.request_type,
        from_branch_id: userBranchId,
        to_branch_id: form.to_branch_id,
        employee_id: form.employee_id,
        shift_date: form.shift_date,
        shift_id: existingShift?.id ?? null,
        start_time: existingShift?.start_time ?? form.start_time + ':00',
        end_time: existingShift?.end_time ?? form.end_time + ':00',
        shift_type: existingShift?.shift_type ?? 'FULL_TIME_8H',
        note: form.note,
        requested_by: user!.id,
      })
      .select()
      .single();

    if (error) {
      toast.error('Lỗi: ' + error.message);
      return;
    }

    // Notify all HR/Admin in target branch
    const { data: targetHR } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('branch_id', form.to_branch_id);
    if (targetHR) {
      const notifs = targetHR.map((p) => ({
        user_id: p.user_id,
        type: 'swap_request_new',
        title: `Yêu cầu mới từ ${branchById[userBranchId] ?? 'chi nhánh khác'}`,
        body: `${TYPE_LABEL[form.request_type]} – NV ${employee.name} – ngày ${format(new Date(form.shift_date), 'dd/MM/yyyy')}`,
        related_id: data.id,
      }));
      // Filter to HR/Admin only via separate check
      const userIds = notifs.map((n) => n.user_id);
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds)
        .in('role', ['HR', 'ADMIN']);
      const allowed = new Set((roles || []).map((r: any) => r.user_id));
      const filtered = notifs.filter((n) => allowed.has(n.user_id));
      if (filtered.length > 0) {
        await supabase.from('hr_notifications').insert(filtered);
      }
    }

    toast.success('Đã gửi yêu cầu');
    setCreateOpen(false);
    setForm({
      request_type: 'support',
      employee_id: '',
      to_branch_id: '',
      shift_date: format(new Date(), 'yyyy-MM-dd'),
      start_time: '08:00',
      end_time: '17:00',
      note: '',
    });
  };

  const handleRespond = async (req: SwapRequest, status: 'approved' | 'rejected', responseNote = '') => {
    const { error } = await supabase
      .from('shift_swap_requests')
      .update({
        status,
        responded_by: user!.id,
        response_note: responseNote,
      })
      .eq('id', req.id);

    if (error) {
      toast.error('Lỗi: ' + error.message);
      return;
    }

    // Notify requester
    await supabase.from('hr_notifications').insert({
      user_id: req.requested_by,
      type: status === 'approved' ? 'swap_request_approved' : 'swap_request_rejected',
      title: status === 'approved' ? 'Yêu cầu được duyệt' : 'Yêu cầu bị từ chối',
      body: `${TYPE_LABEL[req.request_type]} – ${branchById[req.to_branch_id]} – ngày ${format(new Date(req.shift_date), 'dd/MM/yyyy')}`,
      related_id: req.id,
    });

    // Auto-send email to employee when support request is approved
    if (status === 'approved') {
      const employee = profiles.find((p) => p.user_id === req.employee_id);
      const { data: empProfile } = await supabase
        .from('profiles')
        .select('email, name')
        .eq('user_id', req.employee_id)
        .maybeSingle();
      if (empProfile?.email) {
        const [y, m, d] = req.shift_date.split('-');
        const startHHMM = (req.start_time || '08:00').slice(0, 5);
        const endHHMM = (req.end_time || '17:00').slice(0, 5);
        invokeTransactionalEmail({
          templateName: 'shift-support-approved',
          recipientEmail: empProfile.email,
          idempotencyKey: `support-approved-${req.id}`,
          templateData: {
            name: empProfile.name || employee?.name || '',
            shiftDate: `${d}/${m}/${y}`,
            startTime: startHHMM,
            endTime: endHHMM,
            fromBranch: branchById[req.from_branch_id] || '',
            toBranch: branchById[req.to_branch_id] || '',
            approvedBy: user?.name || 'HR chi nhánh đến',
            note: req.note || undefined,
          },
        }).catch((emailErr) => {
          console.warn('Shift support approval email failed:', emailErr);
        });
      }
    }

    toast.success(status === 'approved' ? 'Đã duyệt yêu cầu & gửi email cho nhân viên' : 'Đã từ chối yêu cầu');
    if (activeRequest?.id === req.id) {
      setActiveRequest({ ...req, status, responded_by: user!.id, response_note: responseNote });
    }
  };

  const handleCancel = async (req: SwapRequest) => {
    const { error } = await supabase
      .from('shift_swap_requests')
      .update({ status: 'cancelled' })
      .eq('id', req.id);
    if (error) {
      toast.error('Lỗi: ' + error.message);
      return;
    }
    toast.success('Đã huỷ yêu cầu');
  };

  const handleSendMessage = async () => {
    if (!activeRequest || !newMessage.trim()) return;
    const { error } = await supabase.from('swap_request_messages').insert({
      request_id: activeRequest.id,
      sender_id: user!.id,
      message: newMessage.trim(),
    });
    if (error) {
      toast.error('Lỗi: ' + error.message);
      return;
    }
    // Notify the other party
    const otherUserId =
      activeRequest.requested_by === user!.id
        ? null // notify all HR of to_branch
        : activeRequest.requested_by;
    if (otherUserId) {
      await supabase.from('hr_notifications').insert({
        user_id: otherUserId,
        type: 'swap_request_message',
        title: 'Tin nhắn mới về yêu cầu',
        body: newMessage.trim().slice(0, 100),
        related_id: activeRequest.id,
      });
    }
    setNewMessage('');
  };

  const RequestCard = ({ req, role }: { req: SwapRequest; role: 'incoming' | 'outgoing' }) => {
    const employee = profileById[req.employee_id];
    const status = STATUS_LABEL[req.status] || STATUS_LABEL.pending;
    return (
      <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setActiveRequest(req)}>
        <CardContent className="py-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">{branchById[req.from_branch_id] ?? '—'}</span>
              <ArrowRight className="h-3 w-3" />
              <span className="font-medium">{branchById[req.to_branch_id] ?? '—'}</span>
            </div>
            <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{employee?.name ?? 'Không rõ'}</p>
            <p className="text-xs text-muted-foreground">{format(new Date(req.shift_date), 'dd/MM/yyyy', { locale: vi })}</p>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{TYPE_LABEL[req.request_type]}</span>
            {req.start_time && req.end_time && (
              <span className="text-muted-foreground tabular-nums">
                {req.start_time.slice(0, 5)}–{req.end_time.slice(0, 5)}
              </span>
            )}
          </div>
          {req.note && <p className="text-xs text-muted-foreground line-clamp-1 italic">"{req.note}"</p>}
          {role === 'incoming' && req.status === 'pending' && (
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRespond(req, 'approved');
                }}
              >
                <Check className="h-3 w-3 mr-1" /> Duyệt
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRespond(req, 'rejected');
                }}
              >
                <X className="h-3 w-3 mr-1" /> Từ chối
              </Button>
            </div>
          )}
          {role === 'outgoing' && req.status === 'pending' && (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                handleCancel(req);
              }}
            >
              Huỷ yêu cầu
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderList = (list: SwapRequest[], role: 'incoming' | 'outgoing') => {
    if (loading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
    if (list.length === 0) return <p className="text-sm text-muted-foreground text-center py-12">Không có yêu cầu nào</p>;
    return <div className="space-y-2">{list.map((r) => <RequestCard key={r.id} req={r} role={role} />)}</div>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" /> Cổng liên kết HR
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Yêu cầu chi viện & đổi ca giữa các chi nhánh
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Tạo yêu cầu
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tạo yêu cầu chi viện / đổi ca</DialogTitle>
              <DialogDescription>
                Yêu cầu sẽ được gửi đến HR của chi nhánh đích để duyệt.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Loại yêu cầu</Label>
                <Select value={form.request_type} onValueChange={(v) => setForm({ ...form, request_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="support">Yêu cầu chi viện</SelectItem>
                    <SelectItem value="transfer">Biệt phái 1 ca</SelectItem>
                    <SelectItem value="swap">Đổi ca liên chi nhánh</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Nhân viên (thuộc chi nhánh của bạn)</Label>
                <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Chọn nhân viên" /></SelectTrigger>
                  <SelectContent>
                    {myEmployees.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Đến chi nhánh</Label>
                <Select value={form.to_branch_id} onValueChange={(v) => setForm({ ...form, to_branch_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Chọn chi nhánh đích" /></SelectTrigger>
                  <SelectContent>
                    {otherBranches.map((b) => <SelectItem key={b.id} value={b.id}>{b.branch_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label>Ngày</Label>
                  <Input type="date" value={form.shift_date} onChange={(e) => setForm({ ...form, shift_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Giờ bắt đầu</Label>
                  <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Giờ kết thúc</Label>
                  <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Ghi chú</Label>
                <Textarea
                  rows={3}
                  placeholder="VD: Bạn này làm trễ 30p nhé, đứng quầy bar chính..."
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Huỷ</Button>
              <Button onClick={handleCreate}>Gửi yêu cầu</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="incoming">
        <TabsList>
          <TabsTrigger value="incoming">
            <Inbox className="h-4 w-4 mr-1" /> Yêu cầu đến
            {pendingIncoming.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-4 px-1.5 text-[10px]">{pendingIncoming.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="outgoing">
            <Outdent className="h-4 w-4 mr-1" /> Yêu cầu đi
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-1" /> Lịch sử
          </TabsTrigger>
        </TabsList>
        <TabsContent value="incoming" className="mt-4">
          {renderList(incoming, 'incoming')}
        </TabsContent>
        <TabsContent value="outgoing" className="mt-4">
          {renderList(outgoing, 'outgoing')}
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          {renderList(
            (isAdmin ? requests : [...incoming, ...outgoing]).filter((r) => r.status !== 'pending'),
            'incoming',
          )}
        </TabsContent>
      </Tabs>

      {/* Detail dialog */}
      <Dialog open={!!activeRequest} onOpenChange={(o) => { if (!o) { setActiveRequest(null); setSearchParams({}); } }}>
        <DialogContent className="max-w-lg">
          {activeRequest && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {TYPE_LABEL[activeRequest.request_type]}
                  <Badge variant={(STATUS_LABEL[activeRequest.status] || STATUS_LABEL.pending).variant} className="text-xs">
                    {(STATUS_LABEL[activeRequest.status] || STATUS_LABEL.pending).label}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2 text-xs">
                  <span>{branchById[activeRequest.from_branch_id]}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span>{branchById[activeRequest.to_branch_id]}</span>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">Nhân viên:</span> <span className="font-semibold">{profileById[activeRequest.employee_id]?.name}</span></p>
                <p>
                  <span className="text-muted-foreground">Ngày:</span>{' '}
                  {format(new Date(activeRequest.shift_date), 'EEEE, dd/MM/yyyy', { locale: vi })}
                </p>
                {activeRequest.start_time && activeRequest.end_time && (
                  <p>
                    <span className="text-muted-foreground">Giờ:</span>{' '}
                    {activeRequest.start_time.slice(0, 5)} – {activeRequest.end_time.slice(0, 5)}
                  </p>
                )}
                {activeRequest.note && (
                  <div className="rounded-md bg-muted p-3 text-sm italic">"{activeRequest.note}"</div>
                )}
              </div>

              {/* Chat */}
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> Trao đổi
                </p>
                <ScrollArea className="h-40 rounded border p-2">
                  {messages.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Chưa có tin nhắn</p>
                  ) : (
                    <div className="space-y-2">
                      {messages.map((m) => (
                        <div
                          key={m.id}
                          className={cn('text-xs rounded px-2 py-1.5', m.sender_id === user?.id ? 'bg-primary/10 ml-8' : 'bg-muted mr-8')}
                        >
                          <p>{m.message}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {format(new Date(m.created_at), 'HH:mm dd/MM')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                <div className="flex gap-1.5 mt-2">
                  <Input
                    placeholder="Nhập tin nhắn..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
                  />
                  <Button size="icon" onClick={handleSendMessage} disabled={!newMessage.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {activeRequest.status === 'pending' && activeRequest.to_branch_id === userBranchId && (
                <DialogFooter>
                  <Button variant="outline" onClick={() => handleRespond(activeRequest, 'rejected')}>
                    <X className="h-4 w-4 mr-1" /> Từ chối
                  </Button>
                  <Button onClick={() => handleRespond(activeRequest, 'approved')}>
                    <Check className="h-4 w-4 mr-1" /> Duyệt
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
