import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { UserPlus, Search, Shield, CheckCircle, XCircle, UserCheck, Trash2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface EmployeeRow {
  user_id: string;
  name: string;
  email: string;
  department: string | null;
  avatar_url: string | null;
  role: string;
  status: string;
  branch_id: string | null;
  branch_name?: string;
  is_active: boolean;
}

interface TransactionalEmailRequest {
  templateName: string;
  recipientEmail: string;
  idempotencyKey: string;
  templateData: Record<string, unknown>;
}


export default function EmployeesPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [branches, setBranches] = useState<{ id: string; branch_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('EMPLOYEE');
  const [newPassword, setNewPassword] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [creating, setCreating] = useState(false);

  const isHR = user?.role === 'HR';
  const userBranchId = (user as any)?.branch_id;
  const isITUser = (employee: Pick<EmployeeRow, 'role'>) => employee.role === 'IT';

  const invokeTransactionalEmail = useCallback(async (body: TransactionalEmailRequest) => {
    const result = await supabase.functions.invoke('send-transactional-email', { body });
    if (result.error) throw result.error;
    return result;
  }, []);

  const fetchEmployees = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }, { data: branchList }] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('user_roles').select('*'),
      supabase.from('branches').select('id, branch_name'),
    ]);

    const branchMap: Record<string, string> = {};
    if (branchList) {
      setBranches(branchList as any);
      branchList.forEach((b: any) => { branchMap[b.id] = b.branch_name; });
    }

    if (profiles && roles) {
      let mapped: EmployeeRow[] = profiles.map(p => {
        const r = roles.find(r => r.user_id === p.user_id);
        const branchId = (p as any).branch_id;
        return {
          user_id: p.user_id,
          name: p.name,
          email: p.email,
          department: p.department,
          avatar_url: p.avatar_url,
          role: r?.role || 'EMPLOYEE',
          status: (p as any).status || 'pending',
          branch_id: branchId || null,
          branch_name: branchId ? branchMap[branchId] : undefined,
          is_active: (p as any).is_active !== false,
        };
      });
      // HR can only see employees from their own branch
      if (isHR && userBranchId) {
        mapped = mapped.filter(e => e.branch_id === userBranchId);
      }
      setEmployees(mapped);
    }
    setLoading(false);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const pendingUsers = useMemo(() => employees.filter(e => e.status === 'pending'), [employees]);
  const activeUsers = useMemo(() => {
    let result = employees.filter(e => e.status !== 'pending');
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e => e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
    }
    if (roleFilter !== 'all') {
      result = result.filter(e => e.role === roleFilter);
    }
    if (branchFilter !== 'all') {
      result = result.filter(e => e.branch_id === branchFilter);
    }
    return result;
  }, [employees, search, roleFilter, branchFilter]);

  const handleApprove = async (userId: string) => {
    const { error } = await supabase.from('profiles')
      .update({ status: 'active' } as any)
      .eq('user_id', userId);
    if (error) {
      toast.error('Không thể phê duyệt');
      return;
    }
    toast.success('Đã phê duyệt tài khoản');
    fetchEmployees();
  };

  const handleDeactivate = async (userId: string) => {
    const employee = employees.find((item) => item.user_id === userId);
    if (employee && isITUser(employee)) {
      toast.error('Không thể vô hiệu hóa tài khoản IT');
      return;
    }
    const { error } = await supabase.from('profiles')
      .update({ status: 'inactive', is_active: false } as any)
      .eq('user_id', userId);
    if (error) {
      toast.error('Không thể vô hiệu hóa');
      return;
    }
    toast.success('Đã khóa tài khoản');
    fetchEmployees();
  };

  const handleActivate = async (userId: string) => {
    const employee = employees.find((item) => item.user_id === userId);
    if (employee && isITUser(employee)) {
      toast.error('Không thể chỉnh sửa trạng thái tài khoản IT');
      return;
    }
    const { error } = await supabase.from('profiles')
      .update({ status: 'active', is_active: true } as any)
      .eq('user_id', userId);
    if (error) {
      toast.error('Không thể kích hoạt');
      return;
    }
    toast.success('Đã kích hoạt tài khoản');
    fetchEmployees();
  };

  const handleCreate = async () => {
    if (!newEmail || !newName || !newPassword) {
      toast.error('Vui lòng điền đầy đủ thông tin');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trimmedEmail = newEmail.trim().toLowerCase();
    if (!emailRegex.test(trimmedEmail)) {
      toast.error('Email không hợp lệ. Vui lòng kiểm tra lại (ví dụ: name@gmail.com)');
      return;
    }
    // Common typo detection
    const commonTypos: Record<string, string> = {
      'gamil.com': 'gmail.com',
      'gmial.com': 'gmail.com',
      'gmai.com': 'gmail.com',
      'gnail.com': 'gmail.com',
      'yaho.com': 'yahoo.com',
      'hotmial.com': 'hotmail.com',
    };
    const domain = trimmedEmail.split('@')[1];
    if (commonTypos[domain]) {
      toast.error(`Email có vẻ sai chính tả. Bạn có ý là "@${commonTypos[domain]}" không?`);
      return;
    }

    setCreating(true);

    // Check if email already exists in profiles
    const { data: existing } = await supabase
      .from('profiles')
      .select('user_id, status, name')
      .eq('email', trimmedEmail)
      .maybeSingle();

    if (existing) {
      toast.error(`Email "${trimmedEmail}" đã được đăng ký bởi nhân viên "${existing.name}" (trạng thái: ${existing.status === 'pending' ? 'chờ duyệt' : existing.status}). Vui lòng dùng email khác hoặc gửi lại email xác nhận.`);
      setCreating(false);
      return;
    }

    const adminCreateResult = await supabase.functions.invoke('admin-create-user', {
      body: {
        email: trimmedEmail,
        password: newPassword,
        name: newName,
        role: newRole,
        branch_id: newRole === 'IT' ? null : newBranch && newBranch !== 'none' ? newBranch : null,
      },
    });

    if (adminCreateResult.error) {
      toast.error(adminCreateResult.error.message);
      setCreating(false);
      return;
    }

    if ((adminCreateResult.data as any)?.error) {
      toast.error((adminCreateResult.data as any).error);
      setCreating(false);
      return;
    }

    await fetchEmployees();

    toast.success(`Đã tạo nhân viên "${newName}" — có thể đăng nhập ngay với email & mật khẩu vừa cấp.`);
    setDialogOpen(false);
    setNewEmail('');
    setNewName('');
    setNewPassword('');
    setNewRole('EMPLOYEE');
    setNewBranch('');
    setCreating(false);
    return;

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: newPassword,
      options: { data: { name: newName } },
    });

    if (error) {
      // Detect repeat-signup case (email exists in auth but no profile)
      if (error.message.toLowerCase().includes('registered') || error.message.toLowerCase().includes('already')) {
        toast.error('Email này đã tồn tại trong hệ thống xác thực nhưng chưa có hồ sơ (user mồ côi).', {
          duration: 10000,
          action: {
            label: 'Dọn & thử lại',
            onClick: async () => {
              await handleCleanupOrphanEmail(trimmedEmail);
            },
          },
        });
      } else {
        toast.error(error.message);
      }
      setCreating(false);
      return;
    }

    if (!data.user) {
      toast.error('Không thể tạo tài khoản — không nhận được phản hồi từ hệ thống.');
      setCreating(false);
      return;
    }

    // Detect "user_repeated_signup" (Supabase returns 200 with user but identities=[])
    const identities = (data.user as any).identities;
    if (Array.isArray(identities) && identities.length === 0) {
      toast.error(`Email "${trimmedEmail}" đã được đăng ký trước đó (user mồ côi).`, {
        duration: 10000,
        action: {
          label: 'Dọn & thử lại',
          onClick: async () => {
            await handleCleanupOrphanEmail(trimmedEmail);
          },
        },
      });
      setCreating(false);
      return;
    }

    if (newRole !== 'EMPLOYEE') {
      await supabase.from('user_roles')
        .update({ role: newRole as any })
        .eq('user_id', data.user.id);
    }

    // Auto-approve and assign branch when created by admin/HR
    setTimeout(async () => {
      const updateData: any = { status: 'active', is_active: true };
      if (newBranch && newBranch !== 'none') updateData.branch_id = newBranch;
      await supabase.from('profiles')
        .update(updateData)
        .eq('user_id', data.user!.id);
      fetchEmployees();
    }, 1000);

    toast.success(`Đã tạo nhân viên "${newName}" — có thể đăng nhập ngay với email & mật khẩu vừa cấp.`);
    setDialogOpen(false);
    setNewEmail('');
    setNewName('');
    setNewPassword('');
    setNewRole('EMPLOYEE');
    setNewBranch('');
    setCreating(false);
  };

  const handleResendConfirmation = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });
    if (error) {
      toast.error('Không thể gửi lại email xác nhận: ' + error.message);
      return;
    }
    toast.success(`Đã gửi lại email xác nhận tới ${email}`);
  };

  const handleChangeBranch = async (userId: string, branchId: string) => {
    const newBranchId = branchId === 'none' ? null : branchId;
    const emp = employees.find((e) => e.user_id === userId);
    if (emp && isITUser(emp)) {
      toast.error('Không thể đổi chi nhánh cho tài khoản IT');
      return;
    }
    const oldBranchId = emp?.branch_id ?? null;

    // Skip if no actual change
    if (oldBranchId === newBranchId) return;

    const { error } = await supabase.from('profiles')
      .update({ branch_id: newBranchId } as any)
      .eq('user_id', userId);
    if (error) {
      toast.error('Không thể đổi chi nhánh: ' + error.message);
      return;
    }

    // Auto-send email notification to employee about branch change
    if (emp?.email) {
      const branchMap = new Map(branches.map((b) => [b.id, b.branch_name]));
      const fromName = oldBranchId ? branchMap.get(oldBranchId) || '— (chưa có)' : '— (chưa có)';
      const toName = newBranchId ? branchMap.get(newBranchId) || '— (đã gỡ)' : '— (đã gỡ)';
      const today = new Date();
      const effectiveDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
      // Idempotency: 1 email per change event (timestamp-based, allows multiple changes/day)
      const idemKey = `branch-changed-${userId}-${oldBranchId ?? 'none'}-${newBranchId ?? 'none'}-${Date.now()}`;
      invokeTransactionalEmail({
        templateName: 'branch-changed',
        recipientEmail: emp.email,
        idempotencyKey: idemKey,
        templateData: {
          name: emp.name,
          fromBranch: fromName,
          toBranch: toName,
          changedBy: user?.name || (isHR ? 'HR' : 'Quản trị viên'),
          effectiveDate,
        },
      }).catch((emailErr) => {
        console.warn('Branch change email failed:', emailErr);
      });
    }

    toast.success('Đã đổi chi nhánh & gửi email thông báo');
    fetchEmployees();
  };

  const handleChangeRole = async (userId: string, role: string) => {
    const emp = employees.find((item) => item.user_id === userId);
    if (role === 'IT' || (emp && isITUser(emp))) {
      toast.error('Không thể chỉnh sửa quyền IT');
      return;
    }
    const { error } = await supabase.from('user_roles')
      .update({ role: role as any })
      .eq('user_id', userId);
    if (error) {
      toast.error('Không thể thay đổi vai trò');
      return;
    }
    toast.success('Đã cập nhật vai trò');
    fetchEmployees();
  };

  const handleDeleteEmployee = async (userId: string, empName: string) => {
    const emp = employees.find((item) => item.user_id === userId);
    if (emp && isITUser(emp)) {
      toast.error('Không thể xóa tài khoản IT');
      return;
    }
    // Gọi edge function: xóa cả auth.users + dữ liệu liên quan + profile
    const { data, error } = await supabase.functions.invoke('admin-delete-user', {
      body: { user_id: userId },
    });
    if (error || (data as any)?.error) {
      const msg = (data as any)?.error || error?.message || 'Lỗi không xác định';
      toast.error('Không thể xóa nhân viên: ' + msg);
      return;
    }
    toast.success(`Đã xóa nhân viên "${empName}" (gồm cả tài khoản đăng nhập)`);
    fetchEmployees();
  };

  const handleCleanupOrphanEmail = async (email: string) => {
    const { data, error } = await supabase.functions.invoke('admin-delete-user', {
      body: { email },
    });
    if (error || (data as any)?.error) {
      const msg = (data as any)?.error || error?.message || 'Lỗi không xác định';
      toast.error('Dọn email thất bại: ' + msg);
      return;
    }
    toast.success(`Đã dọn email "${email}". Giờ bạn có thể thêm lại nhân viên.`);
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: string; name: string } | null>(null);

  const isAdmin = user?.role === 'ADMIN';
  const canManage = user?.role === 'ADMIN' || user?.role === 'HR';
  const canApprove = canManage;

  const roleLabel = (r: string) => {
    switch (r) { case 'ADMIN': return 'HR'; case 'HR': return 'Quản lý'; default: return 'Nhân viên'; }
  };
  const roleBadgeVariant = (r: string) => {
    switch (r) { case 'ADMIN': return 'destructive' as const; case 'HR': return 'default' as const; default: return 'secondary' as const; }
  };
  const displayRoleLabel = (r: string) => (r === 'IT' ? 'IT' : roleLabel(r));
  const displayRoleBadgeVariant = (r: string) => (r === 'IT' ? 'outline' as const : roleBadgeVariant(r));
  const statusBadge = (s: string) => {
    switch (s) {
      case 'active': return <Badge variant="default" className="text-xs">Hoạt động</Badge>;
      case 'inactive': return <Badge variant="secondary" className="text-xs">Vô hiệu</Badge>;
      default: return <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">Chờ duyệt</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Nhân viên</h2>
          <p className="text-sm text-muted-foreground mt-1">Quản lý danh sách nhân viên & phê duyệt tài khoản</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><UserPlus className="h-4 w-4 mr-2" /> Thêm nhân viên mới</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Thêm nhân viên mới</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Họ tên</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nguyễn Văn A" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@company.com" />
              </div>
              <div className="space-y-2">
                <Label>Mật khẩu</Label>
                <div className="relative">
                  <Input type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" minLength={6} className="pr-10" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowNewPassword(v => !v)} tabIndex={-1}>
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Vai trò</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPLOYEE">Nhân viên</SelectItem>
                    <SelectItem value="HR">Quản lý</SelectItem>
                    {isAdmin && <SelectItem value="ADMIN">HR</SelectItem>}
                    {isAdmin && <SelectItem value="IT">IT</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Chi nhánh</Label>
                <Select value={newBranch} onValueChange={setNewBranch}>
                  <SelectTrigger><SelectValue placeholder="Chọn chi nhánh" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Không chọn</SelectItem>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.branch_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={handleCreate} disabled={creating}>
                {creating ? 'Đang tạo...' : 'Tạo tài khoản'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue={pendingUsers.length > 0 ? 'pending' : 'active'}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5">
            <UserCheck className="h-3.5 w-3.5" />
            Chờ duyệt
            {pendingUsers.length > 0 && (
              <Badge variant="destructive" className="text-xs ml-1 h-5 px-1.5">{pendingUsers.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="active">Tất cả nhân viên</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Họ tên</TableHead>
                      <TableHead className="text-xs">Email</TableHead>
                      <TableHead className="text-xs">Vai trò</TableHead>
                      {canApprove && <TableHead className="text-xs text-right">Hành động</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-32 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : pendingUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          Không có tài khoản nào chờ duyệt
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingUsers.map(emp => (
                        <TableRow key={emp.user_id}>
                          <TableCell className="font-medium text-sm">{emp.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{emp.email}</TableCell>
                          <TableCell>
                            {isAdmin && !isITUser(emp) ? (
                              <Select value={emp.role} onValueChange={v => handleChangeRole(emp.user_id, v)}>
                                <SelectTrigger className="w-28 h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="EMPLOYEE">Nhân viên</SelectItem>
                                  <SelectItem value="HR">Quản lý</SelectItem>
                                  <SelectItem value="ADMIN">HR</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant={displayRoleBadgeVariant(emp.role)} className="text-xs">{displayRoleLabel(emp.role)}</Badge>
                            )}
                          </TableCell>
                          {canApprove && (
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end flex-wrap">
                                <Button size="sm" className="h-7 text-xs" onClick={() => handleApprove(emp.user_id)}>
                                  <CheckCircle className="h-3 w-3 mr-1" /> Phê duyệt
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleResendConfirmation(emp.email)}>
                                  Gửi lại email
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={() => handleDeactivate(emp.user_id)}>
                                  <XCircle className="h-3 w-3 mr-1" /> Từ chối
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-10" placeholder="Tìm theo tên hoặc email..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Lọc vai trò" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="EMPLOYEE">Nhân viên</SelectItem>
                <SelectItem value="HR">Quản lý</SelectItem>
                <SelectItem value="ADMIN">HR</SelectItem>
                <SelectItem value="IT">IT</SelectItem>
              </SelectContent>
            </Select>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Lọc chi nhánh" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả chi nhánh</SelectItem>
                {branches.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.branch_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Họ tên</TableHead>
                      <TableHead className="text-xs">Email</TableHead>
                      <TableHead className="text-xs">Chi nhánh</TableHead>
                      <TableHead className="text-xs">Vai trò</TableHead>
                      <TableHead className="text-xs">Trạng thái</TableHead>
                      {canManage && <TableHead className="text-xs text-right">Hành động</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                           {canManage && <TableCell><Skeleton className="h-8 w-24 ml-auto" /></TableCell>}
                        </TableRow>
                      ))
                    ) : activeUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={canManage ? 6 : 5} className="text-center text-muted-foreground py-8">
                          Không tìm thấy nhân viên nào
                        </TableCell>
                      </TableRow>
                    ) : (
                      activeUsers.map(emp => (
                        <TableRow key={emp.user_id}>
                          <TableCell className="font-medium text-sm">{emp.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{emp.email}</TableCell>
                          <TableCell>
                            {canManage && !isITUser(emp) ? (
                              <div className="w-36">
                                <Select value={emp.branch_id ?? 'none'} onValueChange={v => handleChangeBranch(emp.user_id, v)}>
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue placeholder="Chọn chi nhánh" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">— Chưa gán —</SelectItem>
                                    {branches.map(b => (
                                      <SelectItem key={b.id} value={b.id}>{b.branch_name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">{emp.branch_name || '—'}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={displayRoleBadgeVariant(emp.role)} className="text-xs">{displayRoleLabel(emp.role)}</Badge>
                          </TableCell>
                          <TableCell>{statusBadge(emp.status)}</TableCell>
                          {canManage && (
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end items-center">
                                {isAdmin && !isITUser(emp) && (
                                  <Select value={emp.role} onValueChange={v => handleChangeRole(emp.user_id, v)}>
                                    <SelectTrigger className="w-28 h-7 text-xs">
                                      <Shield className="h-3 w-3 mr-1" />
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="EMPLOYEE">Nhân viên</SelectItem>
                                      <SelectItem value="HR">Quản lý</SelectItem>
                                      <SelectItem value="ADMIN">HR</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                                {!isITUser(emp) && emp.status === 'active' ? (
                                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => handleDeactivate(emp.user_id)}>
                                    Vô hiệu
                                  </Button>
                                ) : !isITUser(emp) ? (
                                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleActivate(emp.user_id)}>
                                    Kích hoạt
                                  </Button>
                                ) : null}
                                {/* Delete button - Admin can delete all, HR can delete branch employees */}
                                {emp.user_id !== user?.id && !isITUser(emp) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-destructive hover:text-destructive"
                                    onClick={() => setDeleteConfirm({ userId: emp.user_id, name: emp.name })}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa nhân viên</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa nhân viên <strong>{deleteConfirm?.name}</strong>? 
              Tất cả dữ liệu liên quan (chấm công, ca làm, đánh giá, phản hồi) sẽ bị xóa vĩnh viễn và không thể khôi phục.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirm) {
                  handleDeleteEmployee(deleteConfirm.userId, deleteConfirm.name);
                  setDeleteConfirm(null);
                }
              }}
            >
              Xóa nhân viên
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
