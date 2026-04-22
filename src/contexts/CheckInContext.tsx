import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckIn } from '@/lib/types';
import { MOCK_CHECKINS } from '@/lib/mock-data';

interface CheckInContextType {
  checkIns: CheckIn[];
  addCheckIn: (ci: CheckIn) => void;
  getCheckInsForUser: (userId: string) => CheckIn[];
}

const CheckInContext = createContext<CheckInContextType | null>(null);

export function CheckInProvider({ children }: { children: React.ReactNode }) {
  const [checkIns, setCheckIns] = useState<CheckIn[]>(MOCK_CHECKINS);

  const addCheckIn = useCallback((ci: CheckIn) => {
    setCheckIns(prev => [ci, ...prev]);
  }, []);

  const getCheckInsForUser = useCallback((userId: string) => {
    return checkIns.filter(c => c.user_id === userId);
  }, [checkIns]);

  return (
    <CheckInContext.Provider value={{ checkIns, addCheckIn, getCheckInsForUser }}>
      {children}
    </CheckInContext.Provider>
  );
}

export function useCheckIn() {
  const ctx = useContext(CheckInContext);
  if (!ctx) throw new Error('useCheckIn must be used within CheckInProvider');
  return ctx;
}
