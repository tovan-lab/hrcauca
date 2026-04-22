import { useState, useCallback, useEffect } from 'react';

const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = 'login_rate_limit';

interface RateLimitState {
  attempts: number;
  lockedUntil: number | null;
}

function loadState(): RateLimitState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const state = JSON.parse(raw) as RateLimitState;
      // Clear expired lockout
      if (state.lockedUntil && Date.now() > state.lockedUntil) {
        localStorage.removeItem(STORAGE_KEY);
        return { attempts: 0, lockedUntil: null };
      }
      return state;
    }
  } catch {}
  return { attempts: 0, lockedUntil: null };
}

function saveState(state: RateLimitState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useLoginRateLimit() {
  const [state, setState] = useState<RateLimitState>(loadState);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const isLocked = state.lockedUntil !== null && Date.now() < state.lockedUntil;

  // Countdown timer
  useEffect(() => {
    if (!state.lockedUntil) { setRemainingSeconds(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((state.lockedUntil! - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        const newState = { attempts: 0, lockedUntil: null };
        setState(newState);
        saveState(newState);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [state.lockedUntil]);

  const recordFailedAttempt = useCallback(() => {
    setState(prev => {
      const newAttempts = prev.attempts + 1;
      const newState: RateLimitState = newAttempts >= MAX_ATTEMPTS
        ? { attempts: newAttempts, lockedUntil: Date.now() + LOCKOUT_MS }
        : { attempts: newAttempts, lockedUntil: null };
      saveState(newState);
      return newState;
    });
  }, []);

  const resetAttempts = useCallback(() => {
    const newState = { attempts: 0, lockedUntil: null };
    setState(newState);
    saveState(newState);
  }, []);

  return {
    isLocked,
    attempts: state.attempts,
    remainingSeconds,
    recordFailedAttempt,
    resetAttempts,
    maxAttempts: MAX_ATTEMPTS,
  };
}
