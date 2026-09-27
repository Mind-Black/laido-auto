import React, { useState, useEffect } from 'react';
import { Reservation, Charger } from '../../lib/types';
import { formatTimeInZone, DEFAULT_TIMEZONE } from '../../lib/time';
import { DateTime } from 'luxon';
import { Zap, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  reservations: Reservation[];
  chargers: Charger[];
  onCheckIn: (reservationId: string) => Promise<void>;
  onFinishEarly: (reservationId: string) => Promise<void>;
  loading?: boolean;
}

export const ActiveBookingBanner: React.FC<Props> = ({
  reservations,
  chargers,
  onCheckIn,
  onFinishEarly,
  loading = false,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [timeRemainingText, setTimeRemainingText] = useState<string>('');
  const [now, setNow] = useState<DateTime>(DateTime.now().toUTC());

  // Tick every second to update countdowns accurately
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(DateTime.now().toUTC());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Find the most relevant active reservation for the user
  // Either currently checked_in, or reserved and starting soon / in grace period
  const activeReservation = reservations.find((r) => {
    if (r.status === 'checked_in') {
      const end = DateTime.fromISO(r.scheduled_end_time).toUTC();
      return now < end;
    }
    if (r.status === 'reserved') {
      const start = DateTime.fromISO(r.start_time).toUTC();
      const deadline = DateTime.fromISO(r.checkin_deadline).toUTC();
      // Within 30 minutes before start up to the deadline
      return now >= start.minus({ minutes: 30 }) && now < deadline;
    }
    return false;
  });

  useEffect(() => {
    if (!activeReservation || activeReservation.status !== 'reserved') {
      setTimeRemainingText('');
      return;
    }

    const start = DateTime.fromISO(activeReservation.start_time).toUTC();
    const deadline = DateTime.fromISO(activeReservation.checkin_deadline).toUTC();

    if (now < start) {
      const diff = start.diff(now, ['hours', 'minutes', 'seconds']);
      setTimeRemainingText(`Starts in ${diff.minutes}m ${Math.floor(diff.seconds)}s`);
    } else if (now < deadline) {
      const diff = deadline.diff(now, ['minutes', 'seconds']);
      setTimeRemainingText(`Confirm within ${diff.minutes}m ${Math.floor(diff.seconds)}s`);
    } else {
      setTimeRemainingText('Deadline expired');
    }
  }, [now, activeReservation]);

  if (!activeReservation) {
    return null;
  }

  const charger = chargers.find((c) => c.id === activeReservation.charger_id);
  const chargerName = charger?.display_name || 'Charger';
  const start = DateTime.fromISO(activeReservation.start_time).toUTC();
  const deadline = DateTime.fromISO(activeReservation.checkin_deadline).toUTC();
  const canCheckIn = now >= start && now < deadline && activeReservation.status === 'reserved';
  const isCheckedIn = activeReservation.status === 'checked_in';

  const handleCheckInClick = async () => {
    try {
      setSubmitting(true);
      await onCheckIn(activeReservation.id);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinishEarlyClick = async () => {
    try {
      setSubmitting(true);
      await onFinishEarly(activeReservation.id);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`rounded-lg p-3.5 border shadow-sm transition-all flex flex-wrap items-center justify-between gap-4 ${
        isCheckedIn
          ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
          : canCheckIn
          ? 'bg-amber-50 border-amber-300 text-amber-950 animate-pulse-slow'
          : 'bg-blue-50 border-blue-200 text-blue-950'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`p-2 rounded-full ${
            isCheckedIn
              ? 'bg-emerald-200 text-emerald-800'
              : canCheckIn
              ? 'bg-amber-200 text-amber-800'
              : 'bg-blue-200 text-blue-800'
          }`}
        >
          {isCheckedIn ? (
            <Zap className="w-5 h-5 fill-emerald-600 text-emerald-600" />
          ) : (
            <Clock className="w-5 h-5" />
          )}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">
              Your active booking: {chargerName}
            </span>
            <span className="text-xs font-mono opacity-80">
              ({formatTimeInZone(activeReservation.start_time, DEFAULT_TIMEZONE)} –{' '}
              {formatTimeInZone(activeReservation.scheduled_end_time, DEFAULT_TIMEZONE)})
            </span>
          </div>

          <div className="text-xs mt-0.5 flex items-center gap-2">
            {isCheckedIn ? (
              <span className="text-emerald-700 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Charging in progress
              </span>
            ) : canCheckIn ? (
              <span className="text-amber-800 font-semibold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {timeRemainingText} (by{' '}
                {formatTimeInZone(activeReservation.checkin_deadline, DEFAULT_TIMEZONE)})
              </span>
            ) : (
              <span className="text-blue-700">
                {timeRemainingText || 'Upcoming session'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {canCheckIn && (
          <button
            onClick={handleCheckInClick}
            disabled={submitting || loading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm font-semibold shadow-sm transition-colors focus:ring-2 focus:ring-emerald-500 focus:outline-none flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Zap className="w-4 h-4 fill-white" />
            {submitting ? 'Confirming...' : "I'm charging"}
          </button>
        )}

        {isCheckedIn && (
          <button
            onClick={handleFinishEarlyClick}
            disabled={submitting || loading}
            className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-md text-sm font-medium transition-colors focus:ring-2 focus:ring-slate-400 focus:outline-none cursor-pointer disabled:opacity-50"
          >
            {submitting ? 'Finishing...' : 'Finish early'}
          </button>
        )}
      </div>
    </div>
  );
};
