import { User, CheckIn, Evaluation } from './types';

export const MOCK_USERS: User[] = [
  { id: '1', name: 'Admin User', email: 'admin@hr.app', role: 'ADMIN', status: 'active', department: 'Management' },
  { id: '2', name: 'HR Manager', email: 'hr@hr.app', role: 'HR', status: 'active', department: 'Human Resources' },
  { id: '3', name: 'Nguyen Van A', email: 'nva@hr.app', role: 'EMPLOYEE', status: 'active', department: 'Operations' },
  { id: '4', name: 'Tran Thi B', email: 'ttb@hr.app', role: 'EMPLOYEE', status: 'active', department: 'Operations' },
  { id: '5', name: 'Le Van C', email: 'lvc@hr.app', role: 'EMPLOYEE', status: 'active', department: 'Kitchen' },
  { id: '6', name: 'Pham Thi D', email: 'ptd@hr.app', role: 'EMPLOYEE', status: 'active', department: 'Operations' },
];

const now = new Date();
const dayMs = 86400000;

export const MOCK_CHECKINS: CheckIn[] = Array.from({ length: 5 }, (_, i) => {
  const d = new Date(now.getTime() - i * dayMs);
  d.setHours(8, Math.floor(Math.random() * 30), 0);
  return {
    id: `ci-${i + 1}`,
    user_id: '3',
    image_url: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="%23${['3b82f6', '6366f1', '0ea5e9', '8b5cf6', '2563eb'][i]}" width="80" height="80"/><text x="40" y="45" text-anchor="middle" fill="white" font-size="12">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i]}</text></svg>`,
    check_in_time: d.toISOString(),
    status: true,
  };
});

// Seed evaluations for the past 2 weeks
function seedEvaluations(): Evaluation[] {
  const evals: Evaluation[] = [];
  const employees = ['3', '4', '5', '6'];
  const scoreProfiles: Record<string, number[]> = {
    '3': [92, 88, 95, 91, 85, 93, 90],
    '4': [65, 72, 60, 68, 55, 70, 62],
    '5': [78, 82, 80, 75, 84, 79, 81],
    '6': [85, 90, 88, 92, 87, 91, 86],
  };

  employees.forEach(empId => {
    const scores = scoreProfiles[empId];
    scores.forEach((score, i) => {
      const d = new Date(now.getTime() - i * dayMs);
      evals.push({
        id: `eval-seed-${empId}-${i}`,
        employee_id: empId,
        hr_id: '2',
        evaluation_date: d.toISOString(),
        total_score: score,
        categories_scores: {
          thai_do: { than_thien: Math.min(10, Math.round(score * 0.1)), khong_thai_do: Math.min(10, Math.round(score * 0.09)), ton_trong: Math.min(5, Math.round(score * 0.05)) },
          ky_nang: { ghi_order: Math.min(10, Math.round(score * 0.1)), hieu_menu: Math.min(5, Math.round(score * 0.05)), dung_quy_trinh: Math.min(5, Math.round(score * 0.05)) },
          toc_do: { phuc_vu_nhanh: Math.min(10, Math.round(score * 0.1)), quan_ly_ban: Math.min(10, Math.round(score * 0.1)) },
          tuan_thu: { dong_phuc: Math.min(5, Math.round(score * 0.05)), khong_dien_thoai: Math.min(5, Math.round(score * 0.05)), khong_tu_tap: Math.min(5, Math.round(score * 0.05)) },
          tinh_than: { chu_dong: Math.min(5, Math.round(score * 0.05)), ho_tro: Math.min(5, Math.round(score * 0.05)) },
        },
        feedback_events: score > 90 ? ['khach_khen'] : score < 70 ? ['nhac_nhe'] : [],
        bonus_score: score > 90 ? 5 : 0,
        manager_comment: score > 90 ? 'Nhân viên xuất sắc, tiếp tục phát huy.' : score < 70 ? 'Cần cải thiện thái độ phục vụ.' : 'Hoàn thành ca làm việc ổn định.',
      });
    });
  });

  return evals;
}

export const MOCK_EVALUATIONS = seedEvaluations();
