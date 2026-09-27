import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { StatusBadge } from '../components/StatusBadge';
import { AllowanceSummary } from '../features/allowances/AllowanceSummary';
import { ActiveBookingBanner } from '../features/bookings/ActiveBookingBanner';
import { CalendarView } from '../features/calendar/CalendarView';
import { BookingModal } from '../features/bookings/BookingModal';
import { AdminModal } from '../features/admin/AdminModal';
import { AuthProvider } from '../features/auth/AuthContext';
import { fetchAllowances } from '../lib/api';
import { Reservation, Charger } from '../lib/types';
import { DateTime } from 'luxon';

vi.mock('../lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api')>();
  return { ...original, fetchAllowances: vi.fn() };
});

describe('StatusBadge component', () => {
  it('renders Charging badge for checked_in status', () => {
    render(<StatusBadge status="checked_in" />);
    expect(screen.getByText('Charging')).toBeInTheDocument();
  });

  it('renders Awaiting Check-in badge for own reserved status', () => {
    render(<StatusBadge status="reserved" isOwn={true} />);
    expect(screen.getByText('Awaiting Check-in')).toBeInTheDocument();
  });

  it('renders Reserved badge for other user reserved status', () => {
    render(<StatusBadge status="reserved" isOwn={false} />);
    expect(screen.getByText('Reserved')).toBeInTheDocument();
  });

  it('renders Released (No-show) for released_no_show status', () => {
    render(<StatusBadge status="released_no_show" />);
    expect(screen.getByText('Released (No-show)')).toBeInTheDocument();
  });
});

describe('AllowanceSummary component', () => {
  it('displays calculated daily and weekly values', () => {
    render(
      <AllowanceSummary
        allowances={{
          daily: { used_seconds: 5400, limit_seconds: 14400, remaining_seconds: 9000 },
          weekly: { used_seconds: 25200, limit_seconds: 43200, remaining_seconds: 18000 },
        }}
      />
    );

    // 5400s = 1h 30m, 14400s = 4h
    expect(screen.getByText('1h 30m / 4h')).toBeInTheDocument();
    // 25200s = 7h, 43200s = 12h
    expect(screen.getByText('7h / 12h')).toBeInTheDocument();
  });
});

describe('ActiveBookingBanner component', () => {
  const dummyChargers: Charger[] = [
    { id: 'c1', building_id: 'b1', display_name: 'Charger 1', enabled: true },
  ];

  it('renders I\'m charging button when booking is awaiting check-in', async () => {
    const now = DateTime.now().toUTC();
    const reservations: Reservation[] = [
      {
        id: 'res-test-1',
        building_id: 'b1',
        charger_id: 'c1',
        user_id: 'user-1',
        start_time: now.minus({ minutes: 5 }).toISO()!, // started 5m ago
        scheduled_end_time: now.plus({ hours: 1 }).toISO()!,
        effective_end_time: now.plus({ hours: 1 }).toISO()!,
        checkin_deadline: now.plus({ minutes: 10 }).toISO()!, // deadline in 10m
        status: 'reserved',
        version: 1,
        policy_version: 1,
      },
    ];

    const handleCheckIn = vi.fn().mockResolvedValue(undefined);
    const handleFinishEarly = vi.fn().mockResolvedValue(undefined);

    render(
      <ActiveBookingBanner
        reservations={reservations}
        chargers={dummyChargers}
        onCheckIn={handleCheckIn}
        onFinishEarly={handleFinishEarly}
      />
    );

    const button = screen.getByRole('button', { name: /I'm charging/i });
    expect(button).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(handleCheckIn).toHaveBeenCalledWith('res-test-1');
  });

  it('renders Finish early button when booking is checked in', async () => {
    const now = DateTime.now().toUTC();
    const reservations: Reservation[] = [
      {
        id: 'res-test-2',
        building_id: 'b1',
        charger_id: 'c1',
        user_id: 'user-1',
        start_time: now.minus({ minutes: 30 }).toISO()!,
        scheduled_end_time: now.plus({ hours: 1 }).toISO()!,
        effective_end_time: now.plus({ hours: 1 }).toISO()!,
        checkin_deadline: now.minus({ minutes: 15 }).toISO()!,
        status: 'checked_in',
        version: 1,
        policy_version: 1,
      },
    ];

    const handleCheckIn = vi.fn().mockResolvedValue(undefined);
    const handleFinishEarly = vi.fn().mockResolvedValue(undefined);

    render(
      <ActiveBookingBanner
        reservations={reservations}
        chargers={dummyChargers}
        onCheckIn={handleCheckIn}
        onFinishEarly={handleFinishEarly}
      />
    );

    const button = screen.getByRole('button', { name: /Finish early/i });
    expect(button).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(handleFinishEarly).toHaveBeenCalledWith('res-test-2');
  });
});

describe('CalendarView navigation', () => {
  it('requests a new availability range when moving to another week', () => {
    const onRangeChange = vi.fn();
    render(
      <CalendarView
        chargers={[{ id: 'c1', building_id: 'b1', display_name: 'Charger 1', enabled: true }]}
        blocks={[]}
        onRangeChange={onRangeChange}
        onSelectSlot={vi.fn()}
      />
    );

    const firstRange = onRangeChange.mock.lastCall;
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    const nextRange = onRangeChange.mock.lastCall;

    expect(nextRange).not.toEqual(firstRange);
    expect(DateTime.fromISO(nextRange![0]).diff(DateTime.fromISO(firstRange![0]), 'days').days).toBe(7);
  });
});

describe('BookingModal allowance preview', () => {
  it('uses the selected date allowance instead of today’s balance', async () => {
    vi.mocked(fetchAllowances).mockResolvedValue({
      daily: { used_seconds: 0, limit_seconds: 14400, remaining_seconds: 14400 },
      weekly: { used_seconds: 0, limit_seconds: 43200, remaining_seconds: 43200 },
    });
    const start = DateTime.now().setZone('Europe/Kyiv').plus({ days: 7 }).startOf('day').plus({ hours: 10 });
    render(
      <AuthProvider>
        <BookingModal
          isOpen
          onClose={vi.fn()}
          chargers={[{ id: 'c1', building_id: 'b1', display_name: 'Charger 1', enabled: true }]}
          selectedChargerId="c1"
          initialStartTime={start.toUTC().toISO()!}
          initialEndTime={start.plus({ hours: 1 }).toUTC().toISO()!}
          allowances={{
            daily: { used_seconds: 14400, limit_seconds: 14400, remaining_seconds: 0 },
            weekly: { used_seconds: 43200, limit_seconds: 43200, remaining_seconds: 0 },
          }}
          onConfirmReservation={vi.fn()}
        />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Reserve' })).toBeEnabled());
    expect(fetchAllowances).toHaveBeenCalled();
  });
});

describe('AdminModal charger controls', () => {
  it('sends the selected charger to the live update callback', async () => {
    const charger = { id: 'c1', building_id: 'b1', display_name: 'Charger 1', enabled: true };
    const onToggleCharger = vi.fn().mockResolvedValue(undefined);
    render(<AdminModal isOpen onClose={vi.fn()} chargers={[charger]} onToggleCharger={onToggleCharger} />);

    fireEvent.click(screen.getByRole('button', { name: 'Set Maintenance' }));
    await waitFor(() => expect(onToggleCharger).toHaveBeenCalledWith(charger));
  });
});
