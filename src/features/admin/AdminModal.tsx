import React, { useState } from 'react';
import { Charger } from '../../lib/types';
import { X, Shield, Wrench, CheckCircle2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  chargers: Charger[];
  onToggleCharger: (charger: Charger) => Promise<void>;
}

export const AdminModal: React.FC<Props> = ({ isOpen, onClose, chargers, onToggleCharger }) => {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  if (!isOpen) return null;

  const handleToggleCharger = async (charger: Charger) => {
    setPendingId(charger.id);
    setErrorMessage(null);
    try {
      await onToggleCharger(charger);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update charger status.');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Building administration" className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[100dvh] sm:max-h-[90dvh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="flex shrink-0 items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-slate-900">Building Administration</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close administration"
            className="flex h-11 w-11 items-center justify-center text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-6">
          {errorMessage && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{errorMessage}</div>}
          {/* Charger Management */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Charger Maintenance & Outages
            </h3>
            <div className="space-y-3">
              {chargers.map((c) => (
                <div
                  key={c.id}
                  className="p-3.5 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        c.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {c.enabled ? <CheckCircle2 className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{c.display_name}</div>
                      <div className="text-xs text-slate-500">
                        Status: {c.enabled ? 'Operational' : 'Maintenance Block Active'}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleCharger(c)}
                    disabled={pendingId !== null}
                    className={`min-h-11 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                      c.enabled
                        ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {pendingId === c.id ? 'Updating...' : c.enabled ? 'Set Maintenance' : 'Set Active'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Policy Information */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 text-xs space-y-1.5 text-slate-600">
            <h4 className="font-semibold text-slate-800 text-xs uppercase tracking-wider mb-1">
              Active Booking Policy Rules
            </h4>
            <div>• Weekday quota window: <strong>Monday–Friday 08:00–17:00</strong></div>
            <div>• Daily quota limit: <strong>4 hours (14,400s)</strong></div>
            <div>• Weekly quota limit: <strong>12 hours (43,200s)</strong></div>
            <div>• Check-in confirmation grace: <strong>15 minutes</strong></div>
            <div>• Minimum booking duration: <strong>30 minutes</strong></div>
            <div>• Off-hours (evenings & weekends): <strong>Free quota consumption</strong></div>
          </div>
        </div>

        <div className="shrink-0 p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="min-h-11 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
