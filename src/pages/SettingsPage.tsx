import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { LogOut, Mail, Shield, Building, Lock, Camera, Loader2, Eye, EyeOff, User as UserIcon, Pencil, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FeedbackInbox } from '@/components/FeedbackInbox';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { user, logout, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) {
      toast.error('Tên không được để trống');
      return;
    }
    if (trimmed.length > 60) {
      toast.error('Tên không được vượt quá 60 ký tự');
      return;
    }
    if (!user) return;
    if (trimmed === user.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    const { error } = await supabase
      .from('profiles')
      .update({ name: trimmed })
      .eq('user_id', user.id);
    if (error) {
      toast.error('Lỗi cập nhật tên: ' + error.message);
    } else {
      toast.success('Cập nhật tên thành công');
      await refreshProfile();
      setEditingName(false);
    }
    setSavingName(false);
  };

  const startEditName = () => {
    setNameValue(user?.name || '');
    setEditingName(true);
  };

  const cancelEditName = () => {
    setNameValue(user?.name || '');
    setEditingName(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Mật khẩu xác nhận không khớp');
      return;
    }
    setChangingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Đổi mật khẩu thành công');
      setNewPassword('');
      setConfirmPassword('');
    }
    setChangingPw(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn file ảnh');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Ảnh không được vượt quá 2MB');
      return;
    }

    setUploadingAvatar(true);
    const ext = file.name.split('.').pop();
    const filePath = `avatars/${user.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('checkin-images')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast.error('Lỗi tải ảnh: ' + uploadError.message);
      setUploadingAvatar(false);
      return;
    }

    // Use signed URL since bucket is private
    const { data: signedData } = await supabase.storage
      .from('checkin-images')
      .createSignedUrl(filePath, 3600); // 1 hour for avatars

    const avatarUrl = signedData?.signedUrl || filePath;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('user_id', user.id);

    if (updateError) {
      toast.error('Lỗi cập nhật: ' + updateError.message);
    } else {
      toast.success('Cập nhật ảnh đại diện thành công');
      await refreshProfile();
    }
    setUploadingAvatar(false);
  };

  const roleLabel = (r?: string) => {
    switch (r) { case 'ADMIN': return 'HR'; case 'HR': return 'Quản lý'; case 'IT': return 'IT'; default: return 'Nhân viên'; }
  };

  if (!user) return null;

  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2);
  const isAdminOrHR = user.role === 'ADMIN' || user.role === 'HR';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Cài đặt</h2>
        <p className="text-sm text-muted-foreground mt-1">Quản lý tài khoản của bạn</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">Thông tin cá nhân</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Avatar className="h-16 w-16">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    placeholder="Nhập tên hiển thị"
                    maxLength={60}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') cancelEditName();
                    }}
                    className="h-9"
                  />
                  <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={handleSaveName} disabled={savingName}>
                    {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-primary" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={cancelEditName} disabled={savingName}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold text-foreground truncate">{user.name}</p>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={startEditName}>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              )}
              <Badge variant={user.role === 'ADMIN' ? 'destructive' : user.role === 'HR' ? 'default' : user.role === 'IT' ? 'outline' : 'secondary'} className="text-xs mt-1">
                {roleLabel(user.role)}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">Nhấn ảnh để đổi ảnh đại diện · biểu tượng bút để đổi tên</p>
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Email:</span>
              <span className="text-foreground font-medium">{user.email}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Vai trò:</span>
              <span className="text-foreground font-medium">{roleLabel(user.role)}</span>
            </div>
            {user.branch_name && (
              <div className="flex items-center gap-3 text-sm">
                <Building className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Chi nhánh:</span>
                <span className="text-foreground font-medium">{user.branch_name}</span>
              </div>
            )}
            {user.department && (
              <div className="flex items-center gap-3 text-sm">
                <Building className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Phòng ban:</span>
                <span className="text-foreground font-medium">{user.department}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Lock className="h-4 w-4" /> Đổi mật khẩu
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Mật khẩu mới</Label>
            <div className="relative">
              <Input type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" minLength={6} className="pr-10" />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowNewPw(v => !v)} tabIndex={-1}>
                {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Xác nhận mật khẩu</Label>
            <div className="relative">
              <Input type={showConfirmPw ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" className="pr-10" />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowConfirmPw(v => !v)} tabIndex={-1}>
                {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button onClick={handleChangePassword} disabled={changingPw} className="w-full">
            {changingPw ? 'Đang đổi...' : 'Đổi mật khẩu'}
          </Button>
        </CardContent>
      </Card>

      {isAdminOrHR && <FeedbackInbox />}

      <Button variant="destructive" className="w-full" onClick={handleLogout}>
        <LogOut className="h-4 w-4 mr-2" /> Đăng xuất
      </Button>
    </div>
  );
}
