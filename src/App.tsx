import React, { Suspense, lazy, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './features/auth/AuthContext';
import {
  Charger,
  CalendarBlock,
  Reservation,
  AllowanceSummary as AllowanceSummaryType,
} from './lib/types';
import {
  getChargers,
  fetchCalendar,
  fetchAllowances,
  fetchMyReservations,
  createReservation,
  bookNow,
  checkIn,
  finishEarly,
  cancelReservation,
  subscribeToStore,
} from './lib/api';
import { Header } from './components/Header';
import { ConfigBanner } from './components/ConfigBanner';
import { AllowanceSummary } from './features/allowances/AllowanceSummary';
import { ActiveBookingBanner } from './features/bookings/ActiveBookingBanner';
import { CalendarView } from './features/calendar/CalendarView';
import { DateTime } from 'luxon';
import { DEFAULT_TIMEZONE } from './lib/time';
import { AlertCircle, LogIn, Plus } from 'lucide-react';

const BookingModal = lazy(() => import('./features/bookings/BookingModal').then((module) => ({ default: module.BookingModal })));
const MyBookingsModal = lazy(() => import('./features/bookings/MyBookingsModal').then((module) => ({ default: module.MyBookingsModal })));
const AdminModal = lazy(() => import('./features/admin/AdminModal').then((module) => ({ default: module.AdminModal })));
const LoginModal = lazy(() => import('./features/auth/LoginModal').then((module) => ({ default: module.LoginModal })));

const initialWeek = DateTime.now().setZone(DEFAULT_TIMEZONE).startOf('week');
const initialCalendarRange = {
  start: initialWeek.minus({ weeks: 1 }).toUTC().toISO()!,
  end: initialWeek.plus({ weeks: 2 }).toUTC().toISO()!,
};

export const AppContent: React.FC = () => {
  const { currentUser, isConfigured, isLoggedIn } = useAuth();
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [myReservations, setMyReservations] = useState<Reservation[]>([]);
  const [allowances, setAllowances] = useState<AllowanceSummaryType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chargerError, setChargerError] = useState<string | null>(null);
  const [calendarRange, setCalendarRange] = useState(initialCalendarRange);
  const requestId = useRef(0);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isMyBookingsOpen, setIsMyBookingsOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  // Selected slot from drag/click
  const [selectedSlot, setSelectedSlot] = useState<{
    chargerId: string;
    startIso: string;
    endIso: string;
  } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleCalendarRangeChange = useCallback((start: string, end: string) => {
    setCalendarRange((range) => range.start === start && range.end === end ? range : { start, end });
  }, []);

  useEffect(() => {
    let active = true;
    getChargers()
      .then((list) => { if (active) { setChargers(list); setChargerError(null); } })
      .catch(() => { if (active) setChargerError('Chargers could not be loaded. Please retry.'); });
    return () => { active = false; };
  }, [currentUser.user_id]);

  // Refresh the visible calendar and account data. Ignore responses from superseded requests.
  const loadData = useCallback(async () => {
    const currentRequest = ++requestId.current;
    try {
      if (!isConfigured || isLoggedIn) {
        const [calendarBlocks, userBookings, userAllowances] = await Promise.all([
          fetchCalendar('00000000-0000-0000-0000-000000000001', calendarRange.start, calendarRange.end, currentUser.user_id),
          fetchMyReservations(currentUser.user_id),
          fetchAllowances('00000000-0000-0000-0000-000000000001', currentUser.user_id),
        ]);

        if (currentRequest !== requestId.current) return;
        setBlocks(calendarBlocks);
        setMyReservations(userBookings);
        setAllowances(userAllowances);
      } else {
        if (currentRequest !== requestId.current) return;
        setBlocks([]);
        setMyReservations([]);
        setAllowances(null);
      }
      setLoadError(null);
    } catch (err: unknown) {
      console.error('Error loading data:', err);
      if (currentRequest === requestId.current) {
        setLoadError('Availability could not be updated. Check your connection and try again.');
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [calendarRange, currentUser.user_id, isConfigured, isLoggedIn]);

  useEffect(() => {
    const pendingRequests = requestId;
    setLoading(true);
    loadData();
    // Subscribe to in-memory store changes
    const unsubscribe = subscribeToStore(() => {
      loadData();
    });

    // Keep availability fresh without polling background tabs.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadData();
    }, 30000);

    const onFocus = () => loadData();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadData();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      pendingRequests.current++;
      unsubscribe();
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadData]);

  // Actions
  const handleSelectSlot = (chargerId: string, startIso: string, endIso: string) => {
    if (isConfigured && !isLoggedIn) {
      setIsLoginOpen(true);
      return;
    }
    setSelectedSlot({ chargerId, startIso, endIso });
    setIsBookingModalOpen(true);
  };

  const handleOpenNewBooking = () => {
    if (isConfigured && !isLoggedIn) {
      setIsLoginOpen(true);
      return;
    }
    setSelectedSlot(null);
    setIsBookingModalOpen(true);
  };

  const handleConfirmReservation = async (chargerId: string, startIso: string, endIso: string) => {
    await createReservation({
      userId: currentUser.user_id,
      userEmail: currentUser.email,
      chargerId,
      startIso,
      endIso,
    });
    showToast('Reservation confirmed!');
    await loadData();
  };

  const handleBookNow = async (chargerId: string, durationMinutes: number) => {
    await bookNow({
      userId: currentUser.user_id,
      userEmail: currentUser.email,
      chargerId,
      durationMinutes,
    });
    showToast("Booked now & confirmed charging!");
    await loadData();
  };

  const handleCheckIn = async (reservationId: string) => {
    try {
      await checkIn(currentUser.user_id, reservationId);
      showToast("Checked in successfully! You are now charging.");
      await loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Check-in failed', 'error');
      await loadData();
      throw err;
    }
  };

  const handleFinishEarly = async (reservationId: string) => {
    try {
      await finishEarly(currentUser.user_id, reservationId);
      showToast('Finished charging early. Remainder released.');
      await loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Action failed', 'error');
      throw err;
    }
  };

  const handleCancel = async (reservationId: string) => {
    try {
      await cancelReservation(currentUser.user_id, reservationId);
      showToast('Reservation cancelled.');
      await loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Cancel failed', 'error');
      throw err;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      <ConfigBanner />

      <Header
        onOpenNewBooking={handleOpenNewBooking}
        onOpenMyBookings={() => setIsMyBookingsOpen(true)}
        onOpenAdmin={() => setIsAdminOpen(true)}
        onOpenLogin={() => setIsLoginOpen(true)}
        myBookingsCount={myReservations.filter((r) => ['reserved', 'checked_in'].includes(r.status)).length}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Unauthenticated notice in live Supabase mode */}
        {isConfigured && !isLoggedIn && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-4 text-xs text-blue-950">
            <div>
              <div className="font-semibold text-sm mb-0.5">Welcome to Laido Building 1 EV Charging</div>
              <p className="text-blue-800">
                Please sign in with your resident account to view live availability, reserve chargers, and manage check-ins.
              </p>
            </div>
            <button
              onClick={() => setIsLoginOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign in</span>
            </button>
          </div>
        )}

        {(loadError || chargerError) && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-3 text-sm text-rose-900">
            <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{loadError || chargerError}</span>
            <button onClick={() => { loadData(); getChargers().then((list) => { setChargers(list); setChargerError(null); }).catch(() => setChargerError('Chargers could not be loaded. Please retry.')); }} className="shrink-0 font-semibold underline underline-offset-2">Retry</button>
          </div>
        )}

        {/* Active Booking Banner */}
        {isLoggedIn && (
          <ActiveBookingBanner
            reservations={myReservations}
            chargers={chargers}
            onCheckIn={handleCheckIn}
            onFinishEarly={handleFinishEarly}
          />
        )}

        {/* Quota & Allowance Progress */}
        {isLoggedIn && <AllowanceSummary allowances={allowances} loading={loading} />}

        {isLoggedIn && (
          <button onClick={handleOpenNewBooking} className="sm:hidden w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm active:bg-blue-700">
            <Plus className="w-4 h-4" /> New booking
          </button>
        )}

        {/* Calendar View */}
        <CalendarView
          chargers={chargers}
          blocks={blocks}
          loading={loading}
          onRangeChange={handleCalendarRangeChange}
          onSelectSlot={handleSelectSlot}
          onSelectExistingBooking={(block) => {
            if (block.is_own) {
              setIsMyBookingsOpen(true);
            }
          }}
        />
      </main>

      {/* Modals */}
      <Suspense fallback={null}>
      {isBookingModalOpen && <BookingModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        chargers={chargers}
        selectedChargerId={selectedSlot?.chargerId || chargers[0]?.id || ''}
        initialStartTime={selectedSlot?.startIso}
        initialEndTime={selectedSlot?.endIso}
        allowances={allowances}
        onConfirmReservation={handleConfirmReservation}
        onBookNow={handleBookNow}
      />}

      {isMyBookingsOpen && <MyBookingsModal
        isOpen={isMyBookingsOpen}
        onClose={() => setIsMyBookingsOpen(false)}
        reservations={myReservations}
        chargers={chargers}
        onCheckIn={handleCheckIn}
        onFinishEarly={handleFinishEarly}
        onCancel={handleCancel}
      />}

      {isAdminOpen && <AdminModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        chargers={chargers}
      />}

      {isLoginOpen && <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
      />}
      </Suspense>

      {/* Toast Notification */}
      {toastMessage && (
        <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-50 animate-in slide-in-from-bottom-5">
          <div
            className={`px-4 py-2.5 rounded-lg shadow-lg text-xs font-semibold flex items-center gap-2 border ${
              toastMessage.type === 'error'
                ? 'bg-rose-600 text-white border-rose-700'
                : 'bg-slate-900 text-white border-slate-800'
            }`}
          >
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}
    </div>
  );
};
