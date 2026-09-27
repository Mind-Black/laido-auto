import { supabase, isSupabaseConfigured } from './supabase';
import { mockStore, DEMO_USERS } from './mockStore';
import { Building, Charger, Reservation, AllowanceSummary, CalendarBlock, UserSession } from './types';

export const isLocalMode = !isSupabaseConfigured;

export async function getBuilding(): Promise<Building> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('buildings').select('*').limit(1).single();
    if (error) throw error;
    return data;
  }
  return mockStore.getBuilding();
}

export async function getChargers(): Promise<Charger[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('chargers').select('*').order('display_name');
    if (error) throw error;
    return data;
  }
  return mockStore.getChargers();
}

export async function fetchCalendar(
  buildingId: string,
  startIso: string,
  endIso: string,
  currentUserId: string,
  chargerId?: string
): Promise<CalendarBlock[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('get_calendar', {
      p_building_id: buildingId,
      p_start: startIso,
      p_end: endIso,
      p_charger_id: chargerId || null,
    });
    if (error) throw error;
    return data?.reservations || [];
  }
  return mockStore.getCalendar(currentUserId, startIso, endIso, chargerId);
}

export async function fetchAllowances(
  _buildingId: string,
  userId: string,
  dateIso?: string
): Promise<AllowanceSummary> {
  if (isSupabaseConfigured && supabase) {
    // If Supabase RPC get_my_allowances exists
    const { data, error } = await supabase.rpc('get_my_allowances', {
      p_date: dateIso || null,
    });
    if (!error && data) return data;
  }
  return mockStore.getAllowances(userId, dateIso);
}

export async function fetchMyReservations(userId: string): Promise<Reservation[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('user_id', userId)
      .order('start_time', { ascending: false });
    if (error) throw error;
    return data || [];
  }
  return mockStore.getMyReservations(userId);
}

export async function createReservation(params: {
  userId: string;
  userEmail: string;
  chargerId: string;
  startIso: string;
  endIso: string;
  idempotencyKey?: string;
}): Promise<Reservation> {
  if (!params.chargerId || params.chargerId.trim() === '') {
    throw new Error('Please select a valid charger. If no chargers are listed, run seed.sql in Supabase to create Charger 1 and Charger 2.');
  }

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('create_reservation', {
      p_charger_id: params.chargerId,
      p_start: params.startIso,
      p_end: params.endIso,
      p_idempotency_key: params.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data;
  }
  return mockStore.createReservation(
    params.userId,
    params.userEmail,
    params.chargerId,
    params.startIso,
    params.endIso
  );
}

export async function bookNow(params: {
  userId: string;
  userEmail: string;
  chargerId: string;
  durationMinutes: number;
}): Promise<Reservation> {
  if (!params.chargerId || params.chargerId.trim() === '') {
    throw new Error('Please select a valid charger. If no chargers are listed, run seed.sql in Supabase to create Charger 1 and Charger 2.');
  }

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('book_now', {
      p_charger_id: params.chargerId,
      p_end: new Date(Date.now() + params.durationMinutes * 60000).toISOString(),
    });
    if (error) throw new Error(error.message);
    return data;
  }
  return mockStore.bookNow(params.userId, params.userEmail, params.chargerId, params.durationMinutes);
}

export async function checkIn(userId: string, reservationId: string): Promise<Reservation> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('check_in', {
      p_reservation_id: reservationId,
    });
    if (error) throw new Error(error.message);
    return data;
  }
  return mockStore.checkIn(userId, reservationId);
}

export async function finishEarly(userId: string, reservationId: string): Promise<Reservation> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('finish_early', {
      p_reservation_id: reservationId,
    });
    if (error) throw new Error(error.message);
    return data;
  }
  return mockStore.finishEarly(userId, reservationId);
}

export async function cancelReservation(userId: string, reservationId: string): Promise<Reservation> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('cancel_reservation', {
      p_reservation_id: reservationId,
    });
    if (error) throw new Error(error.message);
    return data;
  }
  return mockStore.cancelReservation(userId, reservationId);
}

export function getDemoUsers(): UserSession[] {
  return DEMO_USERS;
}

export function subscribeToStore(listener: () => void): () => void {
  return mockStore.subscribe(listener);
}
