export type UserRole = 'ADMIN' | 'HR' | 'EMPLOYEE';
export type UserStatus = 'pending' | 'active' | 'inactive';

export interface Branch {
  id: string;
  branch_name: string;
  address: string;
  manager_id: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string;
  department?: string;
  branch_id?: string | null;
  branch_name?: string;
  is_active?: boolean;
}

export interface CheckIn {
  id: string;
  user_id: string;
  image_url: string;
  check_in_time: string;
  status: boolean;
}

export interface CriterionDef {
  key: string;
  label: string;
  max: number;
}

export interface CategoryDef {
  key: string;
  label: string;
  maxPoints: number;
  criteria: CriterionDef[];
}

export interface FeedbackEvent {
  key: string;
  label: string;
  points: number;
}

export interface CategoriesScores {
  [categoryKey: string]: { [criterionKey: string]: number };
}

export interface Evaluation {
  id: string;
  employee_id: string;
  hr_id: string;
  evaluation_date: string;
  total_score: number;
  categories_scores: CategoriesScores;
  feedback_events: string[];
  bonus_score: number;
  manager_comment: string;
}

export interface Feedback {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
}
