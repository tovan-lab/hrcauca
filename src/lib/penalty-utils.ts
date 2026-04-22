/**
 * 3-Strike Penalty Engine
 * Rule: 2 free edits/month, 20,000 VND penalty per edit from 3rd onwards
 */

const FREE_EDITS = 2;
const PENALTY_PER_EDIT = 20000;

export function calculatePenalty(editCount: number): number {
  if (editCount <= FREE_EDITS) return 0;
  return (editCount - FREE_EDITS) * PENALTY_PER_EDIT;
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function formatVND(amount: number): string {
  return amount.toLocaleString('vi-VN') + 'đ';
}

export { FREE_EDITS, PENALTY_PER_EDIT };
