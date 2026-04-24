import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  RefreshCcw,
  ServerCog,
  ShieldAlert,
  Wrench,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

type DeviceStatus = 'online' | 'offline';

interface DeviceItem {
  id: string;
  name: string;
  status: DeviceStatus;
}

const defaultDevices: DeviceItem[] = [
  { id: 'dbp-fp', name: 'Máy vân tay Chi nhánh ĐBP - Trực tuyến', status: 'online' },
  { id: 'cc-face', name: 'Máy FaceID Chi nhánh Cc - Ngoại tuyến', status: 'offline' },
  { id: 'nvt-face', name: 'Máy FaceID Chi nhánh NVT - Trực tuyến', status: 'online' },
];

function StatusDot({ status }: { status: DeviceStatus }) {
  return (
    <span
      className={cn(
        'inline-flex h-2.5 w-2.5 rounded-full',
        status === 'online' ? 'bg-emerald-500' : 'bg-red-500',
      )}
    />
  );
}

export default function SystemSettingsPage() {
  const location = useLocation();
  const { user } = useAuth();
  const focusSection = location.pathname === '/api-management' ? 'api' : 'system';
  const isIT = user?.role === 'IT';
  const canManageApi = user?.role === 'IT' || user?.role === 'HR';

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [checkinImageLimitMb, setCheckinImageLimitMb] = useState('2');
  const [sessionTimeoutDays, setSessionTimeoutDays] = useState('30');
  const [zaloApiKey, setZaloApiKey] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [showZaloKey, setShowZaloKey] = useState(false);
  const [showResendKey, setShowResendKey] = useState(false);
  const [devices, setDevices] = useState<DeviceItem[]>(defaultDevices);
  const [loadingApiSettings, setLoadingApiSettings] = useState(false);
  const [savingApiSettings, setSavingApiSettings] = useState(false);

  useEffect(() => {
    const targetId = focusSection === 'api' ? 'api-settings-card' : 'system-settings-card';
    const target = document.getElementById(targetId);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusSection]);

  useEffect(() => {
    if (!canManageApi) return;

    const loadApiSettings = async () => {
      setLoadingApiSettings(true);
      const { data, error } = await supabase.functions.invoke('system-config-manager', {
        body: { action: 'get_api_settings' },
      });

      if (error || data?.error) {
        toast.error(data?.error || error?.message || 'Không thể tải cấu hình API.');
      } else {
        setZaloApiKey(data?.openaiApiKey ?? '');
        setResendApiKey(data?.resendApiKey ?? '');
      }

      setLoadingApiSettings(false);
    };

    void loadApiSettings();
  }, [canManageApi]);

  const onlineCount = useMemo(
    () => devices.filter((device) => device.status === 'online').length,
    [devices],
  );

  const handleSaveSystemSettings = () => {
    toast.success('Đã lưu cấu hình hệ thống.');
  };

  const handleSaveApiSettings = async () => {
    if (!canManageApi) return;

    setSavingApiSettings(true);
    const { data, error } = await supabase.functions.invoke('system-config-manager', {
      body: {
        action: 'save_api_settings',
        openaiApiKey: zaloApiKey,
        resendApiKey,
      },
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Không thể lưu cấu hình API.');
    } else {
      toast.success('Đã lưu cài đặt API thành công.');
    }
    setSavingApiSettings(false);
  };

  const handleSyncDevices = () => {
    setDevices((current) =>
      current.map((device, index) =>
        index === 1 ? { ...device, status: device.status === 'online' ? 'offline' : 'online' } : device,
      ),
    );
    toast.success('Đã gửi lệnh đồng bộ thiết bị.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Cấu hình hệ thống</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Chỉ quyền IT mới có thể cấu hình hệ thống toàn cục, quản lý API và đồng bộ thiết bị.
        </p>
      </div>

      <div className={cn('grid grid-cols-1 gap-4', isIT && 'md:grid-cols-2')}>
        {isIT && (
        <Card id="system-settings-card" className="rounded-lg border shadow-sm">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <ServerCog className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Cấu hình Hệ thống Toàn cục</CardTitle>
            </div>
            <CardDescription>
              Quản lý bảo trì hệ thống và các giới hạn tài nguyên dùng chung.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Chế độ bảo trì</Label>
                  <p className="text-sm text-muted-foreground">
                    Khóa hệ thống để cập nhật. Chỉ quyền IT mới có thể đăng nhập khi bật chế độ này.
                  </p>
                </div>
                <Switch checked={maintenanceMode} onCheckedChange={setMaintenanceMode} />
              </div>
            </div>

            <div className="space-y-4 rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Giới hạn tài nguyên</Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="checkin-limit">Giới hạn dung lượng ảnh Check-in (MB)</Label>
                <Input
                  id="checkin-limit"
                  type="number"
                  min="1"
                  value={checkinImageLimitMb}
                  onChange={(event) => setCheckinImageLimitMb(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="session-timeout">Thời gian Timeout phiên đăng nhập (Ngày)</Label>
                <Input
                  id="session-timeout"
                  type="number"
                  min="1"
                  value={sessionTimeoutDays}
                  onChange={(event) => setSessionTimeoutDays(event.target.value)}
                />
              </div>

              <Button onClick={handleSaveSystemSettings}>Lưu cài đặt hệ thống</Button>
            </div>
          </CardContent>
        </Card>
        )}

        <Card id="api-settings-card" className="rounded-lg border shadow-sm">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Quản lý Tích hợp & API</CardTitle>
            </div>
            <CardDescription>
              Quản lý API bên thứ 3 và giám sát trạng thái máy chấm công.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4 rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">API Keys Bên thứ 3</Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="zalo-key">OpenAI API Key</Label>
                <div className="relative">
                  <Input
                    id="zalo-key"
                    type={showZaloKey ? 'text' : 'password'}
                    value={zaloApiKey}
                    onChange={(event) => setZaloApiKey(event.target.value)}
                    placeholder="Nhập OpenAI API Key"
                    className="pr-10"
                    disabled={loadingApiSettings || savingApiSettings}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowZaloKey((value) => !value)}
                    tabIndex={-1}
                  >
                    {showZaloKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="resend-key">Resend API Key</Label>
                <div className="relative">
                  <Input
                    id="resend-key"
                    type={showResendKey ? 'text' : 'password'}
                    value={resendApiKey}
                    onChange={(event) => setResendApiKey(event.target.value)}
                    placeholder="Nhập Resend API Key"
                    className="pr-10"
                    disabled={loadingApiSettings || savingApiSettings}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowResendKey((value) => !value)}
                    tabIndex={-1}
                  >
                    {showResendKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button onClick={handleSaveApiSettings} className="gap-2" disabled={loadingApiSettings || savingApiSettings}>
                <Mail className="h-4 w-4" />
                {savingApiSettings ? 'Đang lưu...' : 'Lưu cài đặt'}
              </Button>
            </div>

            {isIT && (
            <div className="space-y-4 rounded-lg border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Trạng thái Máy chấm công</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {onlineCount}/{devices.length} thiết bị đang trực tuyến.
                  </p>
                </div>
                <Button variant="outline" onClick={handleSyncDevices} className="gap-2">
                  <RefreshCcw className="h-4 w-4" />
                  Đồng bộ ngay
                </Button>
              </div>

              <div className="space-y-3">
                {devices.map((device) => (
                  <div
                    key={device.id}
                    className="flex flex-col gap-2 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <StatusDot status={device.status} />
                      <p className="text-sm font-medium text-foreground">{device.name}</p>
                    </div>
                    <Badge variant={device.status === 'online' ? 'default' : 'destructive'}>
                      {device.status === 'online' ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
