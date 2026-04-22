import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Evaluation } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface EvaluationContextType {
  evaluations: Evaluation[];
  loading: boolean;
  addEvaluation: (ev: Evaluation) => void;
  getEvaluationsForEmployee: (employeeId: string) => Evaluation[];
}

const EvaluationContext = createContext<EvaluationContextType | null>(null);

export function EvaluationProvider({ children }: { children: React.ReactNode }) {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchEvaluations = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('evaluations').select('*').order('evaluation_date', { ascending: false });
    
    // HR can only see evaluations for their branch
    const isHR = user?.role === 'HR';
    const userBranchId = (user as any)?.branch_id;
    if (isHR && userBranchId) {
      query = query.eq('branch_id', userBranchId);
    }

    const { data, error } = await query;
    if (!error && data) {
      const mapped: Evaluation[] = data.map(d => ({
        id: d.id,
        employee_id: d.employee_id,
        hr_id: d.hr_id,
        evaluation_date: d.evaluation_date,
        total_score: Number(d.total_score),
        categories_scores: d.categories_scores as any,
        feedback_events: (d.feedback_events as any) || [],
        bonus_score: Number(d.bonus_score),
        manager_comment: d.manager_comment,
      }));
      setEvaluations(mapped);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchEvaluations();
    }
  }, [user, fetchEvaluations]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('evaluations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'evaluations' },
        () => {
          // Refetch on any change
          fetchEvaluations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchEvaluations]);

  const addEvaluation = useCallback((ev: Evaluation) => {
    setEvaluations(prev => [ev, ...prev]);
  }, []);

  const getEvaluationsForEmployee = useCallback((employeeId: string) => {
    return evaluations.filter(e => e.employee_id === employeeId);
  }, [evaluations]);

  return (
    <EvaluationContext.Provider value={{ evaluations, loading, addEvaluation, getEvaluationsForEmployee }}>
      {children}
    </EvaluationContext.Provider>
  );
}

export function useEvaluation() {
  const ctx = useContext(EvaluationContext);
  if (!ctx) throw new Error('useEvaluation must be used within EvaluationProvider');
  return ctx;
}
