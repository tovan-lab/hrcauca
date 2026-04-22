import { CategoryDef, FeedbackEvent } from './types';

export const EVALUATION_CATEGORIES: CategoryDef[] = [
  {
    key: 'thai_do',
    label: 'Thái độ & tác phong',
    maxPoints: 25,
    criteria: [
      { key: 'than_thien', label: 'Thân thiện, chào hỏi', max: 10 },
      { key: 'khong_thai_do', label: 'Không thái độ, không cãi khách', max: 10 },
      { key: 'ton_trong', label: 'Tôn trọng đồng nghiệp', max: 5 },
    ],
  },
  {
    key: 'ky_nang',
    label: 'Kỹ năng phục vụ',
    maxPoints: 20,
    criteria: [
      { key: 'ghi_order', label: 'Ghi order chính xác', max: 10 },
      { key: 'hieu_menu', label: 'Hiểu menu, tư vấn', max: 5 },
      { key: 'dung_quy_trinh', label: 'Đúng quy trình phục vụ', max: 5 },
    ],
  },
  {
    key: 'toc_do',
    label: 'Tốc độ & hiệu suất',
    maxPoints: 20,
    criteria: [
      { key: 'phuc_vu_nhanh', label: 'Phục vụ nhanh, không để khách chờ', max: 10 },
      { key: 'quan_ly_ban', label: 'Quản lý nhiều bàn tốt', max: 10 },
    ],
  },
  {
    key: 'tuan_thu',
    label: 'Tuân thủ quy định',
    maxPoints: 15,
    criteria: [
      { key: 'dong_phuc', label: 'Đồng phục', max: 5 },
      { key: 'khong_dien_thoai', label: 'Không dùng điện thoại', max: 5 },
      { key: 'khong_tu_tap', label: 'Không tụ tập', max: 5 },
    ],
  },
  {
    key: 'tinh_than',
    label: 'Tinh thần làm việc',
    maxPoints: 10,
    criteria: [
      { key: 'chu_dong', label: 'Chủ động', max: 5 },
      { key: 'ho_tro', label: 'Hỗ trợ đồng đội', max: 5 },
    ],
  },
];

export const FEEDBACK_EVENTS: FeedbackEvent[] = [
  { key: 'khach_khen', label: 'Khách khen', points: 10 },
  { key: 'nhac_nhe', label: 'Nhắc nhẹ', points: -5 },
  { key: 'phan_nan_truc_tiep', label: 'Phàn nàn trực tiếp', points: -10 },
  { key: 'phan_nan_quan_ly', label: 'Phàn nàn lên quản lý', points: -20 },
];
