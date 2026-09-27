export type ReservationStatus = 
  | 'reserved'
  | 'checked_in'
  | 'released_no_show'
  | 'cancelled'
  | 'completed';

export interface Building {
  id: string;
  name: string;
  timezone: string;
}

export interface BookingPolicy {
  building_id: string;
  version: number;
  weekday_start_time: string; // '08:00:00'
  weekday_end_time: string;   // '17:00:00'
  daily_limit_seconds: number; // 14400 (4 hours)
  weekly_limit_seconds: number; // 43200 (12 hours)
  checkin_grace_seconds: number; // 900 (15 minutes)
  min_duration_seconds: number;  // 1800 (30 minutes)
  max_future_days: number;      // 28 days
}

export interface Charger {
  id: string;
  building_id: string;
  display_name: string;
  enabled: boolean;
}

export interface Reservation {
  id: string;
  building_id: string;
  charger_id: string;
  user_id: string;
  user_email?: string;
  start_time: string; // ISO 8601 UTC
  scheduled_end_time: string; // ISO 8601 UTC
  effective_end_time: string; // ISO 8601 UTC
  checkin_deadline: string; // ISO 8601 UTC
  status: ReservationStatus;
  checked_in_at?: string | null;
  released_at?: string | null;
  version: number;
  policy_version: number;
  created_at?: string;
}

export interface CalendarBlock {
  id?: string;
  charger_id: string;
  start_time: string; // ISO UTC
  scheduled_end_time: string;
  effective_end_time: string;
  status: ReservationStatus;
  is_own: boolean;
  checkin_deadline?: string;
}

export interface AllowanceBucket {
  used_seconds: number;
  limit_seconds: number;
  remaining_seconds: number;
}

export interface AllowanceSummary {
  daily: AllowanceBucket;
  weekly: AllowanceBucket;
}

export interface UserSession {
  user_id: string;
  email: string;
  role: 'member' | 'admin';
  is_active: boolean;
}

export interface ValidationResult {
  valid: boolean;
  counted_seconds: number;
  error?: string;
  daily_exceeded?: boolean;
  weekly_exceeded?: boolean;
}
