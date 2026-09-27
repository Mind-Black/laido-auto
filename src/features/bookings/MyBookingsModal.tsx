import React, { useState } from 'react';
import { Reservation, Charger } from '../../lib/types';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTimeInZone, formatDuration, calculateCountedSeconds, DEFAULT_TIMEZONE } from '../../lib/time';
import { X, Calendar as CalendarIcon, Zap, AlertCircle, Ban } from 'lucide-react';
import { DateTime } from 'luxon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  reservations: Reservation[];
  chargers: Charger[];
  onCheckIn: (reservationId: string) => Promise<void>;
  onFinishEarly: (reservationId: string) => Promise<void>;
  onCancel: (reservationId: string) => Promise<void>;
}

export const MyBookingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  reservations,
  chargers,
  onCheckIn,
  onFinishEarly,
  onCancel,
}) => {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const now = DateTime.now().toUTC();

  const upcomingReservations = reservations.filter((r) => {
    const end = DateTime.fromISO(r.scheduled_end_time).toUTC();
    return ['reserved', 'checked_in'].includes(r.status) && end > now;
  });

  const historyReservations = reservations.filter((r) => {
    const end = DateTime.fromISO(r.scheduled_end_time).toUTC();
    return ['completed', 'cancelled', 'released_no_show'].includes(r.status) || end <= now;
  });

  const displayedList = activeTab === 'upcoming' ? upcomingReservations : historyReservations;

  const handleAction = async (action: () => Promise<void>, id: string) => {
    try {
      setActionLoading(id);
      setErrorMsg(null);
      await action();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">My Bookings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-200 bg-slate-50/30 px-6 pt-2">
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'upcoming'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Upcoming & Active ({upcomingReservations.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            History ({historyReservations.length})
          </button>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="m-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {displayedList.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No {activeTab} reservations found.
            </div>
          ) : (
            displayedList.map((r) => {
              const charger = chargers.find((c) => c.id === r.charger_id);
              const start = DateTime.fromISO(r.start_time).toUTC();
              const deadline = DateTime.fromISO(r.checkin_deadline).toUTC();
              const canCheckIn = now >= start && now < deadline && r.status === 'reserved';
              const countedSec = calculateCountedSeconds(r.start_time, r.effective_end_time, DEFAULT_TIMEZONE);

              return (
                <div
                  key={r.id}
                  className="p-4 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-all shadow-xs flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 text-sm">
                        {charger?.display_name || 'Charger'}
                      </span>
                      <StatusBadge status={r.status} isOwn={true} />
                    </div>

                    <div className="text-xs text-slate-600 font-mono">
                      {formatDateTimeInZone(r.start_time)} – {formatDateTimeInZone(r.scheduled_end_time)}
                    </div>

                    <div className="text-xs text-slate-500 flex items-center gap-3">
                      <span>Counted: <strong>{formatDuration(countedSec)}</strong></span>
                      {r.status === 'reserved' && (
                        <span>
                          Check-in deadline: <strong className="text-amber-700">{formatDateTimeInZone(r.checkin_deadline)}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {canCheckIn && (
                      <button
                        onClick={() => handleAction(() => onCheckIn(r.id), r.id)}
                        disabled={actionLoading === r.id}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Zap className="w-3.5 h-3.5 fill-white" />
                        {actionLoading === r.id ? 'Confirming...' : "I'm charging"}
                      </button>
                    )}

                    {r.status === 'checked_in' && (
                      <button
                        onClick={() => handleAction(() => onFinishEarly(r.id), r.id)}
                        disabled={actionLoading === r.id}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Finish early
                      </button>
                    )}

                    {['reserved'].includes(r.status) && (
                      <button
                        onClick={() => handleAction(() => onCancel(r.id), r.id)}
                        disabled={actionLoading === r.id}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-md text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
