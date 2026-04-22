import { Evaluation } from './types';

export type RewardBadge = 'bonus_shift' | 'retrain_warning' | 'critical_3x';

export interface PenaltyRecord {
  id: string;
  employee_id: string;
  hr_id: string;
  date: string;
  type: 'reward' | 'penalty';
  severity?: 'light' | 'medium' | 'heavy';
  amount: number; // positive = reward, negative = penalty
  description: string;
}

export function getEvaluationBadge(score: number): RewardBadge | null {
  if (score > 90) return 'bonus_shift';
  if (score < 70) return 'retrain_warning';
  return null;
}

export function getBadgeInfo(badge: RewardBadge) {
  switch (badge) {
    case 'bonus_shift':
      return { label: 'Thưởng ca (+50k - 100k)', variant: 'default' as const, color: 'text-emerald-600' };
    case 'retrain_warning':
      return { label: 'Đào tạo lại + Cảnh cáo', variant: 'destructive' as const, color: 'text-destructive' };
    case 'critical_3x':
      return { label: 'CẢNH BÁO: 3 lần <70 điểm/tháng - Xem xét cho nghỉ', variant: 'destructive' as const, color: 'text-destructive' };
  }
}

export function checkCriticalMonthlyAlert(evaluations: Evaluation[], employeeId: string): boolean {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthlyLow = evaluations.filter(e => {
    if (e.employee_id !== employeeId) return false;
    const d = new Date(e.evaluation_date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear && e.total_score < 70;
  });

  return monthlyLow.length >= 3;
}

export function getTopPerformers(evaluations: Evaluation[]): { employeeId: string; avgScore: number; count: number }[] {
  const grouped: Record<string, number[]> = {};
  evaluations.forEach(e => {
    if (!grouped[e.employee_id]) grouped[e.employee_id] = [];
    grouped[e.employee_id].push(e.total_score);
  });

  return Object.entries(grouped)
    .map(([employeeId, scores]) => ({
      employeeId,
      avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      count: scores.length,
    }))
    .filter(p => p.avgScore > 90)
    .sort((a, b) => b.avgScore - a.avgScore);
}

export function getNeedsAttention(evaluations: Evaluation[]): { employeeId: string; avgScore: number; lowCount: number }[] {
  const grouped: Record<string, number[]> = {};
  evaluations.forEach(e => {
    if (!grouped[e.employee_id]) grouped[e.employee_id] = [];
    grouped[e.employee_id].push(e.total_score);
  });

  return Object.entries(grouped)
    .map(([employeeId, scores]) => ({
      employeeId,
      avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      lowCount: scores.filter(s => s < 70).length,
    }))
    .filter(p => p.avgScore < 70 || p.lowCount > 0)
    .sort((a, b) => a.avgScore - b.avgScore);
}

export const PENALTY_SEVERITY = [
  { key: 'light' as const, label: 'Nhẹ', range: '-20k đến -50k', min: -50000, max: -20000 },
  { key: 'medium' as const, label: 'Trung bình', range: '-50k đến -100k', min: -100000, max: -50000 },
  { key: 'heavy' as const, label: 'Nặng', range: '-200k + Nghỉ ca', min: -200000, max: -200000 },
];
