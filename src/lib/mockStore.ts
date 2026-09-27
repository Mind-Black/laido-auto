import { Building, BookingPolicy, Charger, Reservation, AllowanceSummary, CalendarBlock, UserSession } from './types';
import { calculateCountedSeconds, computeCheckinDeadline, DEFAULT_TIMEZONE, DAILY_LIMIT_SECONDS, WEEKLY_LIMIT_SECONDS, getWeekStart } from './time';
import { DateTime } from 'luxon';

export const DEMO_USERS: UserSession[] = [
  { user_id: 'user-alex-1', email: 'alex@example.com', role: 'member', is_active: true },
  { user_id: 'user-sam-2', email: 'sam@example.com', role: 'member', is_active: true },
  { user_id: 'admin-elena-3', email: 'elena.admin@example.com', role: 'admin', is_active: true },
];

export const INITIAL_BUILDING: Building = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Laido Building 1',
  timezone: DEFAULT_TIMEZONE,
};

export const INITIAL_POLICY: BookingPolicy = {
  building_id: INITIAL_BUILDING.id,
  version: 1,
  weekday_start_time: '08:00:00',
  weekday_end_time: '17:00:00',
  daily_limit_seconds: DAILY_LIMIT_SECONDS,
  weekly_limit_seconds: WEEKLY_LIMIT_SECONDS,
  checkin_grace_seconds: 900,
  min_duration_seconds: 1800,
  max_future_days: 28,
};

export const INITIAL_CHARGERS: Charger[] = [
  { id: '11111111-1111-1111-1111-111111111111', building_id: INITIAL_BUILDING.id, display_name: 'Charger 1', enabled: true },
  { id: '22222222-2222-2222-2222-222222222222', building_id: INITIAL_BUILDING.id, display_name: 'Charger 2', enabled: true },
];

class MockStore {
  private reservations: Reservation[] = [];
  private chargers: Charger[] = [...INITIAL_CHARGERS];
  private building: Building = { ...INITIAL_BUILDING };
  private policy: BookingPolicy = { ...INITIAL_POLICY };
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    const now = DateTime.now().setZone(this.building.timezone);
    
    // Seed a couple sample bookings around today
    // 1. Alex has a booking earlier today or upcoming
    const todayMorning = now.set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
    const todayEnd = now.set({ hour: 11, minute: 0, second: 0, millisecond: 0 });
    
    // If today morning is in the past, mark it completed or checked in
    const isPast = todayEnd < now;

    this.reservations.push({
      id: 'res-seed-1',
      building_id: this.building.id,
      charger_id: this.chargers[0].id,
      user_id: DEMO_USERS[0].user_id,
      user_email: DEMO_USERS[0].email,
      start_time: todayMorning.toUTC().toISO()!,
      scheduled_end_time: todayEnd.toUTC().toISO()!,
      effective_end_time: todayEnd.toUTC().toISO()!,
      checkin_deadline: computeCheckinDeadline(todayMorning.toUTC().toISO()!),
      status: isPast ? 'completed' : 'reserved',
      version: 1,
      policy_version: 1,
      created_at: now.minus({ days: 1 }).toUTC().toISO()!,
    });

    // 2. Sam has a booking in Charger 2
    const samStart = now.set({ hour: 14, minute: 0, second: 0, millisecond: 0 });
    const samEnd = now.set({ hour: 16, minute: 30, second: 0, millisecond: 0 });
    this.reservations.push({
      id: 'res-seed-2',
      building_id: this.building.id,
      charger_id: this.chargers[1].id,
      user_id: DEMO_USERS[1].user_id,
      user_email: DEMO_USERS[1].email,
      start_time: samStart.toUTC().toISO()!,
      scheduled_end_time: samEnd.toUTC().toISO()!,
      effective_end_time: samEnd.toUTC().toISO()!,
      checkin_deadline: computeCheckinDeadline(samStart.toUTC().toISO()!),
      status: 'reserved',
      version: 1,
      policy_version: 1,
      created_at: now.minus({ days: 1 }).toUTC().toISO()!,
    });
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  public getBuilding(): Building {
    return this.building;
  }

  public getChargers(): Charger[] {
    return this.chargers;
  }

  public setChargerEnabled(chargerId: string, enabled: boolean) {
    const charger = this.chargers.find((c) => c.id === chargerId);
    if (charger) {
      charger.enabled = enabled;
      this.notify();
    }
  }

  /**
   * Reconcile overdue reservations:
   * 1. Reserved bookings past deadline -> released_no_show (retain grace interval)
   * 2. Checked-in bookings past scheduled end -> completed
   */
  public reconcile() {
    const nowUtc = DateTime.now().toUTC();
    let changed = false;

    for (const r of this.reservations) {
      const deadline = DateTime.fromISO(r.checkin_deadline).toUTC();
      const end = DateTime.fromISO(r.scheduled_end_time).toUTC();

      if (r.status === 'reserved' && nowUtc >= deadline) {
        r.status = 'released_no_show';
        r.released_at = nowUtc.toISO()!;
        r.effective_end_time = deadline < end ? deadline.toISO()! : end.toISO()!;
        r.version += 1;
        changed = true;
      } else if (r.status === 'checked_in' && nowUtc >= end) {
        r.status = 'completed';
        r.version += 1;
        changed = true;
      }
    }

    if (changed) {
      this.notify();
    }
  }

