import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../features/auth/AuthContext';
import { AppContent } from '../App';

vi.mock('../lib/api', () => ({
  getChargers: vi.fn().mockResolvedValue([
    { id: 'c1', building_id: 'b1', display_name: 'Charger 1', enabled: true },
  ]),
  fetchCalendar: vi.fn().mockResolvedValue([]),
  fetchMyReservations: vi.fn().mockRejectedValue(new Error('membership policy failure')),
  fetchAllowances: vi.fn().mockResolvedValue({
    daily: { used_seconds: 0, limit_seconds: 14400, remaining_seconds: 14400 },
    weekly: { used_seconds: 0, limit_seconds: 43200, remaining_seconds: 43200 },
  }),
  subscribeToStore: vi.fn().mockReturnValue(() => {}),
}));

afterEach(() => vi.restoreAllMocks());

describe('App data loading', () => {
  it('keeps successful account data visible when another request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AuthProvider><AppContent /></AuthProvider>);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Your bookings could not be updated.'));
    expect(screen.getByText('0m / 4h')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Charger 1' })).toBeInTheDocument();
  });
});
