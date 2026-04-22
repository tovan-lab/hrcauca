import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useEvaluation } from '@/contexts/EvaluationContext';
import { CategoriesScores } from '@/lib/types';
import { EVALUATION_CATEGORIES, FEEDBACK_EVENTS } from '@/lib/evaluation-config';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeForSubmit } from '@/lib/sanitize';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface Props {
  employeeId: string;
  evaluationDate: string; // yyyy-MM-dd
  onBack?: () => void;
}

function buildInitialScores(): CategoriesScores {
  const scores: CategoriesScores = {};
  for (const cat of EVALUATION_CATEGORIES) {
    scores[cat.key] = {};
    for (const cr of cat.criteria) {
      scores[cat.key][cr.key] = 0;
    }
  }
  return scores;
}

export function EvaluationForm({ employeeId, evaluationDate, onBack }: Props) {
  const { user } = useAuth();
  const { addEvaluation } = useEvaluation();

  const [scores, setScores] = useState<CategoriesScores>(buildInitialScores);
  const [feedbackActive, setFeedbackActive] = useState<Record<string, boolean>>({});
  const [bonusActive, setBonusActive] = useState(false);
  const [comment, setComment] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [employee, setEmployee] = useState<{ name: string; department: string | null; branch_id: string | null } | null>(null);
  const [loadingEmployee, setLoadingEmployee] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchEmployee = async () => {
      setLoadingEmployee(true);
      const { data } = await supabase
        .from('profiles')
        .select('name, department, branch_id')
        .eq('user_id', employeeId)
        .single();
      if (data) setEmployee({ name: data.name, department: data.department, branch_id: data.branch_id });
      setLoadingEmployee(false);
    };
    fetchEmployee();
  }, [employeeId]);

  const setCriterionScore = useCallback((catKey: string, crKey: string, val: number) => {
    setScores(prev => ({ ...prev, [catKey]: { ...prev[catKey], [crKey]: val } }));
  }, []);

  const toggleFeedback = useCallback((key: string) => {
    setFeedbackActive(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const cat of EVALUATION_CATEGORIES) {
      totals[cat.key] = Object.values(scores[cat.key] || {}).reduce((a, b) => a + b, 0);
    }
    return totals;
  }, [scores]);

  const baseScore = useMemo(() => Object.values(categoryTotals).reduce((a, b) => a + b, 0), [categoryTotals]);
  const feedbackScore = useMemo(() => FEEDBACK_EVENTS.reduce((sum, ev) => sum + (feedbackActive[ev.key] ? ev.points : 0), 0), [feedbackActive]);
  const bonusScore = bonusActive ? 5 : 0;
  const totalScore = baseScore + feedbackScore + bonusScore;
  const isLow = totalScore < 70;

  const handleSubmit = useCallback(async () => {
    setAttempted(true);
    if (!comment.trim() || !user || submitting) return;
    setSubmitting(true);
    const feedbackList = Object.entries(feedbackActive).filter(([, v]) => v).map(([k]) => k);

    const { data, error } = await supabase.from('evaluations').insert({
      employee_id: employeeId,
      hr_id: user.id,
      evaluation_date: evaluationDate,
      total_score: totalScore,
      categories_scores: scores as any,
      feedback_events: feedbackList as any,
      bonus_score: bonusScore,
      manager_comment: sanitizeForSubmit(comment),
      branch_id: employee?.branch_id || null,
    }).select().single();

    setSubmitting(false);
    if (error) {
      toast.error('Lỗi khi lưu đánh giá: ' + error.message);
      return;
    }
    if (data) {
      addEvaluation({
        id: data.id,
        employee_id: data.employee_id,
        hr_id: data.hr_id,
        evaluation_date: data.evaluation_date,
        total_score: Number(data.total_score),
        categories_scores: data.categories_scores as any,
        feedback_events: (data.feedback_events as any) || [],
        bonus_score: Number(data.bonus_score),
        manager_comment: data.manager_comment,
      });
    }
    toast.success(`Đã lưu điểm ngày ${format(new Date(evaluationDate), 'dd/MM/yyyy')}`);
    if (onBack) onBack();
  }, [comment, user, employeeId, evaluationDate, totalScore, scores, feedbackActive, bonusScore, addEvaluation, submitting, employee, onBack]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="mx-auto max-w-2xl space-y-5 pb-32"
    >
      <div className="flex items-center gap-3">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
          className="inline-flex items-center justify-center rounded-md h-9 w-9 hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </motion.button>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Chấm điểm nhân viên</h2>
          {loadingEmployee ? (
            <Skeleton className="h-4 w-40 mt-1" />
          ) : employee ? (
            <p className="text-sm text-muted-foreground">
              {employee.name} — Ngày {format(new Date(evaluationDate), 'dd/MM/yyyy', { locale: vi })}
            </p>
          ) : null}
        </div>
      </div>

      <Accordion type="multiple" defaultValue={EVALUATION_CATEGORIES.map(c => c.key)} className="space-y-3">
        {EVALUATION_CATEGORIES.map(cat => (
          <AccordionItem key={cat.key} value={cat.key} className="border rounded-lg overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center gap-3 text-left">
                <span className="font-medium text-sm text-foreground">{cat.label}</span>
                <Badge variant={categoryTotals[cat.key] === cat.maxPoints ? 'default' : 'secondary'} className="text-xs">
                  {categoryTotals[cat.key]}/{cat.maxPoints}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-4">
              {cat.criteria.map(cr => (
                <div key={cr.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-foreground">{cr.label}</Label>
                    <span className="text-sm font-semibold text-primary tabular-nums w-12 text-right">
                      {scores[cat.key][cr.key]}/{cr.max}
                    </span>
                  </div>
                  <Slider min={0} max={cr.max} step={1} value={[scores[cat.key][cr.key]]} onValueChange={([v]) => setCriterionScore(cat.key, cr.key, v)} />
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Phản hồi khách hàng</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FEEDBACK_EVENTS.map(ev => (
            <div
              key={ev.key}
              className={cn(
                'flex items-center justify-between rounded-lg border p-3 transition-colors cursor-pointer',
                feedbackActive[ev.key]
                  ? ev.points > 0 ? 'border-primary bg-primary/5' : 'border-destructive bg-destructive/5'
                  : 'hover:bg-muted/50'
              )}
              onClick={() => toggleFeedback(ev.key)}
            >
              <span className="text-sm text-foreground">{ev.label}</span>
              <Badge variant={ev.points > 0 ? 'default' : 'destructive'} className="text-xs">
                {ev.points > 0 ? '+' : ''}{ev.points}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="text-sm font-medium text-foreground">Doanh thu {'>'} 100 triệu/ca</p>
            <p className="text-xs text-muted-foreground">Bonus +5 điểm</p>
          </div>
          <Switch checked={bonusActive} onCheckedChange={setBonusActive} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Nhận xét quản lý <span className="text-destructive">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            placeholder="Nhập nhận xét về nhân viên..."
            value={comment}
            onChange={e => setComment(e.target.value)}
            rows={3}
            className={cn(attempted && !comment.trim() && 'border-destructive ring-destructive/30')}
          />
          {attempted && !comment.trim() && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              Bắt buộc phải có nhận xét để hoàn tất chấm điểm
            </p>
          )}
        </CardContent>
      </Card>

      <motion.div
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm"
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">Tổng điểm</p>
            <p className={cn('text-2xl font-bold tabular-nums', isLow ? 'text-destructive' : 'text-primary')}>
              {totalScore}
              <span className="text-sm font-normal text-muted-foreground">/100</span>
            </p>
          </div>
          <Button onClick={handleSubmit} disabled={submitting || (attempted && !comment.trim())} className="px-6">
            {submitting ? 'Đang lưu...' : 'Lưu kết quả'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
