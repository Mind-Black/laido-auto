import React from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { UserSession } from '../lib/types';
import { Zap, Calendar, User, Shield, Plus, LogIn, LogOut } from 'lucide-react';
import { DEFAULT_TIMEZONE } from '../lib/time';

interface Props {
  onOpenNewBooking: () => void;
  onOpenMyBookings: () => void;
  onOpenAdmin: () => void;
  onOpenLogin: () => void;
  myBookingsCount: number;
}

export const Header: React.FC<Props> = ({
  onOpenNewBooking,
  onOpenMyBookings,
  onOpenAdmin,
  onOpenLogin,
  myBookingsCount,
}) => {
  const { currentUser, setCurrentUser, availableUsers, isConfigured, isLoggedIn, signOut } = useAuth();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Branding & building info */}
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2 rounded-lg shadow-xs flex items-center justify-center">
            <Zap className="w-5 h-5 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Laido Auto
              </h1>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                Shared EV
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Laido Building 1 • {DEFAULT_TIMEZONE}
            </p>
          </div>
        </div>

        {/* Right: Actions and User switch */}
        <div className="flex items-center gap-3">
          {isLoggedIn && (
            <>
              <button
                onClick={onOpenNewBooking}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                New booking
              </button>

              <button
                onClick={onOpenMyBookings}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer relative"
              >
                <Calendar className="w-4 h-4 text-slate-600" />
                <span className="hidden md:inline">My bookings</span>
                {myBookingsCount > 0 && (
                  <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                    {myBookingsCount}
                  </span>
                )}
              </button>

              {currentUser.role === 'admin' && (
                <button
                  onClick={onOpenAdmin}
                  className="inline-flex items-center gap-1 px-2.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  title="Admin settings"
                >
                  <Shield className="w-3.5 h-3.5 text-amber-600" />
                  <span className="hidden md:inline">Admin</span>
                </button>
              )}
            </>
          )}

          {/* User Section */}
          {isConfigured ? (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 text-xs">
              {isLoggedIn ? (
                <>
                  <span className="text-slate-700 font-medium hidden sm:inline">{currentUser.email}</span>
                  <button
                    onClick={() => signOut()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-md transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign out</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={onOpenLogin}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign in</span>
                </button>
              )}
            </div>
          ) : (
            /* Local Sandbox demo switcher */
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 text-xs">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={currentUser.user_id}
                onChange={(e) => {
                  const found = availableUsers.find((u: UserSession) => u.user_id === e.target.value);
                  if (found) setCurrentUser(found);
                }}
                className="bg-slate-50 border border-slate-200 rounded-md py-1 px-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                aria-label="Switch User Identity"
              >
                {availableUsers.map((u: UserSession) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.email} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
