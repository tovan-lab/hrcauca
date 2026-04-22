import React, { createContext, useContext, useState, useCallback } from 'react';
import { PenaltyRecord } from '@/lib/reward-penalty';

interface PenaltyContextType {
  records: PenaltyRecord[];
  addRecord: (r: PenaltyRecord) => void;
  getRecordsForEmployee: (employeeId: string) => PenaltyRecord[];
}

const PenaltyContext = createContext<PenaltyContextType | null>(null);

export function PenaltyProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<PenaltyRecord[]>([]);

  const addRecord = useCallback((r: PenaltyRecord) => {
    setRecords(prev => [r, ...prev]);
  }, []);

  const getRecordsForEmployee = useCallback((employeeId: string) => {
    return records.filter(r => r.employee_id === employeeId);
  }, [records]);

  return (
    <PenaltyContext.Provider value={{ records, addRecord, getRecordsForEmployee }}>
      {children}
    </PenaltyContext.Provider>
  );
}

export function usePenalty() {
  const ctx = useContext(PenaltyContext);
  if (!ctx) throw new Error('usePenalty must be used within PenaltyProvider');
  return ctx;
}
