import React, { useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { Info, X, ShieldCheck } from 'lucide-react';

export const ConfigBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(false);

  if (isSupabaseConfigured || dismissed) {
    return null;
  }

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 text-xs text-blue-900 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            <strong>Local Sandbox Mode Active:</strong> Full business rules, 15m check-in countdown, and 4h/12h quotas are running in-memory. To connect a live Supabase backend, copy <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">.env.example</code> to <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">.env.local</code> and provide your API URL and publishable key.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            .env security verified
          </span>
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
