/**
 * Branch transfer (biệt phái) utilities.
 *
 * Một ca có 3 cấp ưu tiên cho "actual branch":
 *   1. shift.actual_branch_id (override ở mức ca - cao nhất)
 *   2. branch_assignment đang hiệu lực (start_date <= shift_date <= end_date, status=active)
 *   3. profile.branch_id (home branch)
 */

import { supabase } from '@/integrations/supabase/client';

export interface ShiftLite {
  id?: string;
  user_id: string;
  shift_date: string;
  actual_branch_id?: string | null;
  assignment_id?: string | null;
}

export interface AssignmentLite {
  id: string;
  employee_id: string;
  from_branch_id: string;
  to_branch_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  status: string;
}

/**
 * Resolve actual branch id for a single shift.
 */
export function resolveActualBranch(
  shift: ShiftLite,
  homeBranchByUser: Record<string, string | null>,
  assignments: AssignmentLite[],
): string | null {
  if (shift.actual_branch_id) return shift.actual_branch_id;
  const a = findActiveAssignment(shift.user_id, shift.shift_date, assignments);
  if (a) return a.to_branch_id;
  return homeBranchByUser[shift.user_id] ?? null;
}

export function findActiveAssignment(
  employeeId: string,
  date: string,
  assignments: AssignmentLite[],
): AssignmentLite | null {
  return (
    assignments.find(
      (a) =>
        a.employee_id === employeeId &&
        a.status === 'active' &&
        a.start_date <= date &&
        a.end_date >= date,
    ) ?? null
  );
}

/**
 * For a given branch X, classify employees today/this period as:
 *   - "incoming": home branch != X but currently working at X (lent in)
 *   - "outgoing": home branch == X but currently working elsewhere (lent out)
 */
export interface FluctuationItem {
  employeeId: string;
  homeBranchId: string | null;
  actualBranchId: string | null;
  shiftDate: string;
  shiftId?: string;
}

export function classifyFluctuations(
  branchId: string,
  shifts: ShiftLite[],
  homeBranchByUser: Record<string, string | null>,
  assignments: AssignmentLite[],
): { incoming: FluctuationItem[]; outgoing: FluctuationItem[] } {
  const incoming: FluctuationItem[] = [];
  const outgoing: FluctuationItem[] = [];
  for (const s of shifts) {
    const actual = resolveActualBranch(s, homeBranchByUser, assignments);
    const home = homeBranchByUser[s.user_id] ?? null;
    const item: FluctuationItem = {
      employeeId: s.user_id,
      homeBranchId: home,
      actualBranchId: actual,
      shiftDate: s.shift_date,
      shiftId: s.id,
    };
    if (home !== branchId && actual === branchId) incoming.push(item);
    else if (home === branchId && actual !== branchId && actual !== null) outgoing.push(item);
  }
  return { incoming, outgoing };
}

/**
 * Fetch all data needed to do attribution-based aggregation for a date range.
 */
export async function fetchTransferContext(fromDate: string, toDate: string) {
  const [{ data: profs }, { data: assigns }] = await Promise.all([
    supabase.from('profiles').select('user_id, branch_id, name'),
    supabase
      .from('branch_assignments')
      .select('id, employee_id, from_branch_id, to_branch_id, start_date, end_date, status')
      .eq('status', 'active')
      .lte('start_date', toDate)
      .gte('end_date', fromDate),
  ]);
  const homeBranchByUser: Record<string, string | null> = {};
  const nameByUser: Record<string, string> = {};
  (profs || []).forEach((p: any) => {
    homeBranchByUser[p.user_id] = p.branch_id ?? null;
    nameByUser[p.user_id] = p.name ?? '';
  });
  return {
    homeBranchByUser,
    nameByUser,
    assignments: (assigns as AssignmentLite[]) || [],
  };
}
