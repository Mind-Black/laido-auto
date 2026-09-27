import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { StatusBadge } from '../components/StatusBadge';
import { AllowanceSummary } from '../features/allowances/AllowanceSummary';
import { ActiveBookingBanner } from '../features/bookings/ActiveBookingBanner';
import { Reservation, Charger } from '../lib/types';
import { DateTime } from 'luxon';

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
