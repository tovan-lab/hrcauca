/**
 * Shift utility functions for overnight shifts & night bonus calculation
 */

/**
 * Calculate total hours for a shift, supporting overnight shifts.
 * If end_time < start_time, it means the shift crosses midnight.
 */
export function calcShiftHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins <= startMins) {
    // Overnight: add 24h to end
    endMins += 24 * 60;
  }
  return (endMins - startMins) / 60;
}

/**
 * Calculate effective hours with 1.25x bonus for hours after midnight (00:00–06:00).
 * Night bonus applies to the portion of the shift between 00:00 and 06:00.
 */
export function calcEffectiveHours(startTime: string, endTime: string): { totalHours: number; nightHours: number; effectiveHours: number } {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  const isOvernight = endMins <= startMins;
  if (isOvernight) {
    endMins += 24 * 60;
  }

  const totalHours = (endMins - startMins) / 60;

  // Night period: 00:00 (1440 mins from day start if overnight) to 06:00 (1800 mins)
  // For same-day shifts before midnight, night = 0:00-6:00 = 0-360 mins
  let nightMins = 0;

  if (isOvernight) {
    // Overnight shift: night period is from midnight (1440) to 6am (1800)
    const nightStart = 24 * 60; // midnight = 1440
    const nightEnd = 24 * 60 + 6 * 60; // 6am next day = 1800
    const overlapStart = Math.max(startMins, nightStart);
    const overlapEnd = Math.min(endMins, nightEnd);
    if (overlapEnd > overlapStart) {
      nightMins = overlapEnd - overlapStart;
    }
  } else {
    // Same-day shift: night period is 0:00-6:00
    const nightStart = 0;
    const nightEnd = 6 * 60; // 360
    const overlapStart = Math.max(startMins, nightStart);
    const overlapEnd = Math.min(endMins, nightEnd);
    if (overlapEnd > overlapStart) {
      nightMins = overlapEnd - overlapStart;
    }
  }

  const nightHours = nightMins / 60;
  // Night hours get 25% bonus (1.25x), so effective = normal + 0.25 * night
  const effectiveHours = totalHours + nightHours * 0.25;

  return { totalHours: Math.round(totalHours * 100) / 100, nightHours: Math.round(nightHours * 100) / 100, effectiveHours: Math.round(effectiveHours * 100) / 100 };
}

/**
 * Format hours to display string
 */
export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

/**
 * Check if a shift is overnight (crosses midnight)
 */
export function isOvernightShift(startTime: string, endTime: string): boolean {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return (eh * 60 + em) <= (sh * 60 + sm);
}

/**
 * Calculate effective hours from actual check-in/check-out timestamps.
 * Late check-in cuts time from the start, but late check-out is counted as
 * actual overtime instead of being clamped to the registered shift end.
 *
 * Rules:
 * - Working window starts at max(shiftStart, actualCheckIn).
 *   - Late check-in cuts time from the start.
 *   - Early check-in does not add time before the registered shift.
 * - Working window ends at actualCheckOut when present.
 *   - Early check-out cuts time from the end.
 *   - Late check-out adds actual overtime worked.
 * - Night bonus 1.25x applies to the portion of the working window
 *   that falls between 00:00 and 06:00 (any calendar day).
 *
 * @param shiftDate     YYYY-MM-DD — the date the shift was registered for
 * @param startTime     HH:mm — registered shift start
 * @param endTime       HH:mm — registered shift end (may be next day if overnight)
 * @param actualCheckIn ISO timestamp of real check-in (or null → assume on-time start)
 * @param actualCheckOut ISO timestamp of real check-out (or null → assume on-time end)
 */
export function calcActualEffectiveHours(
  shiftDate: string,
  startTime: string,
  endTime: string,
  actualCheckIn: string | null,
  actualCheckOut: string | null
): { totalHours: number; nightHours: number; effectiveHours: number } {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);

  // Build absolute Date objects for the registered shift window.
  const shiftStart = new Date(`${shiftDate}T${startTime}:00`);
  const shiftEnd = new Date(`${shiftDate}T${endTime}:00`);
  if ((eh * 60 + em) <= (sh * 60 + sm)) {
    // Overnight: end is next day
    shiftEnd.setDate(shiftEnd.getDate() + 1);
  }

  // Determine actual working window.
  const checkInDate = actualCheckIn ? new Date(actualCheckIn) : shiftStart;
  const checkOutDate = actualCheckOut ? new Date(actualCheckOut) : shiftEnd;

  const workStart = new Date(Math.max(shiftStart.getTime(), checkInDate.getTime()));
  const workEnd = new Date(checkOutDate.getTime());

  if (workEnd <= workStart) {
    return { totalHours: 0, nightHours: 0, effectiveHours: 0 };
  }

  const totalMs = workEnd.getTime() - workStart.getTime();
  const totalHours = totalMs / (1000 * 60 * 60);

  // Compute night-hour overlap (00:00–06:00 of any calendar day) within [workStart, workEnd].
  let nightMs = 0;
  const cursor = new Date(workStart);
  cursor.setHours(0, 0, 0, 0); // start of the day containing workStart
  while (cursor < workEnd) {
    const dayNightStart = new Date(cursor);
    const dayNightEnd = new Date(cursor);
    dayNightEnd.setHours(6, 0, 0, 0);
    const overlapStart = Math.max(workStart.getTime(), dayNightStart.getTime());
    const overlapEnd = Math.min(workEnd.getTime(), dayNightEnd.getTime());
    if (overlapEnd > overlapStart) nightMs += overlapEnd - overlapStart;
    cursor.setDate(cursor.getDate() + 1);
  }

  const nightHours = nightMs / (1000 * 60 * 60);
  const effectiveHours = totalHours + nightHours * 0.25;

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    nightHours: Math.round(nightHours * 100) / 100,
    effectiveHours: Math.round(effectiveHours * 100) / 100,
  };
}
