import React, { useState, useEffect, useMemo } from 'react';
import { Charger, AllowanceSummary } from '../../lib/types';
import {
  calculateCountedSeconds,
  formatDuration,
  computeCheckinDeadline,
  DEFAULT_TIMEZONE,
  DAILY_LIMIT_SECONDS,
  WEEKLY_LIMIT_SECONDS,
  formatDateTimeInZone,
} from '../../lib/time';
import { DateTime } from 'luxon';
import { X, Calendar as CalendarIcon, Clock, Zap, AlertCircle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  chargers: Charger[];
  selectedChargerId: string;
  initialStartTime?: string; // ISO
  initialEndTime?: string;   // ISO
  allowances: AllowanceSummary | null;
  onConfirmReservation: (chargerId: string, startIso: string, endIso: string) => Promise<void>;
  onBookNow?: (chargerId: string, durationMinutes: number) => Promise<void>;
}

export const BookingModal: React.FC<Props> = ({
  isOpen,
  onClose,
  chargers,
  selectedChargerId,
  initialStartTime,
  initialEndTime,
  allowances,
  onConfirmReservation,
  onBookNow,
}) => {
  const [chargerId, setChargerId] = useState(selectedChargerId);
  const [startDateStr, setStartDateStr] = useState('');
  const [startTimeStr, setStartTimeStr] = useState('09:00');
  const [endDateStr, setEndDateStr] = useState('');
  const [endTimeStr, setEndTimeStr] = useState('11:00');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize or reset form when opened
  useEffect(() => {
    if (!isOpen) return;

    const now = DateTime.now().setZone(DEFAULT_TIMEZONE);
    let startDt = initialStartTime
      ? DateTime.fromISO(initialStartTime, { zone: DEFAULT_TIMEZONE })
      : now.plus({ minutes: 15 }).set({ second: 0, millisecond: 0 });

    // snap start time to next 15-minute mark
    const remainder = startDt.minute % 15;
    if (remainder !== 0) {
      startDt = startDt.plus({ minutes: 15 - remainder });
    }

    let endDt = initialEndTime
      ? DateTime.fromISO(initialEndTime, { zone: DEFAULT_TIMEZONE })
      : startDt.plus({ hours: 2 });

    if (endDt <= startDt) {
      endDt = startDt.plus({ hours: 2 });
    }

    setChargerId(selectedChargerId || chargers[0]?.id || '');
    setStartDateStr(startDt.toISODate()!);
    setStartTimeStr(startDt.toFormat('HH:mm'));
    setEndDateStr(endDt.toISODate()!);
    setEndTimeStr(endDt.toFormat('HH:mm'));
    setErrorMessage(null);
  }, [isOpen, initialStartTime, initialEndTime, selectedChargerId, chargers]);

  // Construct ISO timestamps
  const startIso = useMemo(() => {
    if (!startDateStr || !startTimeStr) return null;
    const dt = DateTime.fromISO(`${startDateStr}T${startTimeStr}:00`, { zone: DEFAULT_TIMEZONE });
    return dt.isValid ? dt.toUTC().toISO() : null;
  }, [startDateStr, startTimeStr]);

  const endIso = useMemo(() => {
    if (!endDateStr || !endTimeStr) return null;
    const dt = DateTime.fromISO(`${endDateStr}T${endTimeStr}:00`, { zone: DEFAULT_TIMEZONE });
    return dt.isValid ? dt.toUTC().toISO() : null;
  }, [endDateStr, endTimeStr]);

  // Calculations & Validation
  const calculation = useMemo(() => {
    if (!startIso || !endIso) return null;
    const start = DateTime.fromISO(startIso);
    const end = DateTime.fromISO(endIso);
    const now = DateTime.now().toUTC();

    if (end <= start) {
      return { valid: false, error: 'End time must be after start time' };
    }

    const durationSeconds = end.diff(start, 'seconds').seconds;
    if (durationSeconds < 1800) {
      return { valid: false, error: 'Minimum duration is 30 minutes' };
    }

    if (start < now.minus({ minutes: 1 })) {
      return { valid: false, error: 'Start time cannot be in the past' };
    }

    const countedSeconds = calculateCountedSeconds(startIso, endIso, DEFAULT_TIMEZONE);
    const deadlineIso = computeCheckinDeadline(startIso);

    // Allowance check
    const dailyUsed = allowances?.daily.used_seconds || 0;
    const weeklyUsed = allowances?.weekly.used_seconds || 0;

    const dailyExceeded = dailyUsed + countedSeconds > DAILY_LIMIT_SECONDS;
    const weeklyExceeded = weeklyUsed + countedSeconds > WEEKLY_LIMIT_SECONDS;

    let error: string | undefined;
    if (dailyExceeded) {
      error = `Exceeds 4h daily limit (${formatDuration(dailyUsed + countedSeconds)} / 4h)`;
    } else if (weeklyExceeded) {
      error = `Exceeds 12h weekly limit (${formatDuration(weeklyUsed + countedSeconds)} / 12h)`;
    }

    return {
      valid: !dailyExceeded && !weeklyExceeded,
      durationSeconds,
      countedSeconds,
      deadlineIso,
      dailyUsedAfter: dailyUsed + countedSeconds,
      weeklyUsedAfter: weeklyUsed + countedSeconds,
      error,
    };
  }, [startIso, endIso, allowances]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startIso || !endIso || !calculation?.valid) return;

    try {
      setSubmitting(true);
      setErrorMessage(null);
      await onConfirmReservation(chargerId, startIso, endIso);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create reservation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBookNow = async () => {
    if (!onBookNow) return;
    try {
      setSubmitting(true);
      setErrorMessage(null);
      await onBookNow(chargerId, 60); // 1 hour quick booking
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to book now');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">New Reservation</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Charger select */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Select Charger
            </label>
            <div className="grid grid-cols-2 gap-3">
              {chargers.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  disabled={!c.enabled}
                  onClick={() => setChargerId(c.id)}
                  className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-all text-left flex items-center justify-between ${
                    chargerId === c.id
                      ? 'border-blue-600 bg-blue-50/80 text-blue-900 ring-2 ring-blue-500/20'
                      : !c.enabled
                      ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <span>{c.display_name}</span>
                  {!c.enabled && <span className="text-xs text-rose-600">Maintenance</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Start Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
              <input
                type="date"
                required
                value={startDateStr}
                onChange={(e) => {
                  setStartDateStr(e.target.value);
                  // Auto adjust end date if before
                  if (e.target.value > endDateStr) {
                    setEndDateStr(e.target.value);
                  }
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Start Time</label>
              <input
                type="time"
                step="900" // 15 minutes step
                required
                value={startTimeStr}
                onChange={(e) => setStartTimeStr(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
              />
            </div>
          </div>

          {/* End Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
              <input
                type="date"
                required
                value={endDateStr}
                onChange={(e) => setEndDateStr(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">End Time</label>
              <input
                type="time"
                step="900"
                required
                value={endTimeStr}
                onChange={(e) => setEndTimeStr(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
              />
            </div>
          </div>

          {/* Summary and Allowance impact preview */}
          {calculation && (
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-600">
                <span>Total Duration:</span>
                <span className="font-semibold text-slate-800">
                  {formatDuration(calculation.durationSeconds || 0)}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>Counts toward allowance (Mon–Fri 08:00–17:00):</span>
                <span className="font-semibold text-blue-700">
                  {formatDuration(calculation.countedSeconds || 0)}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>Check-in deadline (15m grace):</span>
                <span className="font-mono text-amber-700">
                  {calculation.deadlineIso ? formatDateTimeInZone(calculation.deadlineIso) : '—'}
                </span>
              </div>

              {calculation.error && (
                <div className="pt-2 border-t border-slate-200 text-rose-600 font-medium flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{calculation.error}</span>
                </div>
              )}
            </div>
          )}

          {/* Quick Book Now helper */}
          {onBookNow && (
            <div className="pt-1">
              <button
                type="button"
                onClick={handleBookNow}
                disabled={submitting}
                className="w-full py-2 px-3 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" />
                Book now (1 hour & start charging immediately)
              </button>
            </div>
          )}

          {/* Footer buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !calculation?.valid}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Clock className="w-4 h-4" />
              {submitting ? 'Reserving...' : 'Reserve'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