  public getCalendar(currentUserId: string, startIso: string, endIso: string, chargerId?: string): CalendarBlock[] {
    this.reconcile();
    const rangeStart = DateTime.fromISO(startIso).toUTC();
    const rangeEnd = DateTime.fromISO(endIso).toUTC();

    return this.reservations
      .filter((r) => {
        if (chargerId && r.charger_id !== chargerId) return false;
        if (['cancelled'].includes(r.status)) return false;

        const rStart = DateTime.fromISO(r.start_time).toUTC();
        const rEnd = DateTime.fromISO(r.effective_end_time).toUTC();

        return rStart < rangeEnd && rEnd > rangeStart;
      })
      .map((r) => {
        const isOwn = r.user_id === currentUserId;
        return {
          id: isOwn ? r.id : undefined,
          charger_id: r.charger_id,
          start_time: r.start_time,
          scheduled_end_time: r.scheduled_end_time,
          effective_end_time: r.effective_end_time,
          status: r.status,
          is_own: isOwn,
          checkin_deadline: isOwn ? r.checkin_deadline : undefined,
        };
      });
  }

  public getMyReservations(userId: string): Reservation[] {
    this.reconcile();
    return this.reservations
      .filter((r) => r.user_id === userId)
      .sort((a, b) => DateTime.fromISO(b.start_time).toMillis() - DateTime.fromISO(a.start_time).toMillis());
  }

  public getAllowances(userId: string, targetDateIso?: string): AllowanceSummary {
    this.reconcile();
    const targetDt = targetDateIso ? DateTime.fromISO(targetDateIso, { zone: this.building.timezone }) : DateTime.now().setZone(this.building.timezone);

    const dayStart = targetDt.startOf('day');
    const dayEnd = targetDt.endOf('day');

    const weekStart = getWeekStart(targetDt, this.building.timezone);
    const weekEnd = weekStart.plus({ days: 7 });

    let dailyCounted = 0;
    let weeklyCounted = 0;

    const userReservations = this.reservations.filter(
      (r) => r.user_id === userId && ['reserved', 'checked_in', 'completed', 'released_no_show'].includes(r.status)
    );

    for (const r of userReservations) {
      // Calculate intersection for this day
      const rStart = DateTime.fromISO(r.start_time, { zone: this.building.timezone });
      const rEnd = DateTime.fromISO(r.effective_end_time, { zone: this.building.timezone });

      if (rStart < dayEnd && rEnd > dayStart) {
        const overlapStart = rStart > dayStart ? rStart : dayStart;
        const overlapEnd = rEnd < dayEnd ? rEnd : dayEnd;
        dailyCounted += calculateCountedSeconds(overlapStart.toISO()!, overlapEnd.toISO()!, this.building.timezone);
      }

      if (rStart < weekEnd && rEnd > weekStart) {
        const overlapStart = rStart > weekStart ? rStart : weekStart;
        const overlapEnd = rEnd < weekEnd ? rEnd : weekEnd;
        weeklyCounted += calculateCountedSeconds(overlapStart.toISO()!, overlapEnd.toISO()!, this.building.timezone);
      }
    }

    return {
      daily: {
        used_seconds: dailyCounted,
        limit_seconds: DAILY_LIMIT_SECONDS,
        remaining_seconds: Math.max(0, DAILY_LIMIT_SECONDS - dailyCounted),
      },
      weekly: {
        used_seconds: weeklyCounted,
        limit_seconds: WEEKLY_LIMIT_SECONDS,
        remaining_seconds: Math.max(0, WEEKLY_LIMIT_SECONDS - weeklyCounted),
      },
    };
  }

