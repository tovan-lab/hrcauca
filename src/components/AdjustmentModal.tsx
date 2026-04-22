import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { usePenalty } from '@/contexts/PenaltyContext';
import { PENALTY_SEVERITY } from '@/lib/reward-penalty';

interface Props {
  employeeId: string;
  employeeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdjustmentModal({ employeeId, employeeName, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { addRecord } = usePenalty();
  const [tab, setTab] = useState<'penalty' | 'reward'>('penalty');
  const [severity, setSeverity] = useState<string>('light');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    if (!description.trim() || !user) return;

    const numAmount = tab === 'penalty'
      ? PENALTY_SEVERITY.find(s => s.key === severity)?.min ?? -20000
      : Math.abs(parseInt(amount) || 0);

    addRecord({
      id: `pr-${Date.now()}`,
      employee_id: employeeId,
      hr_id: user.id,
      date: new Date().toISOString(),
      type: tab,
      severity: tab === 'penalty' ? severity as 'light' | 'medium' | 'heavy' : undefined,
      amount: tab === 'penalty' ? numAmount : numAmount,
      description: description.trim(),
    });

    toast.success(tab === 'penalty' ? 'Đã ghi nhận phạt' : 'Đã ghi nhận thưởng');
    setDescription('');
    setAmount('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Điều chỉnh tài chính</DialogTitle>
          <DialogDescription>{employeeName}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as 'penalty' | 'reward')}>
          <TabsList className="w-full">
            <TabsTrigger value="penalty" className="flex-1">Phạt</TabsTrigger>
            <TabsTrigger value="reward" className="flex-1">Thưởng</TabsTrigger>
          </TabsList>

          <TabsContent value="penalty" className="space-y-4 mt-4">
            <RadioGroup value={severity} onValueChange={setSeverity}>
              {PENALTY_SEVERITY.map(s => (
                <div key={s.key} className="flex items-center space-x-3 rounded-lg border p-3">
                  <RadioGroupItem value={s.key} id={s.key} />
                  <Label htmlFor={s.key} className="flex-1 cursor-pointer">
                    <span className="font-medium text-sm text-foreground">{s.label}</span>
                    <span className="block text-xs text-muted-foreground">{s.range}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </TabsContent>

          <TabsContent value="reward" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-sm">Số tiền thưởng (VNĐ)</Label>
              <Input
                type="number"
                placeholder="VD: 100000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Khách tip riêng</p>
              <p>• Khách gọi tên khen</p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <Label className="text-sm">Ghi chú</Label>
          <Textarea
            placeholder="Mô tả lý do..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={handleSubmit} disabled={!description.trim()}>Xác nhận</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
