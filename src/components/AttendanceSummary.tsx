import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, UserCheck, UserX, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

interface ShiftData {
  id: string;
  user_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
}

interface CheckInData {
  user_id: string;
  check_in_time: string;
  check_out_time: string | null;
  shift_id: string | null;
}

interface Props {
  shifts: ShiftData[];
  checkIns: CheckInData[];
  profiles: Record<string, string>;
  profileBranches: Record<string, string>;
  branches: { id: string; branch_name: string }[];
  branchFilter: string;
}

interface IssueUser {
  userId: string;
  name: string;
  branch: string;
  issues: string[];
  severity: 'critical' | 'warning' | 'info';
}

export default function AttendanceSummary({ shifts, checkIns, profiles, profileBranches, branches, branchFilter }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);
  const today = format(new Date(), 'yyyy-MM-dd');
  const now = new Date(); // eslint-disable-line

  const summary = useMemo(() => {
    let todayShifts = shifts.filter(s => s.shift_date === today);
    if (branchFilter !== 'all') {
      todayShifts = todayShifts.filter(s => profileBranches[s.user_id] === branchFilter);
    }

    const registeredUsers = new Set(todayShifts.map(s => s.user_id));

    const todayCheckIns = checkIns.filter(ci => {
      const ciDate = format(new Date(ci.check_in_time), 'yyyy-MM-dd');
      return ciDate === today;
    });

    const checkedInUsers = new Set(todayCheckIns.map(ci => ci.user_id));
    const checkedInShiftIds = new Set(todayCheckIns.map(ci => ci.shift_id).filter(Boolean));

    // Build per-shift status with time awareness
    const issueUsers: IssueUser[] = [];
    let fullyDoneCount = 0;

    registeredUsers.forEach(uid => {
      const userShifts = todayShifts.filter(s => s.user_id === uid);
      const userCheckIns = todayCheckIns.filter(ci => ci.user_id === uid);
      const branchId = profileBranches[uid];
      const branchName = branches.find(b => b.id === branchId)?.branch_name || '';
      const name = profiles[uid] || uid.slice(0, 8);

      const issues: string[] = [];
      let allDone = true;
      let maxSeverity: 'critical' | 'warning' | 'info' = 'info';

      for (const shift of userShifts) {
        const shiftStart = new Date(`${today}T${shift.start_time}`);
        const shiftEnd = new Date(`${today}T${shift.end_time}`);
        const hasCheckedIn = checkedInShiftIds.has(shift.id);
        const matchingCI = userCheckIns.find(ci => ci.shift_id === shift.id);
        const hasCheckedOut = matchingCI?.check_out_time != null;

        // Only flag missing check-in if shift start time has passed
        if (!hasCheckedIn && now >= shiftStart) {
          const minsLate = Math.floor((now.getTime() - shiftStart.getTime()) / 60000);
          issues.push(`Chưa checkin ca ${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)} (trễ ${minsLate}p)`);
          maxSeverity = 'critical';
          allDone = false;
        } else if (!hasCheckedIn && now < shiftStart) {
          // Shift hasn't started yet — not an issue
          allDone = false;
        } else if (hasCheckedIn && !hasCheckedOut) {
          if (now >= shiftEnd) {
            // Shift ended but no checkout
            const minsOver = Math.floor((now.getTime() - shiftEnd.getTime()) / 60000);
            issues.push(`Chưa checkout ca ${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)} (quá ${minsOver}p)`);
            if (maxSeverity !== 'critical') maxSeverity = 'warning';
            allDone = false;
          } else {
            // Still working — not done yet but not an issue
            allDone = false;
          }
        }
        // hasCheckedIn && hasCheckedOut => this shift is complete
      }

      if (allDone && userShifts.length > 0 && issues.length === 0) {
        // Check if ALL shifts actually completed (checkin + checkout)
        const allShiftsComplete = userShifts.every(s => {
          const ci = userCheckIns.find(c => c.shift_id === s.id);
          return ci && ci.check_out_time;
        });
        if (allShiftsComplete) fullyDoneCount++;
      }

      if (issues.length > 0) {
        issueUsers.push({ userId: uid, name, branch: branchName, issues, severity: maxSeverity });
      }
    });

    // Sort: critical first, then warning
    issueUsers.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    return {
      totalRegistered: registeredUsers.size,
      totalShifts: todayShifts.length,
      checkedInCount: [...registeredUsers].filter(uid => checkedInUsers.has(uid)).length,
      fullyDone: fullyDoneCount,
      issueUsers,
    };
  }, [shifts, checkIns, profiles, profileBranches, branches, branchFilter, today, tick]);

  const hasIssues = summary.issueUsers.length > 0;
  const criticalCount = summary.issueUsers.filter(u => u.severity === 'critical').length;
  const warningCount = summary.issueUsers.filter(u => u.severity === 'warning').length;

  return (
    <Card className={`border-primary/20 ${hasIssues ? 'bg-destructive/5 border-destructive/20' : 'bg-primary/5'}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Tổng hợp hôm nay — {format(new Date(), 'dd/MM/yyyy HH:mm')}
            </h3>
            {hasIssues && (
              <Badge variant="destructive" className="text-[10px] h-5">
                {summary.issueUsers.length} cần xử lý
              </Badge>
            )}
          </div>
          {hasIssues && (
            <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {expanded ? 'Thu gọn' : 'Chi tiết'}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{summary.totalRegistered}</p>
              <p className="text-[11px] text-muted-foreground">Đăng ký ({summary.totalShifts} ca)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
              <UserCheck className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{summary.checkedInCount}</p>
              <p className="text-[11px] text-muted-foreground">Đã checkin</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{summary.fullyDone}</p>
              <p className="text-[11px] text-muted-foreground">Hoàn thành</p>
            </div>
          </div>
          {criticalCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                <UserX className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="text-lg font-bold text-destructive">{criticalCount}</p>
                <p className="text-[11px] text-muted-foreground">Chưa checkin</p>
              </div>
            </div>
          )}
          {warningCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-amber-600">{warningCount}</p>
                <p className="text-[11px] text-muted-foreground">Chưa checkout</p>
              </div>
            </div>
          )}
        </div>

        {expanded && hasIssues && (
          <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
            {summary.issueUsers.map(u => (
              <div key={u.userId} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${u.severity === 'critical' ? 'text-destructive' : 'text-amber-600'}`}>
                    {u.severity === 'critical' ? '🚫' : '⚠️'} {u.name}
                  </span>
                  {u.branch && <span className="text-[10px] text-muted-foreground">({u.branch})</span>}
                </div>
                <div className="flex flex-wrap gap-1 pl-4">
                  {u.issues.map((issue, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className={`text-[11px] ${u.severity === 'critical' ? 'border-destructive/30 text-destructive' : 'border-amber-500/30 text-amber-600'}`}
                    >
                      {issue}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!hasIssues && summary.totalRegistered > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Tất cả nhân viên đang chấm công bình thường
          </div>
        )}
      </CardContent>
    </Card>
  );
}
