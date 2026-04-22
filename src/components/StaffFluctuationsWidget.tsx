import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ArrowDownToLine, ArrowUpFromLine, Users } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import {
  fetchTransferContext,
  classifyFluctuations,
  type AssignmentLite,
  type ShiftLite,
} from '@/lib/branch-transfer';
import { calcEffectiveHours } from '@/lib/shift-utils';

interface Props {
  /** Branch to compute fluctuations for. If null, widget is hidden. */
  branchId: string | null;
}

type RangeKey = 'today' | 'week' | 'month';

function getRange(key: RangeKey): { from: string; to: string } {
  const now = new Date();
  if (key === 'today') {
    const d = format(now, 'yyyy-MM-dd');
    return { from: d, to: d };
  }
  if (key === 'week') {
    return {
      from: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      to: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    };
  }
  return {
    from: format(startOfMonth(now), 'yyyy-MM-dd'),
    to: format(endOfMonth(now), 'yyyy-MM-dd'),
  };
}

export function StaffFluctuationsWidget({ branchId }: Props) {
  const { user } = useAuth();
  const [range, setRange] = useState<RangeKey>('today');
  const [shifts, setShifts] = useState<ShiftLite[]>([]);
  const [allShifts, setAllShifts] = useState<any[]>([]);
  const [ctx, setCtx] = useState<{
    homeBranchByUser: Record<string, string | null>;
    nameByUser: Record<string, string>;
    assignments: AssignmentLite[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!branchId) {
      setLoading(false);
      return;
    }
    const { from, to } = getRange(range);
    const load = async () => {
      setLoading(true);
      const [{ data: shiftRows }, transferCtx] = await Promise.all([
        supabase
          .from('shifts')
          .select('id, user_id, shift_date, actual_branch_id, start_time, end_time')
          .gte('shift_date', from)
          .lte('shift_date', to),
        fetchTransferContext(from, to),
      ]);
      setAllShifts(shiftRows || []);
      setShifts((shiftRows as ShiftLite[]) || []);
      setCtx(transferCtx);
      setLoading(false);
    };
    load();
    const ch = supabase
      .channel('staff-fluct-widget')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'branch_assignments' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_swap_requests' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [branchId, range]);

  const data = useMemo(() => {
    if (!ctx || !branchId) return null;
    const fluct = classifyFluctuations(branchId, shifts, ctx.homeBranchByUser, ctx.assignments);
    let incomingHours = 0;
    let outgoingHours = 0;
    for (const s of allShifts) {
      const home = ctx.homeBranchByUser[s.user_id] ?? null;
      const actual = s.actual_branch_id ??
        (ctx.assignments.find(
          (a) => a.employee_id === s.user_id && a.start_date <= s.shift_date && a.end_date >= s.shift_date && a.status === 'active',
        )?.to_branch_id ?? home);
      const hrs = s.start_time && s.end_time
        ? calcEffectiveHours(s.start_time.slice(0, 5), s.end_time.slice(0, 5)).effectiveHours
        : 0;
      if (home !== branchId && actual === branchId) incomingHours += hrs;
      if (home === branchId && actual !== branchId && actual !== null) outgoingHours += hrs;
    }
    // Dedupe employees (across multiple days) for cleaner display
    const dedupe = (arr: typeof fluct.incoming) => {
      const seen = new Map<string, typeof arr[number] & { days: number }>();
      arr.forEach((it) => {
        const ex = seen.get(it.employeeId);
        if (ex) ex.days += 1;
        else seen.set(it.employeeId, { ...it, days: 1 });
      });
      return Array.from(seen.values());
    };
    return {
      incoming: dedupe(fluct.incoming),
      outgoing: dedupe(fluct.outgoing),
      incomingHours,
      outgoingHours,
    };
  }, [ctx, branchId, shifts, allShifts]);

  if (!branchId) return null;
  if (user?.role !== 'ADMIN' && user?.role !== 'HR') return null;

  const rangeLabel = range === 'today' ? 'hôm nay' : range === 'week' ? 'tuần này' : 'tháng này';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Users className="h-4 w-4" /> Biến động nhân sự ({rangeLabel})
          </CardTitle>
          <ToggleGroup
            type="single"
            size="sm"
            value={range}
            onValueChange={(v) => v && setRange(v as RangeKey)}
            className="gap-1"
          >
            <ToggleGroupItem value="today" className="h-7 px-2 text-xs">Hôm nay</ToggleGroupItem>
            <ToggleGroupItem value="week" className="h-7 px-2 text-xs">Tuần này</ToggleGroupItem>
            <ToggleGroupItem value="month" className="h-7 px-2 text-xs">Tháng này</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        {loading || !data ? (
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Incoming */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <ArrowDownToLine className="h-3.5 w-3.5 text-primary" /> Biệt phái đến
                </p>
                <Badge variant="default" className="text-xs">+{data.incomingHours.toFixed(1)}h</Badge>
              </div>
              {data.incoming.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">Không có ai</p>
              ) : (
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {data.incoming.map((it) => (
                    <li key={it.employeeId} className="text-xs flex justify-between">
                      <span className="font-medium truncate">{ctx!.nameByUser[it.employeeId] ?? it.employeeId.slice(0, 8)}</span>
                      <span className="text-muted-foreground shrink-0 ml-2">{it.days} ngày</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Outgoing */}
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <ArrowUpFromLine className="h-3.5 w-3.5 text-destructive" /> Biệt phái đi
                </p>
                <Badge variant="outline" className="text-xs text-destructive border-destructive/40">−{data.outgoingHours.toFixed(1)}h</Badge>
              </div>
              {data.outgoing.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">Không có ai</p>
              ) : (
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {data.outgoing.map((it) => (
                    <li key={it.employeeId} className="text-xs flex justify-between">
                      <span className="font-medium truncate">{ctx!.nameByUser[it.employeeId] ?? it.employeeId.slice(0, 8)}</span>
                      <span className="text-muted-foreground shrink-0 ml-2">{it.days} ngày</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-3">
          Tổng giờ tại chi nhánh đã <span className="text-primary font-medium">cộng giờ "biệt phái đến"</span> và <span className="text-destructive font-medium">trừ giờ "biệt phái đi"</span>.
        </p>
      </CardContent>
    </Card>
  );
}
