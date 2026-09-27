import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { X, Mail, Lock, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { signInWithOtp, signInWithPassword, signUpWithPassword } = useAuth();
  
  const [authMode, setAuthMode] = useState<'password' | 'otp'>('password');
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);

  if (!isOpen) return null;

  const handleReset = () => {
    setErrorMsg(null);
    setSentSuccess(false);
    setSignUpSuccess(false);
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    try {
      setLoading(true);
      setErrorMsg(null);
      await signInWithOtp(email);
      setSentSuccess(true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send login email');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    try {
      setLoading(true);
      setErrorMsg(null);
      if (isSignUp) {
        await signUpWithPassword(email, password);
        setSignUpSuccess(true);
      } else {
        await signInWithPassword(email, password);
        onClose();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Sign in" className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl border border-slate-200 w-full max-w-md max-h-[100dvh] sm:max-h-[90dvh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="flex shrink-0 items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50/50">
          <h2 className="text-base font-semibold text-slate-900">
            {authMode === 'password' && isSignUp ? 'Create Resident Account' : 'Sign in to Laido Auto'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close sign in"
            className="flex h-11 w-11 items-center justify-center text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">
          <p className="text-xs text-slate-600">
            Sign in with your building resident email to reserve EV chargers and manage your bookings.
          </p>

          {/* Mode Switcher Tabs */}
          <div className="flex border-b border-slate-200 text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setAuthMode('password');
                handleReset();
              }}
              className={`min-h-11 pb-2 px-3 border-b-2 cursor-pointer transition-colors ${
                authMode === 'password'
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Email & Password
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('otp');
                handleReset();
              }}
              className={`min-h-11 pb-2 px-3 border-b-2 cursor-pointer transition-colors ${
                authMode === 'otp'
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Email Magic Link
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Tab 1: Email & Password (Default) */}
          {authMode === 'password' && (
            <>
              {signUpSuccess ? (
                <div className="space-y-3">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold mb-1">Account Created!</div>
                      <div>
                        Please check your email <strong>{email}</strong> to confirm your registration before signing in.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSignUpSuccess(false);
                      setIsSignUp(false);
                    }}
                    className="w-full py-2 px-3 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Go to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handlePasswordAuth} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Resident Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        required
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full min-h-11 pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full min-h-11 pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !email || !password}
                    className="w-full min-h-11 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <span>{loading ? 'Processing...' : isSignUp ? 'Create Resident Account' : 'Sign In'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(!isSignUp);
                        setErrorMsg(null);
                      }}
                      className="text-xs text-blue-600 hover:underline cursor-pointer"
                    >
                      {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* Tab 2: OTP / Magic Link */}
          {authMode === 'otp' && (
            <>
              {sentSuccess ? (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold mb-1">Magic Link Sent!</div>
                      <div>
                        We sent a sign-in link to <strong>{email}</strong>. Click the link in your email to log in.
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSentSuccess(false)}
                    className="w-full text-center text-xs text-slate-500 hover:text-slate-700 cursor-pointer pt-1"
                  >
                    Use a different email or re-send
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSendOtp} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Resident Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        required
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full min-h-11 pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="w-full min-h-11 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <Mail className="w-4 h-4" />
                    <span>{loading ? 'Sending link...' : 'Send Magic Link'}</span>
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
