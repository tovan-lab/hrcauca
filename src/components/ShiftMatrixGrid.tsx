import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { CalendarIcon, Save, Search, RotateCcw, UserPlus, Loader2, Trash2, ChevronLeft, ChevronRight, ArrowLeftRight } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, addDays, addWeeks, addMonths } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { calculatePenalty, getCurrentMonth, formatVND, FREE_EDITS, PENALTY_PER_EDIT } from '@/lib/penalty-utils';
import type { AssignmentLite } from '@/lib/branch-transfer';

type CellValue = '1' | '1.25' | 'off' | '';
type RangeMode = 'day' | 'week' | 'month';

interface ShiftRow {
  id: string;
  user_id: string;
  shift_date: string;
  shift_type: string;
  start_time: string;
  end_time: string;
  actual_branch_id?: string | null;
}

interface CheckInRow {
  id: string;
  shift_id: string | null;
  user_id: string;
  check_in_time: string | null;
  check_out_time: string | null;
}

interface ProfileInfo {
  user_id: string;
  name: string;
  email: string;
  branch_id: string | null;
}

interface DraftChange {
  userId: string;
  date: string;
  slotKey: string;
  value: CellValue;
  originalValue: CellValue;
}

interface WeeklyEmployeeColumn {
  userId: string;
  date: string;
  employeeName: string;
  branchName: string;
  totalHours: number;
}

interface TransactionalEmailRequest {
  templateName: string;
  recipientEmail: string;
  idempotencyKey: string;
  templateData: Record<string, unknown>;
}

interface TransactionalEmailInvokeOptions {
  body: TransactionalEmailRequest;
}

interface RenderedCellState {
  rawValue: string;
  displayText: string;
  numericValue: number;
  isOff: boolean;
}

// Time slots: 15:00 same day → 05:00 next day (overnight ca chiều/tối/đêm)
const TIME_SLOTS = [
  '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:00', '19:00-20:00',
  '20:00-21:00', '21:00-22:00', '22:00-23:00', '23:00-00:00',
  '00:00-01:00', '01:00-02:00', '02:00-03:00', '03:00-04:00', '04:00-05:00',
];

function getSlotStartHour(slot: string): number {
  return parseInt(slot.split('-')[0].split(':')[0], 10);
}

/**
 * Convert shifts to a 2D matrix:
 * matrix[userId][date_slot] = '1' | '1.25' | ''
 */
function buildMatrix(
  shifts: ShiftRow[],
  dates: Date[],
  profiles: ProfileInfo[]
): Record<string, Record<string, CellValue>> {
  const matrix: Record<string, Record<string, CellValue>> = {};
  
  // Init all cells empty
  for (const p of profiles) {
    matrix[p.user_id] = {};
    for (const d of dates) {
      const ds = format(d, 'yyyy-MM-dd');
      for (const slot of TIME_SLOTS) {
        matrix[p.user_id][`${ds}_${slot}`] = '';
      }
    }
  }

  // Fill from shifts
  for (const s of shifts) {
    if (!matrix[s.user_id]) continue;
    const startH = parseInt(s.start_time.slice(0, 2), 10);
    const endH = parseInt(s.end_time.slice(0, 2), 10);
    const endM = parseInt(s.end_time.slice(3, 5), 10);
    const isOvernight = endH < startH || (endH === startH && endM === 0 && startH !== 0);

    for (const slot of TIME_SLOTS) {
      const slotH = getSlotStartHour(slot);
      let inShift = false;

      if (isOvernight) {
        // e.g. 18:00 - 02:00: slot 18-23 on shift_date, slot 0-1 also on shift_date
        if (slotH >= startH || slotH < endH) inShift = true;
      } else {
        const actualEnd = endM > 0 ? endH + 1 : endH;
        if (slotH >= startH && slotH < actualEnd) inShift = true;
      }

      if (inShift) {
        const key = `${s.shift_date}_${slot}`;
        // After midnight = 1.25x
        const isNight = slotH >= 0 && slotH < 6;
        matrix[s.user_id][key] = isNight ? '1.25' : '1';
      }
    }
  }

  return matrix;
}

