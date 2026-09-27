import React, { useState, useEffect, useCallback } from 'react';
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
import { BookingModal } from './features/bookings/BookingModal';
import { MyBookingsModal } from './features/bookings/MyBookingsModal';
import { AdminModal } from './features/admin/AdminModal';
import { DateTime } from 'luxon';
import { DEFAULT_TIMEZONE } from './lib/time';

export const AppContent: React.FC = () => {
  const { currentUser } = useAuth();
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [myReservations, setMyReservations] = useState<Reservation[]>([]);
  const [allowances, setAllowances] = useState<AllowanceSummaryType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isMyBookingsOpen, setIsMyBookingsOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

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

  // Refresh all state
  const loadData = useCallback(async () => {
    try {
      const chargerList = await getChargers();
      setChargers(chargerList);

      const now = DateTime.now().setZone(DEFAULT_TIMEZONE);
      const rangeStart = now.minus({ days: 14 }).toUTC().toISO()!;
      const rangeEnd = now.plus({ days: 35 }).toUTC().toISO()!;

      const [calendarBlocks, userBookings, userAllowances] = await Promise.all([
        fetchCalendar('00000000-0000-0000-0000-000000000001', rangeStart, rangeEnd, currentUser.user_id),
        fetchMyReservations(currentUser.user_id),
        fetchAllowances('00000000-0000-0000-0000-000000000001', currentUser.user_id),
      ]);

      setBlocks(calendarBlocks);
      setMyReservations(userBookings);
      setAllowances(userAllowances);
    } catch (err: unknown) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadData();
    // Subscribe to in-memory store changes
    const unsubscribe = subscribeToStore(() => {
      loadData();
    });

    // Refresh every 15s while active, as specified in architecture stack
    const interval = setInterval(loadData, 15000);

    const onFocus = () => loadData();
    window.addEventListener('focus', onFocus);

    return () => {
      unsubscribe();
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadData]);

  // Actions
  const handleSelectSlot = (chargerId: string, startIso: string, endIso: string) => {
    setSelectedSlot({ chargerId, startIso, endIso });
    setIsBookingModalOpen(true);
  };

  const handleOpenNewBooking = () => {
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
        myBookingsCount={myReservations.filter((r) => ['reserved', 'checked_in'].includes(r.status)).length}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Active Booking Banner */}
        <ActiveBookingBanner
          reservations={myReservations}
          chargers={chargers}
          onCheckIn={handleCheckIn}
          onFinishEarly={handleFinishEarly}
        />

        {/* Quota & Allowance Progress */}
        <AllowanceSummary allowances={allowances} loading={loading} />

        {/* Calendar View */}
        <CalendarView
          chargers={chargers}
          blocks={blocks}
          currentUserId={currentUser.user_id}
          onSelectSlot={handleSelectSlot}
          onSelectExistingBooking={(block) => {
            if (block.is_own) {
              setIsMyBookingsOpen(true);
            }
          }}
        />
      </main>

      {/* Modals */}
      <BookingModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        chargers={chargers}
        selectedChargerId={selectedSlot?.chargerId || chargers[0]?.id || ''}
        initialStartTime={selectedSlot?.startIso}
        initialEndTime={selectedSlot?.endIso}
        allowances={allowances}
        onConfirmReservation={handleConfirmReservation}
        onBookNow={handleBookNow}
      />

      <MyBookingsModal
        isOpen={isMyBookingsOpen}
        onClose={() => setIsMyBookingsOpen(false)}
        reservations={myReservations}
        chargers={chargers}
        onCheckIn={handleCheckIn}
        onFinishEarly={handleFinishEarly}
        onCancel={handleCancel}
      />

      <AdminModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        chargers={chargers}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 animate-in slide-in-from-bottom-5">
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
