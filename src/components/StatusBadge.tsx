import React from 'react';
import { ReservationStatus } from '../lib/types';
import { Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface StatusBadgeProps {
  status: ReservationStatus;
  isOwn?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, isOwn = false, className = '' }) => {
  switch (status) {
    case 'checked_in':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-300 ${className}`}>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Charging
        </span>
      );
    case 'reserved':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 ${className}`}>
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          {isOwn ? 'Awaiting Check-in' : 'Reserved'}
        </span>
      );
    case 'completed':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 ${className}`}>
          Completed
        </span>
      );
    case 'released_no_show':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 border border-rose-300 ${className}`}>
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
          Released (No-show)
        </span>
      );
    case 'cancelled':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200 line-through ${className}`}>
          <XCircle className="w-3.5 h-3.5 text-gray-400" />
          Cancelled
        </span>
      );
    default:
      return null;
  }
};
