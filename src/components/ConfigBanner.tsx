import React, { useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { Info, X } from 'lucide-react';

export const ConfigBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(false);

  if (isSupabaseConfigured || dismissed) {
    return null;
  }

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 text-xs text-blue-900 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            <strong>Demo mode:</strong> Reservations are saved only in this browser.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setDismissed(true)}
            className="text-blue-500 hover:text-blue-800 p-0.5 rounded"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