export function ShiftMatrixGrid() {
  const { user } = useAuth();
  const isHR = user?.role === 'HR';
  const userBranchId = (user as any)?.branch_id;

  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [branches, setBranches] = useState<{ id: string; branch_name: string }[]>([]);
  const [assignments, setAssignments] = useState<AssignmentLite[]>([]);
  const [editLogs, setEditLogs] = useState<Record<string, number>>({}); // employee_id -> edit_count this month
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [selectedDate, setSelectedDate] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [rangeMode, setRangeMode] = useState<RangeMode>('week');

  // Draft changes
  const [drafts, setDrafts] = useState<Map<string, DraftChange>>(new Map());

  // Assign shift dialog state
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState<string>('');
  const [assignDate, setAssignDate] = useState<string>('');
  const [assignStart, setAssignStart] = useState('15:00');
  const [assignEnd, setAssignEnd] = useState('23:00');
  const [assigning, setAssigning] = useState(false);

  // Delete shift dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteShiftId, setDeleteShiftId] = useState<string>('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Penalty warning dialog
  const [penaltyWarning, setPenaltyWarning] = useState<{
    affectedEmployees: { name: string; currentEdits: number; newEdits: number; penalty: number }[];
  } | null>(null);

  const { weekStart, weekEnd, rangeLabel } = useMemo(() => {
    if (rangeMode === 'day') {
      return {
        weekStart: selectedDate,
        weekEnd: selectedDate,
        rangeLabel: format(selectedDate, 'EEEE, dd/MM/yyyy', { locale: vi }),
      };
    }
    if (rangeMode === 'month') {
      const s = startOfMonth(selectedDate);
      const e = endOfMonth(selectedDate);
      return {
        weekStart: s,
        weekEnd: e,
        rangeLabel: format(selectedDate, 'MMMM yyyy', { locale: vi }),
      };
    }
    const s = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const e = endOfWeek(selectedDate, { weekStartsOn: 1 });
    return {
      weekStart: s,
      weekEnd: e,
      rangeLabel: `${format(s, 'dd/MM')} – ${format(e, 'dd/MM/yyyy')}`,
    };
  }, [selectedDate, rangeMode]);
  const dates = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  const navigateRange = useCallback((dir: 1 | -1) => {
    setSelectedDate(prev => {
      if (rangeMode === 'day') return addDays(prev, dir);
      if (rangeMode === 'month') return addMonths(prev, dir);
      return addWeeks(prev, dir);
    });
  }, [rangeMode]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const from = format(weekStart, 'yyyy-MM-dd');
    const to = format(weekEnd, 'yyyy-MM-dd');
    const currentMonth = getCurrentMonth();
    const checkInTo = format(addDays(weekEnd, 1), 'yyyy-MM-dd');

    const [{ data: shiftData }, { data: profs }, { data: branchList }, { data: logs }, { data: assigns }, { data: checkInData }] = await Promise.all([
      supabase.from('shifts').select('id, user_id, shift_date, shift_type, start_time, end_time, actual_branch_id').gte('shift_date', from).lte('shift_date', to).order('shift_date'),
      supabase.from('profiles').select('user_id, name, email, branch_id').eq('status', 'active'),
      supabase.from('branches').select('id, branch_name'),
      supabase.from('shift_edit_logs').select('employee_id, edit_count').eq('edit_month', currentMonth),
      supabase
        .from('branch_assignments')
        .select('id, employee_id, from_branch_id, to_branch_id, start_date, end_date, status')
        .eq('status', 'active')
        .lte('start_date', to)
        .gte('end_date', from),
      supabase
        .from('check_ins')
        .select('id, shift_id, user_id, check_in_time, check_out_time')
        .gte('check_in_time', `${from}T00:00:00`)
        .lte('check_in_time', `${checkInTo}T23:59:59`),
    ]);

    if (branchList) setBranches(branchList as any);
    setAssignments((assigns as AssignmentLite[]) || []);

    let allProfiles = (profs as ProfileInfo[]) || [];
    // HR: only their branch employees (home OR currently assigned in)
    if (isHR && userBranchId) {
      const incomingUserIds = new Set(
        ((assigns as AssignmentLite[]) || [])
          .filter((a) => a.to_branch_id === userBranchId)
          .map((a) => a.employee_id),
      );
      allProfiles = allProfiles.filter((p) => p.branch_id === userBranchId || incomingUserIds.has(p.user_id));
    }
    setProfiles(allProfiles);

    let allShifts = (shiftData as ShiftRow[]) || [];
    if (isHR && userBranchId) {
      const branchUserIds = new Set(allProfiles.map(p => p.user_id));
      allShifts = allShifts.filter(s => branchUserIds.has(s.user_id));
    }
    setShifts(allShifts);
    let allCheckIns = (checkInData as CheckInRow[]) || [];
    if (isHR && userBranchId) {
      const branchUserIds = new Set(allProfiles.map(p => p.user_id));
      allCheckIns = allCheckIns.filter(c => branchUserIds.has(c.user_id));
    }
    setCheckIns(allCheckIns);

    // Edit log counts
    const logMap: Record<string, number> = {};
    if (logs) {
      for (const l of logs as any[]) {
        logMap[l.employee_id] = l.edit_count;
      }
    }
    setEditLogs(logMap);

    setDrafts(new Map());
    setLoading(false);
  }, [weekStart, weekEnd, isHR, userBranchId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build matrix (memoized to prevent re-renders)
  const matrix = useMemo(() => buildMatrix(shifts, dates, profiles), [shifts, dates, profiles]);

  // Apply drafts on top of matrix
  const displayMatrix = useMemo(() => {
    const m = { ...matrix };
    for (const [, draft] of drafts) {
      if (m[draft.userId]) {
        m[draft.userId] = { ...m[draft.userId], [`${draft.date}_${draft.slotKey}`]: draft.value };
      }
    }
    return m;
  }, [matrix, drafts]);

  // Set of users who have at least one shift this week (or a draft adding one)
  const usersWithShifts = useMemo(() => {
    const set = new Set<string>(shifts.map(s => s.user_id));
    for (const [, d] of drafts) {
      if (d.value === '1' || d.value === '1.25') set.add(d.userId);
    }
    return set;
  }, [shifts, drafts]);

  // Filter profiles: only show users who have shifts this week
  const filteredProfiles = useMemo(() => {
    let result = profiles.filter(p => usersWithShifts.has(p.user_id));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q));
    }
    if (branchFilter !== 'all') {
      result = result.filter(p => p.branch_id === branchFilter);
    }
    return result;
  }, [profiles, usersWithShifts, search, branchFilter]);

  // Profiles available to assign (those NOT currently displayed)
  const assignableProfiles = useMemo(() => {
    let result = profiles.filter(p => !usersWithShifts.has(p.user_id));
    if (branchFilter !== 'all') {
      result = result.filter(p => p.branch_id === branchFilter);
    }
    return result;
  }, [profiles, usersWithShifts, branchFilter]);

  const getBranchName = useCallback((branchId: string | null) => {
    return branchId ? branches.find(b => b.id === branchId)?.branch_name || '' : '';
  }, [branches]);

  const invokeTransactionalEmail = useCallback(async (options: TransactionalEmailInvokeOptions) => {
    const result = await supabase.functions.invoke('send-transactional-email', options);
    if (result.error) throw result.error;
    return result;
  }, []);

  const shiftsByUserDate = useMemo(() => {
    const grouped = new Map<string, ShiftRow[]>();
    for (const shift of shifts) {
      const key = `${shift.user_id}_${shift.shift_date}`;
      const current = grouped.get(key) || [];
      current.push(shift);
      grouped.set(key, current);
    }
    return grouped;
  }, [shifts]);

  const checkInByShiftId = useMemo(() => {
    const grouped = new Map<string, CheckInRow>();
    for (const checkIn of checkIns) {
      if (checkIn.shift_id) grouped.set(checkIn.shift_id, checkIn);
    }
    return grouped;
  }, [checkIns]);

  const roundToQuarter = useCallback((value: number) => {
    return Math.round(value * 4) / 4;
  }, []);

  const formatDisplayHours = useCallback((value: number) => {
    if (value <= 0) return '';
    const rounded = roundToQuarter(value);
    if (Number.isInteger(rounded)) return String(rounded);
    return rounded.toFixed(2).replace('.', ',').replace(/0$/, '');
  }, [roundToQuarter]);

  const parseMatrixValue = useCallback((value: string): number => {
    if (value === '1') return 1;
    if (value === '1.25') return 1.25;
    return 0;
  }, []);

  const getSlotWindow = useCallback((date: string, slot: string) => {
    const [startLabel] = slot.split('-');
    const [startHour, startMinute] = startLabel.split(':').map(Number);
    const slotStart = new Date(`${date}T00:00:00`);
    if (startHour < 15) slotStart.setDate(slotStart.getDate() + 1);
    slotStart.setHours(startHour, startMinute, 0, 0);

    const slotEnd = new Date(slotStart);
    slotEnd.setHours(slotEnd.getHours() + 1);

    return { slotStart, slotEnd };
  }, []);

  const getShiftWindow = useCallback((shift: ShiftRow) => {
    const shiftStart = new Date(`${shift.shift_date}T${shift.start_time.slice(0, 5)}:00`);
    const shiftEnd = new Date(`${shift.shift_date}T${shift.end_time.slice(0, 5)}:00`);
    if (shiftEnd <= shiftStart) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }
    return { shiftStart, shiftEnd };
  }, []);

  const getActualSlotValue = useCallback((shift: ShiftRow, checkIn: CheckInRow, slot: string) => {
    const { shiftStart, shiftEnd } = getShiftWindow(shift);
    const actualStart = checkIn.check_in_time ? new Date(checkIn.check_in_time) : shiftStart;
    const actualEnd = checkIn.check_out_time ? new Date(checkIn.check_out_time) : shiftEnd;

    const workStart = new Date(Math.max(shiftStart.getTime(), actualStart.getTime()));
    const workEnd = new Date(actualEnd.getTime());

    if (workEnd <= workStart) return 0;

    const { slotStart, slotEnd } = getSlotWindow(shift.shift_date, slot);
    const overlapStart = Math.max(workStart.getTime(), slotStart.getTime());
    const overlapEnd = Math.min(workEnd.getTime(), slotEnd.getTime());

    if (overlapEnd <= overlapStart) return 0;

    const overlapHours = (overlapEnd - overlapStart) / (1000 * 60 * 60);
    const slotHour = slotStart.getHours();
    const multiplier = slotHour >= 0 && slotHour < 6 ? 1.25 : 1;

    return roundToQuarter(overlapHours * multiplier);
  }, [getShiftWindow, getSlotWindow, roundToQuarter]);

  const getRenderedCellState = useCallback((userId: string, date: string, slot: string): RenderedCellState => {
    const draftKey = `${userId}_${date}_${slot}`;
    const draftValue = drafts.get(draftKey)?.value;
    if (draftValue !== undefined) {
      return {
        rawValue: draftValue,
        displayText: draftValue === 'off' ? '✕' : formatDisplayHours(parseMatrixValue(draftValue)),
        numericValue: parseMatrixValue(draftValue),
        isOff: draftValue === 'off',
      };
    }

    const relevantShifts = shiftsByUserDate.get(`${userId}_${date}`) || [];
    let actualValue = 0;
    let hasActualCheckIn = false;

    for (const shift of relevantShifts) {
      const checkIn = checkInByShiftId.get(shift.id);
      if (!checkIn) continue;
      hasActualCheckIn = true;
      actualValue += getActualSlotValue(shift, checkIn, slot);
    }

    if (hasActualCheckIn) {
      const roundedActual = roundToQuarter(actualValue);
      return {
        rawValue: roundedActual > 0 ? String(roundedActual) : '',
        displayText: formatDisplayHours(roundedActual),
        numericValue: roundedActual,
        isOff: false,
      };
    }

    const baseValue = displayMatrix[userId]?.[`${date}_${slot}`] || '';
    return {
      rawValue: baseValue,
      displayText: baseValue === 'off' ? '✕' : formatDisplayHours(parseMatrixValue(baseValue)),
      numericValue: parseMatrixValue(baseValue),
      isOff: baseValue === 'off',
    };
  }, [checkInByShiftId, displayMatrix, drafts, formatDisplayHours, getActualSlotValue, parseMatrixValue, roundToQuarter, shiftsByUserDate]);

  const getEmployeeTotalHours = useCallback((userId: string) => {
    let total = 0;
    for (const date of dates) {
      const dateStr = format(date, 'yyyy-MM-dd');
      for (const slot of TIME_SLOTS) {
        total += getRenderedCellState(userId, dateStr, slot).numericValue;
      }
    }
    return roundToQuarter(total);
  }, [dates, getRenderedCellState, roundToQuarter]);

  const getEmployeeDayTotalHours = useCallback((userId: string, date: string) => {
    let total = 0;
    for (const slot of TIME_SLOTS) {
      total += getRenderedCellState(userId, date, slot).numericValue;
    }
    return roundToQuarter(total);
  }, [getRenderedCellState, roundToQuarter]);

  const weeklyGroupedColumns = useMemo(() => {
    if (!(isHR && rangeMode === 'week')) return [];

    return dates
      .map((date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const employees: WeeklyEmployeeColumn[] = filteredProfiles
          .map((profile) => ({
            userId: profile.user_id,
            date: dateStr,
            employeeName: profile.name,
            branchName: getBranchName(profile.branch_id),
            totalHours: getEmployeeDayTotalHours(profile.user_id, dateStr),
          }))
          .filter((item) => item.totalHours > 0);

        return { date, dateStr, employees };
      })
      .filter((group) => group.employees.length > 0);
  }, [dates, filteredProfiles, getBranchName, getEmployeeDayTotalHours, isHR, rangeMode]);

  const weeklyEmployeeColumns = useMemo(
    () => weeklyGroupedColumns.flatMap((group) => group.employees),
    [weeklyGroupedColumns],
  );

  const handleCellClick = (userId: string, date: string, slotKey: string) => {
    const cellKey = `${userId}_${date}_${slotKey}`;
    const currentVal = displayMatrix[userId]?.[`${date}_${slotKey}`] || '';
    const originalVal = matrix[userId]?.[`${date}_${slotKey}`] || '';

    // Cycle: '' -> '1' -> '1.25' -> 'off' -> ''
    const cycle: CellValue[] = ['', '1', '1.25', 'off'];
    const nextIdx = (cycle.indexOf(currentVal) + 1) % cycle.length;
    const newVal = cycle[nextIdx];

    if (newVal === originalVal) {
      // Remove draft if back to original
      setDrafts(prev => {
        const next = new Map(prev);
        next.delete(cellKey);
        return next;
      });
    } else {
      setDrafts(prev => {
        const next = new Map(prev);
        next.set(cellKey, { userId, date, slotKey, value: newVal, originalValue: originalVal });
        return next;
      });
    }
  };

  const handleSave = () => {
    if (drafts.size === 0) {
      toast.info('Không có thay đổi nào');
      return;
    }

    // Find affected employees
    const affectedUserIds = new Set<string>();
    for (const [, draft] of drafts) {
      affectedUserIds.add(draft.userId);
    }

    const affectedEmployees: { name: string; userId: string; currentEdits: number; newEdits: number; penalty: number }[] = [];

    for (const uid of affectedUserIds) {
      const currentEdits = editLogs[uid] || 0;
      const newEdits = currentEdits + 1;
      const profile = profiles.find(p => p.user_id === uid);
      
      if (newEdits > FREE_EDITS) {
        affectedEmployees.push({
          name: profile?.name || uid.slice(0, 8),
          userId: uid,
          currentEdits,
          newEdits,
          penalty: PENALTY_PER_EDIT, // penalty for THIS edit
        });
      }
    }

    if (affectedEmployees.length > 0) {
      setPenaltyWarning({ affectedEmployees });
    } else {
      executeSave();
    }
  };

  const openAssignDialog = () => {
    setAssignUserId('');
    setAssignDate(format(weekStart, 'yyyy-MM-dd'));
    setAssignStart('15:00');
    setAssignEnd('23:00');
    setAssignOpen(true);
  };

  const openDeleteDialog = () => {
    setDeleteShiftId('');
    setDeleteReason('');
    setDeleteOpen(true);
  };

  const handleDeleteShift = async () => {
    if (!deleteShiftId) {
      toast.error('Vui lòng chọn ca cần hủy');
      return;
    }
    const target = shifts.find(s => s.id === deleteShiftId);
    if (!target) {
      toast.error('Không tìm thấy ca');
      return;
    }
    setDeleting(true);
    try {
      const profile = profiles.find(p => p.user_id === target.user_id);
      const { error } = await supabase.from('shifts').delete().eq('id', deleteShiftId);
      if (error) throw error;

      if (profile?.email) {
        const [y, m, d] = target.shift_date.split('-');
        const startHHMM = target.start_time.slice(0, 5);
        const endHHMM = target.end_time.slice(0, 5);
        invokeTransactionalEmail({
          body: {
            templateName: 'shift-cancelled',
            recipientEmail: profile.email,
            idempotencyKey: `shift-cancel-${deleteShiftId}`,
            templateData: {
              name: profile.name,
              shiftDate: `${d}/${m}/${y}`,
              startTime: startHHMM,
              endTime: endHHMM,
              cancelledBy: user?.name || (isHR ? 'HR' : 'Quản trị viên'),
              reason: deleteReason.trim() || undefined,
            },
          },
        }).catch((emailErr) => {
          console.warn('Shift cancel email failed:', emailErr);
        });
      }

      toast.success(`Đã hủy ca của ${profile?.name || 'nhân viên'} & gửi email thông báo`);
      setDeleteOpen(false);
      await fetchData();
    } catch (e: any) {
      toast.error('Lỗi: ' + (e?.message || 'Không thể hủy ca'));
    } finally {
      setDeleting(false);
    }
  };

  const handleAssignShift = async () => {
    if (!assignUserId || !assignDate || !assignStart || !assignEnd) {
      toast.error('Vui lòng chọn đầy đủ thông tin');
      return;
    }
    // Validate giờ: cho phép overnight (end < start), nhưng không được trùng nhau
    if (assignStart === assignEnd) {
      toast.error('Giờ bắt đầu và kết thúc không được trùng nhau');
      return;
    }
    setAssigning(true);
    try {
      const profile = profiles.find(p => p.user_id === assignUserId);

      // Kiểm tra ca trùng (UPSERT-style: nếu nhân viên đã có ca cùng ngày + cùng khung giờ → báo lỗi)
      const { data: existing } = await supabase
        .from('shifts')
        .select('id, start_time, end_time')
        .eq('user_id', assignUserId)
        .eq('shift_date', assignDate);

      if (existing && existing.length > 0) {
        const dup = existing.find(s =>
          s.start_time.slice(0, 5) === assignStart && s.end_time.slice(0, 5) === assignEnd
        );
        if (dup) {
          toast.error('Nhân viên đã có ca trùng khung giờ này.');
          setAssigning(false);
          return;
        }
      }

      const { error } = await supabase.from('shifts').insert({
        user_id: assignUserId,
        shift_date: assignDate,
        start_time: assignStart + ':00',
        end_time: assignEnd + ':00',
        shift_type: 'FULL_TIME_8H',
      });
      if (error) throw error;

      // Đóng dialog NGAY → tránh cảm giác đơ
      setAssignOpen(false);
      toast.success(`Đã thêm ca cho ${profile?.name || 'nhân viên'}`);

      // Email gửi non-blocking — chạy nền, không await
      if (profile?.email) {
        const [y, m, d] = assignDate.split('-');
        invokeTransactionalEmail({
          body: {
            templateName: 'shift-assigned',
            recipientEmail: profile.email,
            idempotencyKey: `shift-assign-${assignUserId}-${assignDate}-${assignStart}`,
            templateData: {
              name: profile.name,
              shiftDate: `${d}/${m}/${y}`,
              startTime: assignStart,
              endTime: assignEnd,
              assignedBy: user?.name || (isHR ? 'Quản lý' : 'HR'),
            },
          },
        }).catch((emailErr) => {
          console.warn('Email gửi lỗi (non-blocking):', emailErr);
        });
      }

      // Refresh dữ liệu nền
      fetchData().catch((e) => console.warn('Refresh data lỗi:', e));
    } catch (e: any) {
      toast.error('Lỗi khi thêm ca: ' + (e?.message || 'Vui lòng thử lại'));
    } finally {
      setAssigning(false);
    }
  };

  const executeSave = async () => {
    setPenaltyWarning(null);
    setSaving(true);

    try {
      // Group drafts by user
      const changesByUser = new Map<string, DraftChange[]>();
      for (const [, draft] of drafts) {
        if (!changesByUser.has(draft.userId)) changesByUser.set(draft.userId, []);
        changesByUser.get(draft.userId)!.push(draft);
      }

      const currentMonth = getCurrentMonth();

      for (const [userId, changes] of changesByUser) {
        // For each user, we need to rebuild their shifts for the affected dates
        const affectedDates = new Set(changes.map(c => c.date));

        for (const dateStr of affectedDates) {
          // Snapshot old shifts (for email diff) before we delete
          const { data: oldShifts, error: oldErr } = await supabase
            .from('shifts')
            .select('id, start_time, end_time')
            .eq('user_id', userId)
            .eq('shift_date', dateStr);
          if (oldErr) {
            console.warn('Load old shifts failed:', oldErr);
          }

          // Delete existing shifts for this user on this date
          await supabase.from('shifts').delete().eq('user_id', userId).eq('shift_date', dateStr);

          // Build new shifts from the display matrix for this date
          const cells = displayMatrix[userId];
          if (!cells) continue;

          // Group consecutive '1' or '1.25' slots into shifts
          const daySlots = TIME_SLOTS.map(slot => ({
            slot,
            value: cells[`${dateStr}_${slot}`] || '',
          }));

          const newSegments: Array<{ start: string; end: string }> = [];
          let shiftStart: string | null = null;
          let shiftEnd: string | null = null;

          for (let i = 0; i < daySlots.length; i++) {
            const { slot, value } = daySlots[i];
            const [start, end] = slot.split('-');

            if (value === '1' || value === '1.25') {
              if (!shiftStart) shiftStart = start;
              shiftEnd = end;
            } else {
              if (shiftStart && shiftEnd) {
                newSegments.push({ start: shiftStart, end: shiftEnd });
                shiftStart = null;
                shiftEnd = null;
              }
            }
          }
          // Final flush
          if (shiftStart && shiftEnd) {
            newSegments.push({ start: shiftStart, end: shiftEnd });
          }

          // Insert rebuilt shifts
          for (const seg of newSegments) {
            await supabase.from('shifts').insert({
              user_id: userId,
              shift_date: dateStr,
              start_time: seg.start + ':00',
              end_time: seg.end + ':00',
              shift_type: 'FULL_TIME_8H',
            });
          }

          // Send email notifications for diffs (non-blocking best-effort)
          const profile = profiles.find(p => p.user_id === userId);
          if (profile?.email) {
            const [y, m, d] = dateStr.split('-');
            const shiftDateVi = `${d}/${m}/${y}`;
            const oldKeySet = new Set(
              (oldShifts || []).map((s: any) => `${String(s.start_time).slice(0, 5)}-${String(s.end_time).slice(0, 5)}`)
            );
            const newKeySet = new Set(newSegments.map((s) => `${s.start}-${s.end}`));

            // Added segments
            for (const seg of newSegments) {
              const key = `${seg.start}-${seg.end}`;
              if (oldKeySet.has(key)) continue;
              invokeTransactionalEmail({
                body: {
                  templateName: 'shift-assigned',
                  recipientEmail: profile.email,
                  idempotencyKey: `bulk-assign-${userId}-${dateStr}-${seg.start}-${seg.end}`,
                  templateData: {
                    name: profile.name,
                    shiftDate: shiftDateVi,
                    startTime: seg.start,
                    endTime: seg.end,
                    assignedBy: user?.name || (isHR ? 'Quản lý' : 'HR'),
                  },
                },
              }).catch((emailErr) => console.warn('Bulk assign email failed:', emailErr));
            }

            // Removed segments
            for (const old of oldShifts || []) {
              const start = String((old as any).start_time).slice(0, 5);
              const end = String((old as any).end_time).slice(0, 5);
              const key = `${start}-${end}`;
              if (newKeySet.has(key)) continue;
              invokeTransactionalEmail({
                body: {
                  templateName: 'shift-cancelled',
                  recipientEmail: profile.email,
                  idempotencyKey: `bulk-cancel-${userId}-${dateStr}-${start}-${end}`,
                  templateData: {
                    name: profile.name,
                    shiftDate: shiftDateVi,
                    startTime: start,
                    endTime: end,
                    cancelledBy: user?.name || (isHR ? 'Quản lý' : 'Quản trị viên'),
                    reason: 'Điều chỉnh lịch ca',
                  },
                },
              }).catch((emailErr) => console.warn('Bulk cancel email failed:', emailErr));
            }
          }
        }

        // Update edit log for this employee
        const currentEdits = editLogs[userId] || 0;
        const newEdits = currentEdits + 1;
        const totalPenalty = calculatePenalty(newEdits);

        const { data: existing } = await supabase
          .from('shift_edit_logs')
          .select('id')
          .eq('employee_id', userId)
          .eq('edit_month', currentMonth)
          .maybeSingle();

        if (existing) {
          await (supabase.from('shift_edit_logs') as any).update({
            edit_count: newEdits,
            penalty_amount: totalPenalty,
            edited_by: user!.id,
          }).eq('id', existing.id);
        } else {
          await supabase.from('shift_edit_logs').insert({
            employee_id: userId,
            edited_by: user!.id,
            edit_month: currentMonth,
            edit_count: newEdits,
            penalty_amount: totalPenalty,
          } as any);
        }
      }

      toast.success(`Đã lưu ${drafts.size} thay đổi thành công`);
      await fetchData();
    } catch (e: any) {
      toast.error('Lỗi khi lưu: ' + (e?.message || 'Unknown'));
    } finally {
      setSaving(false);
    }
  };

  const resetDrafts = () => {
    setDrafts(new Map());
    toast.info('Đã hủy tất cả thay đổi');
  };

  const cellBg = (value: string, isDraft: boolean) => {
    if (isDraft) return 'bg-yellow-100 dark:bg-yellow-900/40 border-yellow-400';
    if (value === '1') return 'bg-primary/15 text-primary';
    if (value === '1.25') return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
    if (value === 'off') return 'bg-destructive/10 text-destructive';
    if (value && Number(value) > 0) {
      return Number(value) > 1 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-primary/15 text-primary';
    }
    return 'bg-background';
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end">
        <div className="flex-1 min-w-0 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="Tìm nhân viên..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isHR && (
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-full sm:w-[160px] h-9 text-xs">
                <SelectValue placeholder="Chi nhánh" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả chi nhánh</SelectItem>
                {branches.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.branch_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Range mode tabs */}
          <div className="flex rounded-md border bg-background p-0.5">
            {(['day', 'week', 'month'] as RangeMode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setRangeMode(m)}
                className={cn(
                  'px-2.5 h-8 text-xs font-medium rounded transition-colors',
                  rangeMode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {m === 'day' ? 'Ngày' : m === 'week' ? 'Tuần' : 'Tháng'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-9 w-8" onClick={() => navigateRange(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs flex-1 sm:flex-none">
                  <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                  {rangeLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={selectedDate} onSelect={d => d && setSelectedDate(d)} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" className="h-9 w-8" onClick={() => navigateRange(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><span className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-primary/15 border" /> 1 giờ</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-amber-100 dark:bg-amber-900/30 border" /> 1.25</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-destructive/10 border" /> Off</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-yellow-100 dark:bg-yellow-900/40 border border-yellow-400" /> Chưa lưu</span>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={openAssignDialog}>
            <UserPlus className="h-3.5 w-3.5" /> Thêm ca cho NV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive" onClick={openDeleteDialog} disabled={shifts.length === 0}>
            <Trash2 className="h-3.5 w-3.5" /> Hủy ca
          </Button>
          {drafts.size > 0 && (
            <>
              <Badge variant="secondary" className="text-xs">{drafts.size} thay đổi</Badge>
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={resetDrafts}>
                <RotateCcw className="h-3.5 w-3.5" /> Hủy
              </Button>
            </>
          )}
          <Button size="sm" className="gap-1.5 ml-auto sm:ml-0" onClick={handleSave} disabled={saving || drafts.size === 0}>
            <Save className="h-4 w-4" />
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
        </div>
      </div>

      {/* Matrix Table */}
      {isHR && rangeMode === 'week' ? (
        <div className="border rounded-lg overflow-auto max-h-[70vh] max-w-full overscroll-x-contain">
          <table className="text-xs border-collapse min-w-max">
            <thead className="sticky top-0 z-30 bg-card">
              <tr className="border-b">
                <th className="sticky top-0 left-0 z-50 bg-card border-r px-2 py-1.5 text-left font-medium text-muted-foreground min-w-[100px]">
                  Khung giờ
                </th>
                {weeklyGroupedColumns.map((group) => (
                  <th key={group.dateStr} colSpan={group.employees.length} className="sticky top-0 z-40 bg-card border-r px-2 py-1.5 text-center font-semibold min-w-[112px]">
                    {format(group.date, 'EEEE', { locale: vi })}
                    <div className="text-[10px] font-normal text-muted-foreground">
                      {format(group.date, 'dd/MM/yyyy')}
                    </div>
                  </th>
                ))}
              </tr>
              <tr className="border-b">
                <th className="sticky top-[37px] left-0 z-50 bg-card border-r px-2 py-1 text-left text-muted-foreground font-normal">
                  Nhân viên
                </th>
                {weeklyEmployeeColumns.map((column) => (
                  <th key={`${column.date}_${column.userId}_name`} className="sticky top-[37px] z-40 bg-card border-r px-2 py-1 text-center font-medium min-w-[112px]">
                    {column.employeeName}
                  </th>
                ))}
              </tr>
              <tr className="border-b">
                <th className="sticky top-[69px] left-0 z-50 bg-card border-r px-2 py-1 text-left text-muted-foreground font-normal">
                  Chi nhánh
                </th>
                {weeklyEmployeeColumns.map((column) => (
                  <th key={`${column.date}_${column.userId}_branch`} className="sticky top-[69px] z-40 bg-card border-r px-2 py-1 text-center font-normal text-muted-foreground min-w-[112px]">
                    {column.branchName}
                  </th>
                ))}
              </tr>
              <tr className="border-b bg-muted/30">
                <th className="sticky top-[101px] left-0 z-50 bg-muted/30 border-r px-2 py-1 text-left text-muted-foreground font-normal">
                  Tổng giờ
                </th>
                {weeklyEmployeeColumns.map((column) => (
                  <th key={`${column.date}_${column.userId}_hours`} className="sticky top-[101px] z-40 bg-muted/30 border-r px-2 py-1 text-center font-bold text-primary min-w-[112px]">
                    {formatDisplayHours(column.totalHours)}h
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((slot) => (
                <tr key={slot} className="border-b hover:bg-muted/20">
                  <td className="sticky left-0 z-20 bg-card border-r px-2 py-1 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                    {slot}
                  </td>
                  {weeklyEmployeeColumns.map((column) => {
                    const draftKey = `${column.userId}_${column.date}_${slot}`;
                    const renderedCell = getRenderedCellState(column.userId, column.date, slot);
                    const isDraft = drafts.has(draftKey);

                    return (
                      <td
                        key={`${column.date}_${column.userId}_${slot}`}
                        className={cn(
                          'border-r px-0.5 py-0.5 text-center cursor-pointer select-none transition-colors min-w-[112px]',
                          cellBg(renderedCell.isOff ? 'off' : renderedCell.rawValue, isDraft),
                          'hover:ring-1 hover:ring-primary/50'
                        )}
                        onClick={() => handleCellClick(column.userId, column.date, slot)}
                        title={`${column.employeeName} - ${format(new Date(column.date), 'dd/MM')} ${slot}`}
                      >
                        <span className="text-[10px] font-mono">
                          {renderedCell.displayText}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border rounded-lg overflow-auto max-h-[70vh]" style={{ maxWidth: '100%' }}>
        <table className="text-xs border-collapse min-w-max">
          <thead className="sticky top-0 z-20 bg-card">
            {/* Row 1: Employee names */}
            <tr className="border-b">
              <th className="sticky left-0 z-30 bg-card border-r px-2 py-1.5 text-left font-medium text-muted-foreground min-w-[100px]">
                Khung giờ
              </th>
              {filteredProfiles.map(p => {
                // Find any active assignment touching this user in the current week
                const userAssignments = assignments.filter((a) => a.employee_id === p.user_id);
                const incomingAssign = userAssignments.find((a) => a.to_branch_id !== p.branch_id); // currently lent in (home != to)
                return (
                  <th key={p.user_id} colSpan={dates.length} className="px-2 py-1.5 text-center font-medium border-r">
                    <span className="inline-flex items-center gap-1">
                      {p.name}
                      {incomingAssign && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition-colors p-0.5"
                              title="Nhân viên biệt phái"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ArrowLeftRight className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 text-xs space-y-1">
                            <p className="font-semibold text-foreground">Nhân viên biệt phái</p>
                            <p>
                              <span className="text-muted-foreground">Chi nhánh nhà:</span>{' '}
                              <span className="font-medium">{getBranchName(incomingAssign.from_branch_id)}</span>
                            </p>
                            <p>
                              <span className="text-muted-foreground">Đang làm tại:</span>{' '}
                              <span className="font-medium">{getBranchName(incomingAssign.to_branch_id)}</span>
                            </p>
                            <p>
                              <span className="text-muted-foreground">Kỳ hạn:</span>{' '}
                              {format(new Date(incomingAssign.start_date), 'dd/MM')} – {format(new Date(incomingAssign.end_date), 'dd/MM/yyyy')}
                            </p>
                          </PopoverContent>
                        </Popover>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
            {/* Row 2: Branch */}
            <tr className="border-b">
              <th className="sticky left-0 z-30 bg-card border-r px-2 py-1 text-left text-muted-foreground font-normal">
                Chi nhánh
              </th>
              {filteredProfiles.map(p => (
                <th key={p.user_id} colSpan={dates.length} className="px-2 py-1 text-center font-normal text-muted-foreground border-r text-[10px]">
                  {getBranchName(p.branch_id)}
                </th>
              ))}
            </tr>
            {/* Row 3: Total hours */}
            <tr className="border-b">
              <th className="sticky left-0 z-30 bg-card border-r px-2 py-1 text-left text-muted-foreground font-normal">
                Tổng giờ
              </th>
              {filteredProfiles.map(p => (
                <th key={p.user_id} colSpan={dates.length} className="px-2 py-1 text-center font-bold text-primary border-r">
                  {formatDisplayHours(getEmployeeTotalHours(p.user_id))}h
                </th>
              ))}
            </tr>
            {/* Row 4: Day headers per employee */}
            <tr className="border-b bg-muted/30">
              <th className="sticky left-0 z-30 bg-muted/30 border-r px-2 py-1 text-left text-muted-foreground font-normal">
                Ngày
              </th>
              {filteredProfiles.map(p =>
                dates.map(d => (
                  <th key={`${p.user_id}_${format(d, 'yyyy-MM-dd')}`} className="px-1 py-1 text-center font-normal text-[10px] text-muted-foreground border-r min-w-[32px]">
                    {format(d, 'EEE', { locale: vi })}
                    <br />
                    {format(d, 'dd')}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map(slot => (
              <tr key={slot} className="border-b hover:bg-muted/20">
                <td className="sticky left-0 z-10 bg-card border-r px-2 py-1 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                  {slot}
                </td>
                {filteredProfiles.map(p =>
                  dates.map(d => {
                    const dateStr = format(d, 'yyyy-MM-dd');
                    const draftKey = `${p.user_id}_${dateStr}_${slot}`;
                    const renderedCell = getRenderedCellState(p.user_id, dateStr, slot);
                    const isDraft = drafts.has(draftKey);

                    return (
                      <td
                        key={`${p.user_id}_${dateStr}_${slot}`}
                        className={cn(
                          'border-r px-0.5 py-0.5 text-center cursor-pointer select-none transition-colors min-w-[32px]',
                          cellBg(renderedCell.isOff ? 'off' : renderedCell.rawValue, isDraft),
                          'hover:ring-1 hover:ring-primary/50'
                        )}
                        onClick={() => handleCellClick(p.user_id, dateStr, slot)}
                        title={`${p.name} - ${format(d, 'dd/MM')} ${slot}`}
                      >
                        <span className="text-[10px] font-mono">
                          {renderedCell.displayText}
                        </span>
                      </td>
                    );
                  })
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* Penalty warning dialog */}
      <AlertDialog open={!!penaltyWarning} onOpenChange={open => !open && setPenaltyWarning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">⚠️ Cảnh báo phạt sửa ca</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Các nhân viên sau sẽ bị phạt khi lưu thay đổi này:</p>
                <div className="space-y-2">
                  {penaltyWarning?.affectedEmployees.map((emp, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{emp.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Đã sửa ca {emp.currentEdits} lần trong tháng (miễn phí: {FREE_EDITS} lần)
                        </p>
                      </div>
                      <Badge variant="destructive" className="text-xs">
                        Phạt {formatVND(emp.penalty)}
                      </Badge>
                    </div>
                  ))}
                </div>
                <p className="text-sm font-medium">Bạn có chắc muốn tiếp tục lưu?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={executeSave} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Xác nhận lưu & phạt
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign shift dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm ca làm cho nhân viên</DialogTitle>
            <DialogDescription>
              Xếp ca cho nhân viên không có lịch trong tuần. Hệ thống sẽ gửi email thông báo cho họ.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="assign-emp">Nhân viên</Label>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger id="assign-emp">
                  <SelectValue placeholder="Chọn nhân viên..." />
                </SelectTrigger>
                <SelectContent>
                  {assignableProfiles.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                      Không còn nhân viên nào để xếp ca
                    </div>
                  ) : (
                    assignableProfiles.map(p => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.name} {p.email ? <span className="text-muted-foreground text-xs">· {p.email}</span> : null}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-date">Ngày làm</Label>
              <Select value={assignDate} onValueChange={setAssignDate}>
                <SelectTrigger id="assign-date">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dates.map(d => {
                    const ds = format(d, 'yyyy-MM-dd');
                    return (
                      <SelectItem key={ds} value={ds}>
                        {format(d, 'EEEE, dd/MM/yyyy', { locale: vi })}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="assign-start">Giờ bắt đầu</Label>
                <Input id="assign-start" type="time" value={assignStart} onChange={e => setAssignStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assign-end">Giờ kết thúc</Label>
                <Input id="assign-end" type="time" value={assignEnd} onChange={e => setAssignEnd(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assigning}>Hủy</Button>
            <Button onClick={handleAssignShift} disabled={assigning || !assignUserId} className="gap-1.5">
              {assigning ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang lưu...</> : <><UserPlus className="h-4 w-4" /> Thêm & gửi email</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete shift dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hủy ca làm của nhân viên</DialogTitle>
            <DialogDescription>
              Chọn ca cần hủy. Hệ thống sẽ xóa ca khỏi lịch và gửi email thông báo cho nhân viên.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="del-shift">Ca làm cần hủy</Label>
              <Select value={deleteShiftId} onValueChange={setDeleteShiftId}>
                <SelectTrigger id="del-shift">
                  <SelectValue placeholder="Chọn ca..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {shifts.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                      Tuần này không có ca nào
                    </div>
                  ) : (
                    [...shifts]
                      .sort((a, b) => a.shift_date.localeCompare(b.shift_date) || a.start_time.localeCompare(b.start_time))
                      .map(s => {
                        const p = profiles.find(pr => pr.user_id === s.user_id);
                        const [y, m, d] = s.shift_date.split('-');
                        return (
                          <SelectItem key={s.id} value={s.id}>
                            {p?.name || s.user_id.slice(0, 8)} · {d}/{m} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                          </SelectItem>
                        );
                      })
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="del-reason">Lý do hủy <span className="text-muted-foreground text-xs">(tùy chọn)</span></Label>
              <Textarea
                id="del-reason"
                placeholder="VD: Sắp xếp lại lịch, nhân viên xin nghỉ..."
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Đóng</Button>
            <Button variant="destructive" onClick={handleDeleteShift} disabled={deleting || !deleteShiftId} className="gap-1.5">
              {deleting ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang hủy...</> : <><Trash2 className="h-4 w-4" /> Hủy ca & gửi email</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {filteredProfiles.length === 0 && (
        <div className="text-center text-muted-foreground py-8 text-sm">
          Tuần này chưa có nhân viên nào đăng ký ca làm
        </div>
      )}
    </div>
  );
}


