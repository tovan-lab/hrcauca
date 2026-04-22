import { useState, useEffect, useCallback } from 'react';
import { CameraCheckIn } from '@/components/CameraCheckIn';
import { CheckInHistory } from '@/components/CheckInHistory';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, MapPinOff, LocateFixed, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { calculateDistance } from '@/lib/geo-utils';

type PermissionStateLike = 'granted' | 'denied' | 'prompt' | 'unsupported';

type GeoState =
  | { status: 'loading' }
  | { status: 'no_branch' }
  | { status: 'no_gps_config' }
  | { status: 'denied' }
  | { status: 'error'; message: string }
  | { status: 'out_of_range'; distance: number; branchName: string; allowedRadius: number }
  | { status: 'in_range'; distance: number };

function getCurrentPositionWithOptions(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

async function getLocationPermissionState(): Promise<PermissionStateLike> {
  if (!('permissions' in navigator) || !navigator.permissions?.query) return 'unsupported';

  try {
    const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return result.state;
  } catch {
    return 'unsupported';
  }
}

async function resolveDevicePosition() {
  const attempts: PositionOptions[] = [
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 },
  ];

  let lastError: GeolocationPositionError | null = null;
  for (const options of attempts) {
    try {
      return await getCurrentPositionWithOptions(options);
    } catch (error) {
      lastError = error as GeolocationPositionError;
      if (lastError.code === lastError.PERMISSION_DENIED) throw lastError;
    }
  }

  throw lastError || new Error('Unable to resolve position');
}

export default function CheckInPage() {
  const { user } = useAuth();
  const [geo, setGeo] = useState<GeoState>({ status: 'loading' });

  const checkLocation = useCallback(async () => {
    if (!user) return;
    setGeo({ status: 'loading' });

    const branchId = (user as any).branch_id;
    if (!branchId) {
      setGeo({ status: 'no_branch' });
      return;
    }

    const { data: branch } = await supabase
      .from('branches')
      .select('branch_name, latitude, longitude, allowed_radius_meters')
      .eq('id', branchId)
      .single();

    if (!branch || branch.latitude == null || branch.longitude == null) {
      setGeo({ status: 'no_gps_config' });
      return;
    }

    const branchLat = branch.latitude as number;
    const branchLng = branch.longitude as number;
    const allowedRadius = (branch.allowed_radius_meters as number) || 50;
    const branchName = branch.branch_name;

    if (!navigator.geolocation) {
      setGeo({ status: 'error', message: 'Trình duyệt này không hỗ trợ định vị GPS.' });
      return;
    }

    const permissionState = await getLocationPermissionState();
    if (permissionState === 'denied') {
      setGeo({ status: 'denied' });
      return;
    }

    try {
      const pos = await resolveDevicePosition();
      const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, branchLat, branchLng);
      const rounded = Math.round(dist);

      if (rounded <= allowedRadius) {
        setGeo({ status: 'in_range', distance: rounded });
      } else {
        setGeo({ status: 'out_of_range', distance: rounded, branchName, allowedRadius });
      }
    } catch (error) {
      const err = error as GeolocationPositionError;

      if (err?.code === err.PERMISSION_DENIED) {
        setGeo({ status: 'denied' });
        return;
      }

      if (err?.code === err.POSITION_UNAVAILABLE) {
        setGeo({
          status: 'error',
          message: 'Điện thoại chưa lấy được GPS. Hãy bật Vị trí chính xác hoặc di chuyển ra nơi tín hiệu tốt hơn rồi thử lại.',
        });
        return;
      }

      setGeo({
        status: 'error',
        message: 'Lấy vị trí bị quá thời gian hoặc GPS không ổn định. Hãy bật Vị trí chính xác rồi thử lại.',
      });
    }
  }, [user]);

  useEffect(() => {
    checkLocation();
  }, [checkLocation]);

  if (geo.status === 'loading') {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="rounded-full bg-muted p-4 animate-pulse">
              <LocateFixed className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-medium text-foreground">Đang kiểm tra vị trí làm việc...</p>
              <p className="text-sm text-muted-foreground">Vui lòng cho phép quyền truy cập vị trí</p>
            </div>
            <Skeleton className="h-4 w-48" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (geo.status === 'denied') {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <Card className="border-yellow-500/50">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="rounded-full bg-yellow-500/10 p-4">
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-foreground">Vui lòng cấp quyền vị trí cho trình duyệt để chấm công.</p>
              <p className="text-sm text-muted-foreground">
                Mở cài đặt trình duyệt rồi cho phép vị trí cho trang này, sau đó thử lại.
              </p>
            </div>
            <Button variant="outline" onClick={checkLocation} className="gap-2">
              <LocateFixed className="h-4 w-4" /> Thử lại vị trí
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (geo.status === 'error') {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <Card className="border-destructive/50">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="rounded-full bg-destructive/10 p-4">
              <MapPinOff className="h-8 w-8 text-destructive" />
            </div>
            <p className="font-semibold text-foreground">{geo.message}</p>
            <Button variant="outline" onClick={checkLocation} className="gap-2">
              <LocateFixed className="h-4 w-4" /> Thử lại vị trí
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (geo.status === 'out_of_range') {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <Card className="border-destructive/50">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="rounded-full bg-destructive/10 p-4">
              <MapPinOff className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-foreground">Bạn đang ở ngoài phạm vi chấm công.</p>
              <p className="text-sm text-foreground">
                Vui lòng di chuyển đến <span className="font-semibold">{geo.branchName}</span>.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Cách quán: <span className="font-bold text-destructive">{geo.distance}m</span>
                <span className="mx-1">•</span>
                Cho phép: {geo.allowedRadius}m
              </p>
            </div>
            <Button variant="outline" onClick={checkLocation} className="gap-2">
              <LocateFixed className="h-4 w-4" /> Kiểm tra lại vị trí
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showLocationBadge = geo.status === 'in_range';

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Chấm công hàng ngày</h2>
        <p className="text-sm text-muted-foreground mt-1">Chụp ảnh điểm danh cho hôm nay</p>
      </div>

      {showLocationBadge && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2 text-sm">
          <MapPin className="h-4 w-4 text-green-600 shrink-0" />
          <span className="text-green-700">Trong phạm vi chấm công ({geo.distance}m)</span>
        </div>
      )}

      {geo.status === 'no_branch' && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
          <span className="text-yellow-700">Chưa được gán chi nhánh. Liên hệ quản lý.</span>
        </div>
      )}

      <CameraCheckIn
        geoAllowed={geo.status === 'in_range' || geo.status === 'no_gps_config'}
        onRefreshLocation={checkLocation}
      />
      <Separator />
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Tuần này</h3>
        <CheckInHistory />
      </div>
    </div>
  );
}
