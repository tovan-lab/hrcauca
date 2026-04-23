import { useState, useEffect, useCallback } from 'react';
import { CameraCheckIn } from '@/components/CameraCheckIn';
import { CheckInHistory } from '@/components/CheckInHistory';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, MapPinOff, LocateFixed, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { calculateDistance } from '@/lib/geo-utils';

type PermissionStateLike = 'granted' | 'denied' | 'prompt' | 'unsupported';

type GeoDiagnostics = {
  permissionState: PermissionStateLike;
  attemptedPositionLookup: boolean;
  browserSupportsGeolocation: boolean;
  browserSupportsPermissionsApi: boolean;
  locationErrorCode?: number;
};

type GeoState =
  | { status: 'loading' }
  | { status: 'no_branch' }
  | { status: 'no_gps_config' }
  | { status: 'denied'; diagnostics: GeoDiagnostics }
  | { status: 'error'; message: string; diagnostics: GeoDiagnostics }
  | {
      status: 'out_of_range';
      distance: number;
      branchName: string;
      allowedRadius: number;
      accuracy: number;
      effectiveRadius: number;
    }
  | {
      status: 'in_range';
      distance: number;
      accuracy: number;
      effectiveRadius: number;
    };

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

function getEffectiveAllowedRadius(baseRadius: number, accuracy: number) {
  const safeAccuracy = Number.isFinite(accuracy) ? Math.max(0, accuracy) : 0;
  const bufferedAccuracy = Math.min(safeAccuracy, 120);
  return Math.round(baseRadius + bufferedAccuracy);
}

function getDiagnosticsMessage(diagnostics: GeoDiagnostics) {
  if (!diagnostics.browserSupportsGeolocation) {
    return 'Trình duyệt này không hỗ trợ định vị GPS.';
  }

  if (diagnostics.permissionState === 'denied') {
    return 'Trình duyệt đang chặn quyền vị trí cho trang này.';
  }

  if (diagnostics.locationErrorCode === 1) {
    return 'Trình duyệt hoặc hệ điều hành đang từ chối quyền vị trí.';
  }

  if (diagnostics.locationErrorCode === 2) {
    return 'Trình duyệt đã được cho phép nhưng Windows hoặc thiết bị chưa trả được tọa độ GPS.';
  }

  if (diagnostics.locationErrorCode === 3) {
    return 'Việc lấy vị trí bị quá thời gian. GPS hoặc dịch vụ vị trí của máy đang phản hồi không ổn định.';
  }

  if (diagnostics.permissionState === 'granted') {
    return 'Trang đã có quyền vị trí, nhưng trình duyệt vẫn chưa lấy được tọa độ thật từ thiết bị.';
  }

  if (diagnostics.permissionState === 'prompt') {
    return 'Trình duyệt chưa xác nhận quyền vị trí cho lần truy cập này.';
  }

  return 'Không lấy được vị trí từ trình duyệt hoặc hệ điều hành.';
}

function GeoDiagnosticsPanel({ diagnostics }: { diagnostics: GeoDiagnostics }) {
  const lines = [
    `Quyền vị trí của trang: ${diagnostics.permissionState}`,
    `Trình duyệt hỗ trợ GPS: ${diagnostics.browserSupportsGeolocation ? 'có' : 'không'}`,
    `Permissions API: ${diagnostics.browserSupportsPermissionsApi ? 'có' : 'không'}`,
  ];

  if (diagnostics.locationErrorCode != null) {
    lines.push(`Mã lỗi định vị: ${diagnostics.locationErrorCode}`);
  }

  return (
    <div className="w-full rounded-lg border border-border/60 bg-muted/30 p-3 text-left text-xs text-muted-foreground">
      <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
        <ShieldAlert className="h-4 w-4" />
        <span>Chẩn đoán GPS</span>
      </div>
      <ul className="space-y-1">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-3">
        Nếu quyền của trang đã là <span className="font-medium text-foreground">granted</span> nhưng vẫn lỗi,
        hãy kiểm tra Windows <span className="font-medium text-foreground">Location services</span>.
      </p>
    </div>
  );
}