  public createReservation(
    userId: string,
    userEmail: string,
    chargerId: string,
    startIso: string,
    endIso: string
  ): Reservation {
    this.reconcile();

    const start = DateTime.fromISO(startIso, { zone: this.building.timezone });
    const end = DateTime.fromISO(endIso, { zone: this.building.timezone });
    const now = DateTime.now().setZone(this.building.timezone);

    if (start < now.minus({ minutes: 1 })) {
      throw new Error('Start time cannot be in the past');
    }

    const durationSeconds = end.diff(start, 'seconds').seconds;
    if (durationSeconds < this.policy.min_duration_seconds) {
      throw new Error(`Minimum reservation duration is ${this.policy.min_duration_seconds / 60} minutes`);
    }

    // Check charger enabled
    const charger = this.chargers.find((c) => c.id === chargerId);
    if (!charger || !charger.enabled) {
      throw new Error('Charger is unavailable or under maintenance');
    }

    // Check collision on this charger
    const hasCollision = this.reservations.some((r) => {
      if (r.charger_id !== chargerId || ['cancelled'].includes(r.status)) return false;
      const rStart = DateTime.fromISO(r.start_time, { zone: this.building.timezone });
      const rEnd = DateTime.fromISO(r.effective_end_time, { zone: this.building.timezone });
      return start < rEnd && end > rStart;
    });

    if (hasCollision) {
      throw new Error('Selected time conflicts with an existing reservation on this charger');
    }

    // Check same-user overlap on OTHER charger
    const hasOwnOverlap = this.reservations.some((r) => {
      if (r.user_id !== userId || ['cancelled'].includes(r.status)) return false;
      const rStart = DateTime.fromISO(r.start_time, { zone: this.building.timezone });
      const rEnd = DateTime.fromISO(r.effective_end_time, { zone: this.building.timezone });
      return start < rEnd && end > rStart;
    });

    if (hasOwnOverlap) {
      throw new Error('You cannot hold overlapping reservations across both chargers');
    }

    // Check daily and weekly allowances
    const counted = calculateCountedSeconds(startIso, endIso, this.building.timezone);
    const allowances = this.getAllowances(userId, startIso);

    if (allowances.daily.used_seconds + counted > DAILY_LIMIT_SECONDS) {
      throw new Error('Reservation exceeds your 4-hour daily allowance for this day');
    }

    if (allowances.weekly.used_seconds + counted > WEEKLY_LIMIT_SECONDS) {
      throw new Error('Reservation exceeds your 12-hour weekly allowance');
    }

    const reservation: Reservation = {
      id: `res-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      building_id: this.building.id,
      charger_id: chargerId,
      user_id: userId,
      user_email: userEmail,
      start_time: start.toUTC().toISO()!,
      scheduled_end_time: end.toUTC().toISO()!,
      effective_end_time: end.toUTC().toISO()!,
      checkin_deadline: computeCheckinDeadline(start.toUTC().toISO()!),
      status: 'reserved',
      version: 1,
      policy_version: 1,
      created_at: now.toUTC().toISO()!,
    };

    this.reservations.push(reservation);
    this.notify();
    return reservation;
  }

  public bookNow(userId: string, userEmail: string, chargerId: string, durationMinutes: number = 60): Reservation {
    const now = DateTime.now().setZone(this.building.timezone);
    const end = now.plus({ minutes: durationMinutes });

    const reservation = this.createReservation(userId, userEmail, chargerId, now.toISO()!, end.toISO()!);
    // Immediate check-in
    reservation.status = 'checked_in';
    reservation.checked_in_at = now.toUTC().toISO()!;
    this.notify();
    return reservation;
  }

  public checkIn(userId: string, reservationId: string): Reservation {
    this.reconcile();
    const r = this.reservations.find((res) => res.id === reservationId);
    if (!r) throw new Error('Reservation not found');
    if (r.user_id !== userId) throw new Error('Only the booking owner can check in');

    if (r.status === 'checked_in') return r;
    if (r.status !== 'reserved') throw new Error(`Cannot check in: status is ${r.status}`);

    const now = DateTime.now().toUTC();
    const start = DateTime.fromISO(r.start_time).toUTC();
    const deadline = DateTime.fromISO(r.checkin_deadline).toUTC();

    if (now < start) {
      throw new Error('Check-in opens at the booking start time');
    }
    if (now >= deadline) {
      r.status = 'released_no_show';
      r.released_at = now.toISO()!;
      r.effective_end_time = deadline.toISO()!;
      this.notify();
      throw new Error('Check-in deadline has expired. Reservation has been released.');
    }

    r.status = 'checked_in';
    r.checked_in_at = now.toISO()!;
    r.version += 1;
    this.notify();
    return r;
  }

  public finishEarly(userId: string, reservationId: string): Reservation {
    this.reconcile();
    const r = this.reservations.find((res) => res.id === reservationId);
    if (!r) throw new Error('Reservation not found');
    if (r.user_id !== userId) throw new Error('Only the booking owner can finish early');
    if (r.status !== 'checked_in') throw new Error('Booking is not currently checked in');

    const now = DateTime.now().toUTC();
    r.status = 'completed';
    r.effective_end_time = now.toISO()!;
    r.version += 1;
    this.notify();
    return r;
  }

  public cancelReservation(userId: string, reservationId: string): Reservation {
    this.reconcile();
    const r = this.reservations.find((res) => res.id === reservationId);
    if (!r) throw new Error('Reservation not found');
    if (r.user_id !== userId) throw new Error('Only the booking owner can cancel');

    const now = DateTime.now().toUTC();
    const start = DateTime.fromISO(r.start_time).toUTC();

    if (now < start) {
      // Future cancellation: restores entire allowance
      r.status = 'cancelled';
      r.effective_end_time = r.start_time;
    } else {
      // Cancellation after start: retain elapsed portion
      r.status = 'cancelled';
      r.effective_end_time = now.toISO()!;
    }
    r.version += 1;
    this.notify();
    return r;
  }
}

export const mockStore = new MockStore();
