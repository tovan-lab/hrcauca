import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { CalendarClock, Trash2, Plus, Pencil, Check, X, Clock, Lock, Moon, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfWeek, addDays, addWeeks, isBefore, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { calcShiftHours, calcEffectiveHours, formatHours, isOvernightShift } from '@/lib/shift-utils';

type ShiftType = 'PART_TIME_4H' | 'FULL_TIME_8H';

interface Shift {
  id: string;
  shift_date: string;
  shift_type: ShiftType;
  start_time: string;
  end_time: string;
}

const DAY_NAMES = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
const DAY_NAMES_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export function ShiftRegistration() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isHR = user?.role === 'HR';
  const canEditLocked = isAdmin || isHR;

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [dayForms, setDayForms] = useState<Record<string, { start: string; end: string }>>({});
  const [editingShift, setEditingShift] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [weekOffset, setWeekOffset] = useState(0);

  // Current week start (Monday)
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  // The displayed week
  const displayedWeekStart = addWeeks(currentWeekStart, weekOffset);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(displayedWeekStart, i));

  // Lock logic: current week and past weeks are locked for employees
  // Employees can only register for next week onwards
  const isWeekLocked = !canEditLocked && isBefore(displayedWeekStart, addWeeks(currentWeekStart, 1));

  const fetchShifts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const from = format(weekDays[0], 'yyyy-MM-dd');
    const to = format(weekDays[6], 'yyyy-MM-dd');
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .eq('user_id', user.id)
      .gte('shift_date', from)
      .lte('shift_date', to)
      .order('shift_date')
      .order('start_time');
    setShifts((data as Shift[]) || []);
    setLoading(false);
  }, [user, weekOffset]);

  useEffect(() => { fetchShifts(); }, [fetchShifts]);

  const deriveShiftType = (start: string, end: string): ShiftType => {
    const hours = calcShiftHours(start, end);
    return hours >= 6 ? 'FULL_TIME_8H' : 'PART_TIME_4H';
  };

  const validateTime = (start: string, end: string, dateStr?: string, excludeShiftId?: string): boolean => {
    if (!start || !end) {
      toast.error('Vui lòng nhập giờ bắt đầu và kết thúc');
      return false;
    }
    const hours = calcShiftHours(start, end);
    if (hours < 1) {
      toast.error('Ca làm phải ít nhất 1 tiếng');
      return false;
    }
    if (hours > 16) {
      toast.error('Ca làm không được quá 16 tiếng');
      return false;
    }
    // Check overlap (simplified for overnight: only check same-day shifts)
    if (dateStr) {
      const dayShifts = getShiftsForDay(dateStr).filter(s => s.id !== excludeShiftId);
      for (const existing of dayShifts) {
        const eStart = existing.start_time.slice(0, 5);
        const eEnd = existing.end_time.slice(0, 5);
        // Simple overlap check (same day context)
        const eIsOvernight = isOvernightShift(eStart, eEnd);
        const newIsOvernight = isOvernightShift(start, end);
        
        if (!eIsOvernight && !newIsOvernight) {
          // Both same-day
          if (start < eEnd && end > eStart) {
            toast.error(`Ca bị trùng với ca ${eStart}–${eEnd}. Vui lòng chọn giờ khác.`);
            return false;
          }
        } else {
          // At least one overnight - check more carefully
          // Convert to minutes from day start, overnight adds 24h
          const toRange = (s: string, e: string) => {
            const [sh, sm] = s.split(':').map(Number);
            const [eh, em] = e.split(':').map(Number);
            let start = sh * 60 + sm;
            let end = eh * 60 + em;
            if (end <= start) end += 24 * 60;
            return [start, end];
          };
          const [s1, e1] = toRange(eStart, eEnd);
          const [s2, e2] = toRange(start, end);
          if (s2 < e1 && e2 > s1) {
            toast.error(`Ca bị trùng với ca ${eStart}–${eEnd}. Vui lòng chọn giờ khác.`);
            return false;
          }
        }
      }
    }
    return true;
  };

  const registerShift = async (date: Date, startTime: string, endTime: string) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    if (!user || !validateTime(startTime, endTime, dateStr)) return;
    setSaving(dateStr);
    const shiftType = deriveShiftType(startTime, endTime);
    const { error } = await supabase.from('shifts').insert({
      user_id: user.id,
      shift_date: dateStr,
      shift_type: shiftType,
      start_time: startTime + ':00',
      end_time: endTime + ':00',
    });
    if (error) {
      toast.error('Lỗi khi đăng ký ca');
    } else {
      const overnight = isOvernightShift(startTime, endTime);
      toast.success(`Đã đăng ký ca ngày ${format(date, 'dd/MM')} (${startTime} – ${endTime}${overnight ? ' +1 ngày' : ''})`);
    }
    setDayForms(prev => { const next = { ...prev }; delete next[dateStr]; return next; });
    await fetchShifts();
    setSaving(null);
  };

  const startEdit = (shift: Shift) => {
    setEditingShift(shift.id);
    setEditForm({ start: shift.start_time.slice(0, 5), end: shift.end_time.slice(0, 5) });
  };

  const saveEdit = async (shift: Shift) => {
    if (!validateTime(editForm.start, editForm.end, shift.shift_date, shift.id)) return;
    setSaving(shift.id);
    const shiftType = deriveShiftType(editForm.start, editForm.end);
    await supabase.from('shifts').update({
      shift_type: shiftType,
      start_time: editForm.start + ':00',
      end_time: editForm.end + ':00',
    }).eq('id', shift.id);
    toast.success('Đã cập nhật ca làm việc');
    setEditingShift(null);
    await fetchShifts();
    setSaving(null);
  };

  const removeShift = async (shiftId: string) => {
    await supabase.from('shifts').delete().eq('id', shiftId);
    toast.success('Đã xóa ca làm việc');
    await fetchShifts();
  };

  const isPast = (date: Date) => isBefore(date, startOfDay(new Date()));
  const isToday = (date: Date) => format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  const updateDayForm = (dateStr: string, field: 'start' | 'end', value: string) => {
    setDayForms(prev => ({ ...prev, [dateStr]: { ...prev[dateStr], [field]: value } }));
  };

  const getShiftsForDay = (dateStr: string) => shifts.filter(s => s.shift_date === dateStr);

  // Calculate weekly total
  const weeklyStats = shifts.reduce((acc, s) => {
    const { totalHours, nightHours, effectiveHours } = calcEffectiveHours(s.start_time.slice(0, 5), s.end_time.slice(0, 5));
    acc.total += totalHours;
    acc.night += nightHours;
    acc.effective += effectiveHours;
    return acc;
  }, { total: 0, night: 0, effective: 0 });

  const TimeInputRow = ({ start, end, onStartChange, onEndChange, onSubmit, onCancel, submitIcon, submitDisabled, submitColor }: {
    start: string; end: string;
    onStartChange: (v: string) => void; onEndChange: (v: string) => void;
    onSubmit: () => void; onCancel?: () => void;
    submitIcon: React.ReactNode; submitDisabled?: boolean; submitColor?: string;
  }) => {
    const overnight = start && end && isOvernightShift(start, end);
    return (
      <div className="space-y-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Input type="time" value={start} onChange={e => onStartChange(e.target.value)}
              className="h-9 flex-1 min-w-0 text-sm" />
            <span className="text-xs text-muted-foreground shrink-0">–</span>
            <Input type="time" value={end} onChange={e => onEndChange(e.target.value)}
              className="h-9 flex-1 min-w-0 text-sm" />
          </div>
          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
            <Button size="icon" variant="outline" className={cn("h-9 w-9", submitColor)} disabled={submitDisabled} onClick={onSubmit}>
              {submitIcon}
            </Button>
            {onCancel && (
              <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onCancel}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {overnight && (
          <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <Moon className="h-3 w-3" />
            Ca qua đêm (kết thúc ngày hôm sau) — {formatHours(calcShiftHours(start, end))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3 px-4 sm:px-6">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-5 w-5 text-primary" />
            Đăng ký ca làm việc
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekOffset(o => o - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="text-xs h-8 px-2" onClick={() => setWeekOffset(canEditLocked ? 0 : 1)}>
              {canEditLocked ? 'Tuần này' : 'Tuần tới'}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekOffset(o => o + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {format(weekDays[0], 'dd/MM')} – {format(weekDays[6], 'dd/MM/yyyy')}
        </p>
        {isWeekLocked && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-2.5 py-1.5 mt-1">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Tuần này đã khóa. Vui lòng đăng ký ca cho tuần tới.
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Hỗ trợ ca qua đêm • Ca sau 00:00 được tính x1.25
        </p>
      </CardHeader>
      <CardContent className="space-y-2 px-3 sm:px-6">
        {/* Weekly summary */}
        {!loading && shifts.length > 0 && (
          <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-muted/50 mb-2">
            <div className="text-xs">
              <span className="text-muted-foreground">Tổng giờ:</span>{' '}
              <span className="font-semibold">{formatHours(weeklyStats.total)}</span>
            </div>
            {weeklyStats.night > 0 && (
              <div className="text-xs">
                <span className="text-muted-foreground">Giờ đêm:</span>{' '}
                <span className="font-semibold text-amber-600">{formatHours(weeklyStats.night)}</span>
              </div>
            )}
            {weeklyStats.night > 0 && (
              <div className="text-xs">
                <span className="text-muted-foreground">Quy đổi:</span>{' '}
                <span className="font-semibold text-primary">{formatHours(weeklyStats.effective)}</span>
              </div>
            )}
            <div className="text-xs">
              <span className="text-muted-foreground">Số ca:</span>{' '}
              <span className="font-semibold">{shifts.length}</span>
            </div>
          </div>
        )}

        {loading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))
        ) : (
          weekDays.map((day, i) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayShifts = getShiftsForDay(dateStr);
            const past = isPast(day);
            const today = isToday(day);
            const form = dayForms[dateStr] || { start: '', end: '' };
            const dayLocked = isWeekLocked || (past && !canEditLocked);
            const canModify = !dayLocked;

            return (
              <div
                key={i}
                className={cn(
                  'rounded-lg border p-3 sm:p-4 transition-colors',
                  dayLocked && 'opacity-60 bg-muted/30',
                  today && !dayLocked && 'border-primary/40 bg-primary/5',
                )}
              >
                {/* Day header */}
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn(
                    'flex items-center justify-center rounded-md h-10 w-10 sm:h-auto sm:w-auto sm:px-0 sm:rounded-none shrink-0',
                    today && 'bg-primary text-primary-foreground sm:bg-transparent sm:text-foreground'
                  )}>
                    <div className="text-center sm:text-left">
                      <p className="text-xs font-bold sm:text-sm sm:font-medium leading-none">
                        <span className="sm:hidden">{DAY_NAMES_SHORT[i]}</span>
                        <span className="hidden sm:inline">{DAY_NAMES[i]}</span>
                      </p>
                      <p className={cn(
                        'text-[10px] sm:text-xs leading-tight mt-0.5',
                        today ? 'sm:text-muted-foreground' : 'text-muted-foreground'
                      )}>
                        {format(day, 'dd/MM')}
                      </p>
                    </div>
                  </div>

                  {dayLocked && dayShifts.length === 0 && (
                    <span className="text-xs text-muted-foreground italic ml-1">Không đăng ký</span>
                  )}

                  {today && (
                    <Badge variant="outline" className="text-[10px] h-5 border-primary/40 text-primary">
                      Hôm nay
                    </Badge>
                  )}

                  {dayLocked && (
                    <Lock className="h-3 w-3 text-muted-foreground ml-auto" />
                  )}
                </div>

                {/* Shifts list */}
                <div className="space-y-2">
                  {dayShifts.map((shift) => {
                    const overnight = isOvernightShift(shift.start_time.slice(0, 5), shift.end_time.slice(0, 5));
                    const { totalHours, nightHours, effectiveHours } = calcEffectiveHours(shift.start_time.slice(0, 5), shift.end_time.slice(0, 5));

                    return (
                      <div key={shift.id}>
                        {editingShift === shift.id ? (
                          <TimeInputRow
                            start={editForm.start}
                            end={editForm.end}
                            onStartChange={v => setEditForm(f => ({ ...f, start: v }))}
                            onEndChange={v => setEditForm(f => ({ ...f, end: v }))}
                            onSubmit={() => saveEdit(shift)}
                            onCancel={() => setEditingShift(null)}
                            submitIcon={<Check className="h-4 w-4" />}
                            submitDisabled={saving === shift.id}
                            submitColor="border-green-500 text-green-600 hover:bg-green-50"
                          />
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs gap-1">
                              <Clock className="h-3 w-3" />
                              {shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}
                              {overnight && <Moon className="h-3 w-3 text-amber-500" />}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {formatHours(totalHours)}
                              {nightHours > 0 && ` (QĐ: ${formatHours(effectiveHours)})`}
                            </Badge>
                            {canModify && (
                              <div className="flex items-center gap-0.5 ml-auto">
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(shift)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeShift(shift.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* New shift form */}
                  {canModify && dayShifts.length === 0 && (
                    <TimeInputRow
                      start={form.start}
                      end={form.end}
                      onStartChange={v => updateDayForm(dateStr, 'start', v)}
                      onEndChange={v => updateDayForm(dateStr, 'end', v)}
                      onSubmit={() => registerShift(day, form.start, form.end)}
                      submitIcon={<Plus className="h-4 w-4" />}
                      submitDisabled={saving === dateStr || !form.start || !form.end}
                    />
                  )}

                  {/* Add split shift button */}
                  {canModify && dayShifts.length > 0 && !dayForms[dateStr] && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground px-2 w-full sm:w-auto justify-center sm:justify-start"
                      onClick={() => setDayForms(prev => ({ ...prev, [dateStr]: { start: '', end: '' } }))}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Thêm ca
                    </Button>
                  )}

                  {/* Split shift form */}
                  {canModify && dayShifts.length > 0 && dayForms[dateStr] && (
                    <TimeInputRow
                      start={form.start}
                      end={form.end}
                      onStartChange={v => updateDayForm(dateStr, 'start', v)}
                      onEndChange={v => updateDayForm(dateStr, 'end', v)}
                      onSubmit={() => registerShift(day, form.start, form.end)}
                      onCancel={() => setDayForms(prev => { const n = { ...prev }; delete n[dateStr]; return n; })}
                      submitIcon={<Plus className="h-4 w-4" />}
                      submitDisabled={saving === dateStr || !form.start || !form.end}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
