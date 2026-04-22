import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Building2, Plus, Pencil, Trash2, MapPin, LocateFixed } from 'lucide-react';
import { toast } from 'sonner';

interface Branch {
  id: string;
  branch_name: string;
  address: string;
  manager_id: string | null;
  latitude: number | null;
  longitude: number | null;
  allowed_radius_meters: number;
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('50');
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('branches').select('*').order('branch_name');
    setBranches((data as Branch[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchBranches(); }, [fetchBranches]);

  const openCreate = () => {
    setEditBranch(null);
    setName('');
    setAddress('');
    setLatitude('');
    setLongitude('');
    setRadius('50');
    setDialogOpen(true);
  };

  const openEdit = (b: Branch) => {
    setEditBranch(b);
    setName(b.branch_name);
    setAddress(b.address);
    setLatitude(b.latitude != null ? String(b.latitude) : '');
    setLongitude(b.longitude != null ? String(b.longitude) : '');
    setRadius(String(b.allowed_radius_meters));
    setDialogOpen(true);
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Trình duyệt không hỗ trợ định vị GPS');
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(String(pos.coords.latitude));
        setLongitude(String(pos.coords.longitude));
        setGettingLocation(false);
        toast.success('Đã lấy vị trí thành công');
      },
      () => {
        setGettingLocation(false);
        toast.error('Không thể lấy vị trí. Vui lòng cấp quyền GPS.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Vui lòng nhập tên chi nhánh'); return; }
    setSaving(true);
    const payload = {
      branch_name: name,
      address,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      allowed_radius_meters: parseInt(radius) || 50,
    };
    if (editBranch) {
      await supabase.from('branches').update(payload).eq('id', editBranch.id);
      toast.success('Đã cập nhật chi nhánh');
    } else {
      await supabase.from('branches').insert(payload);
      toast.success('Đã tạo chi nhánh mới');
    }
    setSaving(false);
    setDialogOpen(false);
    fetchBranches();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('branches').delete().eq('id', id);
    toast.success('Đã xóa chi nhánh');
    fetchBranches();
  };

  const hasGps = (b: Branch) => b.latitude != null && b.longitude != null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Quản lý chi nhánh</h2>
          <p className="text-sm text-muted-foreground mt-1">Quản lý danh sách các chi nhánh/cửa hàng</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Thêm chi nhánh</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editBranch ? 'Chỉnh sửa chi nhánh' : 'Thêm chi nhánh mới'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Tên chi nhánh</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Tovan Coffee 1" />
              </div>
              <div className="space-y-2">
                <Label>Địa chỉ</Label>
                <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Đường ABC, Quận 1" />
              </div>

              <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-primary" /> Cài đặt GPS
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGetLocation}
                    disabled={gettingLocation}
                    className="gap-1.5 text-xs"
                  >
                    <LocateFixed className="h-3.5 w-3.5" />
                    {gettingLocation ? 'Đang lấy...' : '📍 Lấy vị trí hiện tại'}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Vĩ độ (Latitude)</Label>
                    <Input
                      type="number"
                      step="any"
                      value={latitude}
                      onChange={e => setLatitude(e.target.value)}
                      placeholder="10.7769"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Kinh độ (Longitude)</Label>
                    <Input
                      type="number"
                      step="any"
                      value={longitude}
                      onChange={e => setLongitude(e.target.value)}
                      placeholder="106.7009"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Bán kính cho phép (m)</Label>
                  <Input
                    type="number"
                    value={radius}
                    onChange={e => setRadius(e.target.value)}
                    placeholder="50"
                    min={10}
                    max={1000}
                  />
                </div>
              </div>

              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? 'Đang lưu...' : editBranch ? 'Cập nhật' : 'Tạo chi nhánh'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Tên chi nhánh</TableHead>
                  <TableHead className="text-xs">Địa chỉ</TableHead>
                  <TableHead className="text-xs text-center">GPS</TableHead>
                  <TableHead className="text-xs text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-60" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-10 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : branches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                      Chưa có chi nhánh nào
                    </TableCell>
                  </TableRow>
                ) : (
                  branches.map(b => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium text-sm">{b.branch_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{b.address || '—'}</TableCell>
                      <TableCell className="text-center">
                        {hasGps(b) ? (
                          <Badge variant="default" className="text-[10px] gap-1">
                            <MapPin className="h-3 w-3" /> {b.allowed_radius_meters}m
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(b)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(b.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
