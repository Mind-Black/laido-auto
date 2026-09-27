import { describe, it, expect } from 'vitest';
import {
  calculateCountedSeconds,
  formatDuration,
  computeCheckinDeadline,
  checkinEligibility,
  snapTo15Minutes,
} from '../lib/time';
import { DateTime } from 'luxon';

const ZONE = 'Europe/Kyiv';

describe('Allowance Arithmetic according to Product Rules', () => {
  it('Mon 07:00–10:00 counts 2 hours (08:00 to 10:00)', () => {
    // 2026-09-28 is a Monday
    const start = DateTime.fromISO('2026-09-28T07:00:00', { zone: ZONE }).toISO()!;
    const end = DateTime.fromISO('2026-09-28T10:00:00', { zone: ZONE }).toISO()!;

    const seconds = calculateCountedSeconds(start, end, ZONE);
    expect(seconds).toBe(2 * 3600);
    expect(formatDuration(seconds)).toBe('2h');
  });

  it('Tue 13:00–17:00 counts 4 hours (13:00 to 17:00)', () => {
    // 2026-09-29 is a Tuesday
    const start = DateTime.fromISO('2026-09-29T13:00:00', { zone: ZONE }).toISO()!;
    const end = DateTime.fromISO('2026-09-29T17:00:00', { zone: ZONE }).toISO()!;

    const seconds = calculateCountedSeconds(start, end, ZONE);
    expect(seconds).toBe(4 * 3600);
    expect(formatDuration(seconds)).toBe('4h');
  });

  it('Wed 16:00–20:00 counts 1 hour (16:00 to 17:00)', () => {
    // 2026-09-30 is a Wednesday
    const start = DateTime.fromISO('2026-09-30T16:00:00', { zone: ZONE }).toISO()!;
    const end = DateTime.fromISO('2026-09-30T20:00:00', { zone: ZONE }).toISO()!;

    const seconds = calculateCountedSeconds(start, end, ZONE);
    expect(seconds).toBe(1 * 3600);
    expect(formatDuration(seconds)).toBe('1h');
  });

  it('Thu 18:00–Fri 09:00 counts 1 hour on Friday (08:00 to 09:00)', () => {
    // 2026-10-01 (Thu) to 2026-10-02 (Fri)
    const start = DateTime.fromISO('2026-10-01T18:00:00', { zone: ZONE }).toISO()!;
    const end = DateTime.fromISO('2026-10-02T09:00:00', { zone: ZONE }).toISO()!;

    const seconds = calculateCountedSeconds(start, end, ZONE);
    expect(seconds).toBe(1 * 3600);
  });

  it('Saturday 08:00–12:00 counts 0 hours', () => {
    // 2026-10-03 is a Saturday
    const start = DateTime.fromISO('2026-10-03T08:00:00', { zone: ZONE }).toISO()!;
    const end = DateTime.fromISO('2026-10-03T12:00:00', { zone: ZONE }).toISO()!;

    const seconds = calculateCountedSeconds(start, end, ZONE);
    expect(seconds).toBe(0);
    expect(formatDuration(seconds)).toBe('0m');
  });

  it('Fri 16:00–Mon 09:00 counts 2 hours total (1h on Friday + 1h on Monday)', () => {
    // 2026-10-02 (Fri) to 2026-10-05 (Mon)
    const start = DateTime.fromISO('2026-10-02T16:00:00', { zone: ZONE }).toISO()!;
    const end = DateTime.fromISO('2026-10-05T09:00:00', { zone: ZONE }).toISO()!;

    const seconds = calculateCountedSeconds(start, end, ZONE);
    expect(seconds).toBe(2 * 3600);
  });
});

describe('Check-in Deadline and Lifecycle Rules', () => {
  it('computes deadline exactly as start + 15 minutes', () => {
    const start = '2026-09-28T09:00:00.000Z';
    const deadline = computeCheckinDeadline(start);
    expect(deadline).toBe('2026-09-28T09:15:00.000Z');
  });

  it('rejects check-in before start time', () => {
    const start = '2026-09-28T09:00:00.000Z';
    const deadline = '2026-09-28T09:15:00.000Z';
    const now = '2026-09-28T08:59:59.000Z';

    const result = checkinEligibility(start, deadline, now);
    expect(result.canCheckIn).toBe(false);
    expect(result.reason).toBe('too_early');
  });

  it('accepts check-in exactly at start time', () => {
    const start = '2026-09-28T09:00:00.000Z';
    const deadline = '2026-09-28T09:15:00.000Z';
    const now = '2026-09-28T09:00:00.000Z';

    const result = checkinEligibility(start, deadline, now);
    expect(result.canCheckIn).toBe(true);
    expect(result.reason).toBe('open');
  });

  it('accepts check-in 14m 59s into session', () => {
    const start = '2026-09-28T09:00:00.000Z';
    const deadline = '2026-09-28T09:15:00.000Z';
    const now = '2026-09-28T09:14:59.000Z';

    const result = checkinEligibility(start, deadline, now);
    expect(result.canCheckIn).toBe(true);
    expect(result.reason).toBe('open');
  });

  it('rejects check-in exactly at 15m deadline or later', () => {
    const start = '2026-09-28T09:00:00.000Z';
    const deadline = '2026-09-28T09:15:00.000Z';
    const now = '2026-09-28T09:15:00.000Z';

    const result = checkinEligibility(start, deadline, now);
    expect(result.canCheckIn).toBe(false);
    expect(result.reason).toBe('expired');
  });
});

describe('Slot Snapping Helper', () => {
  it('snaps time down to nearest 15 minutes', () => {
    const dt = DateTime.fromISO('2026-09-28T09:14:22', { zone: ZONE });
    const snapped = snapTo15Minutes(dt, false);
    expect(snapped.minute).toBe(0);
  });

  it('snaps time up to next 15 minutes', () => {
    const dt = DateTime.fromISO('2026-09-28T09:14:22', { zone: ZONE });
    const snapped = snapTo15Minutes(dt, true);
    expect(snapped.minute).toBe(15);
  });
});
