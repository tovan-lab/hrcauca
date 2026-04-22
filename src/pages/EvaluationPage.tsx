import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Search, CalendarIcon, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { EvaluationForm } from '@/components/EvaluationForm';

interface Employee {
  user_id: string;
  name: string;
  department: string | null;
  branch_id: string | null;
  role: string;
}

export default function EvaluationPage() {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [evaluationDate, setEvaluationDate] = useState<Date>(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<{ id: string; branch_name: string }[]>([]);
  const [shiftsForDate, setShiftsForDate] = useState<Set<string>>(new Set());
  const [evaluatedForDate, setEvaluatedForDate] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');

  const isHR = user?.role === 'HR';
  const userBranchId = (user as any)?.branch_id;
  const dateStr = format(evaluationDate, 'yyyy-MM-dd');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [{ data: profiles }, { data: roles }, { data: branchList }, { data: shiftsData }, { data: evalsData }] = await Promise.all([
        supabase.from('profiles').select('user_id, name, department, branch_id').eq('status', 'active'),
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('branches').select('id, branch_name'),
        supabase.from('shifts').select('user_id').eq('shift_date', dateStr),
        supabase.from('evaluations').select('employee_id').eq('evaluation_date', dateStr),
      ]);
      if (branchList) setBranches(branchList as any);
      if (shiftsData) setShiftsForDate(new Set(shiftsData.map(s => s.user_id)));
      if (evalsData) setEvaluatedForDate(new Set(evalsData.map(e => e.employee_id)));

      if (profiles && roles) {
        let mapped: Employee[] = profiles.map(p => {
          const r = roles.find(r => r.user_id === p.user_id);
          return { user_id: p.user_id, name: p.name, department: p.department, branch_id: p.branch_id, role: r?.role || 'EMPLOYEE' };
        }).filter(e => e.role === 'EMPLOYEE');
        if (isHR && userBranchId) {
          mapped = mapped.filter(e => e.branch_id === userBranchId);
        }
        setEmployees(mapped);
      }
      setLoading(false);
    };
    fetchData();
  }, [isHR, userBranchId, dateStr]);

  if (selectedId) {
    return <EvaluationForm employeeId={selectedId} evaluationDate={dateStr} onBack={() => setSelectedId(null)} />;
  }

  let filtered = employees;
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(e => e.name.toLowerCase().includes(q));
  }
  if (branchFilter !== 'all') {
    filtered = filtered.filter(e => e.branch_id === branchFilter);
  }

  // Only show employees who have shifts on this date
  const withShifts = filtered.filter(e => shiftsForDate.has(e.user_id));
  const withoutShifts = filtered.filter(e => !shiftsForDate.has(e.user_id));

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Chấm điểm nhân viên</h2>
        <p className="text-sm text-muted-foreground mt-1">Chọn ngày và nhân viên để chấm điểm (chỉ NV có ca làm)</p>
      </div>

      {/* Date picker */}
      <div className="flex flex-wrap gap-3 items-end">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {format(evaluationDate, 'EEEE, dd/MM/yyyy', { locale: vi })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={evaluationDate}
              onSelect={d => d && setEvaluationDate(d)}
              className="p-3 pointer-events-auto"
              disabled={d => d > new Date()}
            />
          </PopoverContent>
        </Popover>

        <Badge variant="secondary" className="text-xs">
          {withShifts.length} NV có ca · {evaluatedForDate.size} đã chấm
        </Badge>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[180px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="Tìm nhân viên..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {!isHR && (
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
        )}
      </div>

      {/* Employees with shifts */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="py-4"><Skeleton className="h-10 w-full" /></CardContent></Card>
          ))
        ) : withShifts.length === 0 ? (
          <Card>
            <CardContent className="text-center text-sm text-muted-foreground py-8">
              Không có nhân viên nào có ca làm ngày {format(evaluationDate, 'dd/MM/yyyy')}.
            </CardContent>
          </Card>
        ) : (
          withShifts.map(emp => {
            const isEvaluated = evaluatedForDate.has(emp.user_id);
            return (
              <Card
                key={emp.user_id}
                className={cn(
                  'transition-colors',
                  isEvaluated ? 'opacity-60' : 'cursor-pointer hover:bg-muted/50'
                )}
                onClick={() => !isEvaluated && setSelectedId(emp.user_id)}
              >
                <CardContent className="flex items-center gap-4 py-4">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {emp.name.split(' ').map(n => n[0]).join('').slice(0, 3)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium text-foreground text-sm">{emp.name}</p>
                    <p className="text-xs text-muted-foreground">{emp.department || '—'}</p>
                  </div>
                  {isEvaluated ? (
                    <Badge variant="default" className="gap-1 text-xs bg-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> Đã chấm
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">Chưa chấm</Badge>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Employees without shifts (collapsed) */}
      {withoutShifts.length > 0 && (
        <div className="pt-2">
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <XCircle className="h-3.5 w-3.5" />
            {withoutShifts.length} NV không có ca làm ngày này
          </p>
        </div>
      )}
    </div>
  );
}
