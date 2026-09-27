import React from 'react';
import { AllowanceSummary as AllowanceSummaryType } from '../../lib/types';
import { formatDuration } from '../../lib/time';
import { Zap, HelpCircle } from 'lucide-react';

interface Props {
  allowances: AllowanceSummaryType | null;
  loading?: boolean;
}

export const AllowanceSummary: React.FC<Props> = ({ allowances, loading }) => {
  if (loading) {
    return (
      <div className="flex gap-4 items-center text-sm text-slate-500 animate-pulse">
        <div className="h-6 w-32 bg-slate-200 rounded"></div>
        <div className="h-6 w-32 bg-slate-200 rounded"></div>
      </div>
    );
  }

  if (!allowances?.daily || !allowances.weekly) {
    return <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Allowance unavailable. Limits are checked when you reserve.</div>;
  }

  const dailyPercent = Math.min(100, Math.round((allowances.daily.used_seconds / allowances.daily.limit_seconds) * 100));
  const weeklyPercent = Math.min(100, Math.round((allowances.weekly.used_seconds / allowances.weekly.limit_seconds) * 100));

  return (
    <div className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-sm">
      <div className="flex items-center gap-1.5 text-slate-700 font-medium mr-1">
        <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
        <span>Allowance:</span>
      </div>

      {/* Daily Usage */}
      <div className="flex items-center gap-2">
        <span className="text-slate-600">Today:</span>
        <span className="font-semibold text-slate-800">
          {formatDuration(allowances.daily.used_seconds)} / {formatDuration(allowances.daily.limit_seconds)}
        </span>
        <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
          <div
            className={`h-full transition-all duration-300 ${
              dailyPercent > 90 ? 'bg-rose-500' : dailyPercent > 70 ? 'bg-amber-500' : 'bg-blue-600'
            }`}
            style={{ width: `${dailyPercent}%` }}
          />
        </div>
      </div>

      <div className="h-4 w-px bg-slate-200 hidden sm:block" />

      {/* Weekly Usage */}
      <div className="flex items-center gap-2">
        <span className="text-slate-600">This week:</span>
        <span className="font-semibold text-slate-800">
          {formatDuration(allowances.weekly.used_seconds)} / {formatDuration(allowances.weekly.limit_seconds)}
        </span>
        <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
          <div
            className={`h-full transition-all duration-300 ${
              weeklyPercent > 90 ? 'bg-rose-500' : weeklyPercent > 70 ? 'bg-amber-500' : 'bg-blue-600'
            }`}
            style={{ width: `${weeklyPercent}%` }}
          />
        </div>
      </div>

      {/* Helper text tooltip */}
      <div className="ml-auto flex items-center gap-1 text-xs text-slate-500">
        <HelpCircle className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Mon–Fri 08:00–17:00 counts; off-hours are free</span>
      </div>
    </div>
  );
};