export default function CheckInPage() {
  const { user } = useAuth();
  const [geo, setGeo] = useState<GeoState>({ status: 'loading' });

  const checkLocation = useCallback(async () => {
    if (!user) return;
    setGeo({ status: 'loading' });

    const branchId = (user as { branch_id?: string | null }).branch_id;
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

    const diagnostics: GeoDiagnostics = {
      permissionState: 'unsupported',
      attemptedPositionLookup: false,
      browserSupportsGeolocation: 'geolocation' in navigator,
      browserSupportsPermissionsApi: 'permissions' in navigator && !!navigator.permissions?.query,
    };

    if (!navigator.geolocation) {
      setGeo({
        status: 'error',
        message: 'Trình duyệt này không hỗ trợ định vị GPS.',
        diagnostics,
      });
      return;
    }

    diagnostics.permissionState = await getLocationPermissionState();

    if (diagnostics.permissionState === 'denied') {
      setGeo({ status: 'denied', diagnostics });
      return;
    }

    try {
      diagnostics.attemptedPositionLookup = true;
      const pos = await resolveDevicePosition();
      const distance = Math.round(
        calculateDistance(pos.coords.latitude, pos.coords.longitude, branchLat, branchLng),
      );
      const accuracy = Math.round(pos.coords.accuracy || 0);
      const effectiveRadius = getEffectiveAllowedRadius(allowedRadius, accuracy);

      if (distance <= effectiveRadius) {
        setGeo({ status: 'in_range', distance, accuracy, effectiveRadius });
      } else {
        setGeo({
          status: 'out_of_range',
          distance,
          branchName,
          allowedRadius,
          accuracy,
          effectiveRadius,
        });
      }
    } catch (error) {
      const err = error as GeolocationPositionError;
      diagnostics.locationErrorCode = err?.code;

      if (err?.code === err.PERMISSION_DENIED) {
        setGeo({ status: 'denied', diagnostics });
        return;
      }

      setGeo({
        status: 'error',
        message: getDiagnosticsMessage(diagnostics),
        diagnostics,
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
            <div className="animate-pulse rounded-full bg-muted p-4">
              <LocateFixed className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-1 text-center">
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
            <GeoDiagnosticsPanel diagnostics={geo.diagnostics} />
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
            <GeoDiagnosticsPanel diagnostics={geo.diagnostics} />
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
              <p className="mt-2 text-sm text-muted-foreground">
                Cách quán: <span className="font-bold text-destructive">{geo.distance}m</span>
                <span className="mx-1">•</span>
                Bán kính gốc: {geo.allowedRadius}m
              </p>
              <p className="text-sm text-muted-foreground">
                Sai số GPS máy này: khoảng {geo.accuracy}m
                <span className="mx-1">•</span>
                Bán kính áp dụng: {geo.effectiveRadius}m
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
        <p className="mt-1 text-sm text-muted-foreground">Chụp ảnh điểm danh cho hôm nay</p>
      </div>

      {showLocationBadge && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-green-600" />
          <span className="text-green-700">
            Trong phạm vi chấm công ({geo.distance}m, sai số GPS khoảng {geo.accuracy}m)
          </span>
        </div>
      )}

      {geo.status === 'no_branch' && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
          <span className="text-yellow-700">Chưa được gán chi nhánh. Liên hệ quản lý.</span>
        </div>
      )}

      <CameraCheckIn
        geoAllowed={geo.status === 'in_range' || geo.status === 'no_gps_config'}
        onRefreshLocation={checkLocation}
      />
      <Separator />
      <div>
        <h3 className="mb-4 text-sm font-semibold text-foreground">Tuần này</h3>
        <CheckInHistory />
      </div>
    </div>
  );
}
