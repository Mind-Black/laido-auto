import { DateTime, Interval } from 'luxon';

export const DEFAULT_TIMEZONE = 'Europe/Kyiv';
export const DAILY_LIMIT_SECONDS = 14400; // 4 hours
export const WEEKLY_LIMIT_SECONDS = 43200; // 12 hours
export const CHECKIN_GRACE_SECONDS = 900; // 15 minutes
export const MIN_DURATION_SECONDS = 1800; // 30 minutes

/**
 * Calculates exact elapsed seconds within Monday–Friday 08:00–17:00 (building timezone)
 * for a given interval [start, end).
 */
export function calculateCountedSeconds(
  startIso: string,
  endIso: string,
  zone: string = DEFAULT_TIMEZONE,
  windowStartHour: number = 8,
  windowEndHour: number = 17
): number {
  const start = DateTime.fromISO(startIso, { zone });
  const end = DateTime.fromISO(endIso, { zone });

  if (!start.isValid || !end.isValid || end <= start) {
    return 0;
  }

  let totalSeconds = 0;
  let cursor = start.startOf('day');
  const endLimit = end.startOf('day');

  while (cursor <= endLimit) {
    // Luxon weekday: 1 = Monday, 7 = Sunday
    if (cursor.weekday >= 1 && cursor.weekday <= 5) {
      const windowStart = cursor.set({ hour: windowStartHour, minute: 0, second: 0, millisecond: 0 });
      const windowEnd = cursor.set({ hour: windowEndHour, minute: 0, second: 0, millisecond: 0 });

      const overlapStart = start > windowStart ? start : windowStart;
      const overlapEnd = end < windowEnd ? end : windowEnd;

      if (overlapStart < overlapEnd) {
        const interval = Interval.fromDateTimes(overlapStart, overlapEnd);
        totalSeconds += Math.floor(interval.length('seconds'));
      }
    }
    cursor = cursor.plus({ days: 1 });
  }

  return totalSeconds;
}

/**
 * Formats seconds into a human-friendly string like "1h 30m" or "45m" or "0m"
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

/**
 * Format a time in the building timezone, e.g. "09:30"
 */
export function formatTimeInZone(isoString: string, zone: string = DEFAULT_TIMEZONE): string {
  return DateTime.fromISO(isoString, { zone }).toFormat('HH:mm');
}

/**
 * Format a date in the building timezone, e.g. "Mon, 28 Sep"
 */
export function formatDateInZone(isoString: string, zone: string = DEFAULT_TIMEZONE): string {
  return DateTime.fromISO(isoString, { zone }).toFormat('ccc, d LLL');
}

/**
 * Format date and time, e.g. "28 Sep 09:30"
 */
export function formatDateTimeInZone(isoString: string, zone: string = DEFAULT_TIMEZONE): string {
  return DateTime.fromISO(isoString, { zone }).toFormat('d LLL HH:mm');
}

/**
 * Compute check-in deadline: start + 15 minutes
 */
export function computeCheckinDeadline(startIso: string): string {
  const dt = DateTime.fromISO(startIso);
  if (startIso.endsWith('Z')) {
    return dt.toUTC().plus({ seconds: CHECKIN_GRACE_SECONDS }).toISO()!;
  }
  return dt.plus({ seconds: CHECKIN_GRACE_SECONDS }).toISO()!;
}

/**
 * Check check-in eligibility:
 * Allowed when start <= serverTime < deadline
 */
export function checkinEligibility(
  startIso: string,
  deadlineIso: string,
  currentIso: string
): { canCheckIn: boolean; reason?: 'too_early' | 'expired' | 'open' } {
  const start = DateTime.fromISO(startIso);
  const deadline = DateTime.fromISO(deadlineIso);
  const current = DateTime.fromISO(currentIso);

  if (current < start) {
    return { canCheckIn: false, reason: 'too_early' };
  }
  if (current >= deadline) {
    return { canCheckIn: false, reason: 'expired' };
  }
  return { canCheckIn: true, reason: 'open' };
}

/**
 * Get the Monday 00:00 of the week for a given date in zone
 */
export function getWeekStart(isoOrDate: string | DateTime, zone: string = DEFAULT_TIMEZONE): DateTime {
  const dt = typeof isoOrDate === 'string' ? DateTime.fromISO(isoOrDate, { zone }) : isoOrDate.setZone(zone);
  return dt.startOf('week'); // Luxon weeks start on Monday by default
}

/**
 * Snap a DateTime to 15-minute slot boundary
 */
export function snapTo15Minutes(dt: DateTime, roundUp: boolean = false): DateTime {
  const minutes = dt.minute;
  const remainder = minutes % 15;
  if (remainder === 0) return dt.set({ second: 0, millisecond: 0 });

  if (roundUp) {
    return dt.plus({ minutes: 15 - remainder }).set({ second: 0, millisecond: 0 });
  }
  return dt.minus({ minutes: remainder }).set({ second: 0, millisecond: 0 });
}
