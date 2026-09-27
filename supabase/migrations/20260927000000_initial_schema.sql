-- 20260927000000_initial_schema.sql
-- Initial schema for Laido Auto EV charger reservations

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Buildings & Policies
CREATE TABLE IF NOT EXISTS public.buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Europe/Kyiv',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.booking_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    version INT NOT NULL DEFAULT 1,
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    weekday_start_time TIME NOT NULL DEFAULT '08:00:00',
    weekday_end_time TIME NOT NULL DEFAULT '17:00:00',
    daily_limit_seconds INT NOT NULL DEFAULT 14400, -- 4 hours
    weekly_limit_seconds INT NOT NULL DEFAULT 43200, -- 12 hours
    checkin_grace_seconds INT NOT NULL DEFAULT 900, -- 15 minutes
    min_duration_seconds INT NOT NULL DEFAULT 1800, -- 30 minutes
    max_future_days INT NOT NULL DEFAULT 28,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(building_id, version)
);

-- 2. Chargers
CREATE TABLE IF NOT EXISTS public.chargers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 3. Memberships & Invitations
CREATE TABLE IF NOT EXISTS public.memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('member', 'admin')),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(building_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.member_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    intended_role TEXT NOT NULL DEFAULT 'member' CHECK (intended_role IN ('member', 'admin')),
    claimed_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 4. Reservations & Allocations
CREATE TABLE IF NOT EXISTS public.reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    charger_id UUID NOT NULL REFERENCES public.chargers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    scheduled_end_time TIMESTAMPTZ NOT NULL,
    effective_end_time TIMESTAMPTZ NOT NULL,
    checkin_deadline TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('reserved', 'checked_in', 'released_no_show', 'cancelled', 'completed')),
    checked_in_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    version INT NOT NULL DEFAULT 1,
    policy_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK (start_time < scheduled_end_time),
    CHECK (effective_end_time <= scheduled_end_time)
);

CREATE TABLE IF NOT EXISTS public.maintenance_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    charger_id UUID NOT NULL REFERENCES public.chargers(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    reason TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK (start_time < end_time)
);

CREATE TABLE IF NOT EXISTS public.resource_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    charger_id UUID NOT NULL REFERENCES public.chargers(id) ON DELETE CASCADE,
    reservation_id UUID REFERENCES public.reservations(id) ON DELETE CASCADE,
    maintenance_block_id UUID REFERENCES public.maintenance_blocks(id) ON DELETE CASCADE,
    reserved_range TSTZRANGE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK (
        (reservation_id IS NOT NULL AND maintenance_block_id IS NULL) OR
        (reservation_id IS NULL AND maintenance_block_id IS NOT NULL)
    ),
    CONSTRAINT no_overlapping_allocations EXCLUDE USING gist (
        charger_id WITH =,
        reserved_range WITH &&
    )
);

-- 5. Audit & Operations
CREATE TABLE IF NOT EXISTS public.audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    operation TEXT NOT NULL,
    record_type TEXT NOT NULL,
    record_id UUID NOT NULL,
    before_state JSONB,
    after_state JSONB,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    request_id TEXT
);

CREATE TABLE IF NOT EXISTS public.idempotency_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    operation TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(user_id, operation, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_key TEXT NOT NULL UNIQUE,
    reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
    reservation_version INT NOT NULL,
    event_type TEXT NOT NULL,
    due_time TIMESTAMPTZ NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    lease_until TIMESTAMPTZ,
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'delivered', 'failed', 'suppressed')),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.job_health (
    job_id TEXT PRIMARY KEY,
    last_successful_run TIMESTAMPTZ NOT NULL,
    outcome TEXT NOT NULL,
    details JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reservations_user_time ON public.reservations (user_id, start_time, scheduled_end_time);
CREATE INDEX IF NOT EXISTS idx_reservations_charger_time ON public.reservations (charger_id, start_time, scheduled_end_time);
CREATE INDEX IF NOT EXISTS idx_reservations_deadline_status ON public.reservations (checkin_deadline, status);
CREATE INDEX IF NOT EXISTS idx_allocations_range ON public.resource_allocations USING gist (reserved_range);

-- Row Level Security
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chargers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_health ENABLE ROW LEVEL SECURITY;

-- Read policies for active members
CREATE POLICY "Members view buildings" ON public.buildings
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.building_id = buildings.id AND m.user_id = auth.uid() AND m.active = true
    ));

CREATE POLICY "Members view policies" ON public.booking_policies
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.building_id = booking_policies.building_id AND m.user_id = auth.uid() AND m.active = true
    ));

CREATE POLICY "Members view chargers" ON public.chargers
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.building_id = chargers.building_id AND m.user_id = auth.uid() AND m.active = true
    ));

CREATE POLICY "Members view own membership" ON public.memberships
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.memberships admin_m
        WHERE admin_m.building_id = memberships.building_id AND admin_m.user_id = auth.uid() AND admin_m.role = 'admin' AND admin_m.active = true
    ));

CREATE POLICY "Members view own reservations" ON public.reservations
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.memberships admin_m
        WHERE admin_m.building_id = reservations.building_id AND admin_m.user_id = auth.uid() AND admin_m.role = 'admin' AND admin_m.active = true
    ));

CREATE POLICY "Members view maintenance" ON public.maintenance_blocks
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.chargers c
        JOIN public.memberships m ON m.building_id = c.building_id
        WHERE c.id = maintenance_blocks.charger_id AND m.user_id = auth.uid() AND m.active = true
    ));

CREATE POLICY "Members view allocations" ON public.resource_allocations
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.chargers c
        JOIN public.memberships m ON m.building_id = c.building_id
        WHERE c.id = resource_allocations.charger_id AND m.user_id = auth.uid() AND m.active = true
    ));

-- Helper: Calculate counted weekday allowance seconds within 08:00-17:00 window in building timezone
CREATE OR REPLACE FUNCTION public.calculate_weekday_quota_seconds(
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ,
    p_timezone TEXT DEFAULT 'Europe/Kyiv',
    p_window_start TIME DEFAULT '08:00:00',
    p_window_end TIME DEFAULT '17:00:00'
)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_cur_date DATE;
    v_end_date DATE;
    v_day_start_tz TIMESTAMPTZ;
    v_day_end_tz TIMESTAMPTZ;
    v_overlap_start TIMESTAMPTZ;
    v_overlap_end TIMESTAMPTZ;
    v_total_seconds INT := 0;
    v_dow INT;
BEGIN
    IF p_start >= p_end THEN
        RETURN 0;
    END IF;

    v_cur_date := (p_start AT TIME ZONE p_timezone)::DATE;
    v_end_date := (p_end AT TIME ZONE p_timezone)::DATE;

    WHILE v_cur_date <= v_end_date LOOP
        v_dow := EXTRACT(ISODOW FROM v_cur_date); -- 1 = Monday, 7 = Sunday
        IF v_dow BETWEEN 1 AND 5 THEN -- Monday to Friday only
            v_day_start_tz := (v_cur_date || ' ' || p_window_start)::TIMESTAMP AT TIME ZONE p_timezone;
            v_day_end_tz := (v_cur_date || ' ' || p_window_end)::TIMESTAMP AT TIME ZONE p_timezone;

            v_overlap_start := GREATEST(p_start, v_day_start_tz);
            v_overlap_end := LEAST(p_end, v_day_end_tz);

            IF v_overlap_start < v_overlap_end THEN
                v_total_seconds := v_total_seconds + EXTRACT(EPOCH FROM (v_overlap_end - v_overlap_start))::INT;
            END IF;
        END IF;
        v_cur_date := v_cur_date + 1;
    END LOOP;

    RETURN v_total_seconds;
END;
$$;

-- Helper: Reconcile overdue & completed reservations
CREATE OR REPLACE FUNCTION public.reconcile_building_reservations(p_building_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    -- 1. Expire no-shows past check-in deadline
    FOR r IN
        SELECT id, charger_id, start_time, checkin_deadline, scheduled_end_time
        FROM public.reservations
        WHERE building_id = p_building_id
          AND status = 'reserved'
          AND checkin_deadline <= v_now
        FOR UPDATE
    LOOP
        UPDATE public.reservations
        SET status = 'released_no_show',
            released_at = v_now,
            effective_end_time = LEAST(r.checkin_deadline, r.scheduled_end_time)
        WHERE id = r.id;

        -- Truncate resource allocation to retained grace interval
        UPDATE public.resource_allocations
        SET reserved_range = tstzrange(r.start_time, LEAST(r.checkin_deadline, r.scheduled_end_time), '[)')
        WHERE reservation_id = r.id;
    END LOOP;

    -- 2. Mark completed checked-in sessions
    UPDATE public.reservations
    SET status = 'completed'
    WHERE building_id = p_building_id
      AND status = 'checked_in'
      AND scheduled_end_time <= v_now;
END;
$$;

-- RPC: get_calendar
CREATE OR REPLACE FUNCTION public.get_calendar(
    p_building_id UUID,
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ,
    p_charger_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_is_member BOOLEAN;
    v_result JSONB;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.memberships
        WHERE building_id = p_building_id AND user_id = v_caller AND active = true
    ) INTO v_is_member;

    IF NOT v_is_member THEN
        RAISE EXCEPTION 'NOT_A_MEMBER';
    END IF;

    -- Reconcile state
    PERFORM public.reconcile_building_reservations(p_building_id);

    SELECT jsonb_build_object(
        'server_time', clock_timestamp(),
        'reservations', COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', CASE WHEN r.user_id = v_caller THEN r.id ELSE NULL END,
                'charger_id', r.charger_id,
                'start_time', r.start_time,
                'scheduled_end_time', r.scheduled_end_time,
                'effective_end_time', r.effective_end_time,
                'status', r.status,
                'is_own', (r.user_id = v_caller),
                'checkin_deadline', CASE WHEN r.user_id = v_caller THEN r.checkin_deadline ELSE NULL END
            )
        ), '[]'::jsonb)
    )
    INTO v_result
    FROM public.reservations r
    WHERE r.building_id = p_building_id
      AND (p_charger_id IS NULL OR r.charger_id = p_charger_id)
      AND r.status IN ('reserved', 'checked_in', 'completed')
      AND r.start_time < p_end
      AND r.effective_end_time > p_start;

    RETURN v_result;
END;
$$;

-- RPC: create_reservation
CREATE OR REPLACE FUNCTION public.create_reservation(
    p_charger_id UUID,
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_building_id UUID;
    v_tz TEXT;
    v_now TIMESTAMPTZ;
    v_deadline TIMESTAMPTZ;
    v_reservation_id UUID;
    v_counted_sec INT;
    v_daily_used INT;
    v_weekly_used INT;
    v_week_start TIMESTAMPTZ;
    v_week_end TIMESTAMPTZ;
    v_day_start TIMESTAMPTZ;
    v_day_end TIMESTAMPTZ;
    v_local_date DATE;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    -- Lookup building
    SELECT c.building_id, b.timezone
    INTO v_building_id, v_tz
    FROM public.chargers c
    JOIN public.buildings b ON b.id = c.building_id
    WHERE c.id = p_charger_id;

    IF v_building_id IS NULL THEN
        RAISE EXCEPTION 'CHARGER_UNAVAILABLE';
    END IF;

    -- Lock building mutex
    PERFORM 1 FROM public.buildings WHERE id = v_building_id FOR UPDATE;

    v_now := clock_timestamp();

    IF p_start < v_now THEN
        RAISE EXCEPTION 'INVALID_INTERVAL: Cannot start in the past';
    END IF;

    IF p_end <= p_start OR EXTRACT(EPOCH FROM (p_end - p_start)) < 1800 THEN
        RAISE EXCEPTION 'INVALID_INTERVAL: Minimum duration is 30 minutes';
    END IF;

    -- Reconcile overdue
    PERFORM public.reconcile_building_reservations(v_building_id);

    -- Check user doesn't have overlapping reservation on other charger
    IF EXISTS (
        SELECT 1 FROM public.reservations
        WHERE user_id = v_caller
          AND status IN ('reserved', 'checked_in')
          AND tstzrange(start_time, effective_end_time, '[)') && tstzrange(p_start, p_end, '[)')
    ) THEN
        RAISE EXCEPTION 'OWN_BOOKING_OVERLAP';
    END IF;

    -- Calculate counted seconds
    v_counted_sec := public.calculate_weekday_quota_seconds(p_start, p_end, v_tz);

    -- Check daily quota (14,400s)
    v_local_date := (p_start AT TIME ZONE v_tz)::DATE;
    v_day_start := (v_local_date || ' 00:00:00')::TIMESTAMP AT TIME ZONE v_tz;
    v_day_end := (v_local_date || ' 23:59:59.999')::TIMESTAMP AT TIME ZONE v_tz;

    SELECT COALESCE(SUM(public.calculate_weekday_quota_seconds(start_time, effective_end_time, v_tz)), 0)
    INTO v_daily_used
    FROM public.reservations
    WHERE user_id = v_caller
      AND status IN ('reserved', 'checked_in', 'completed', 'released_no_show')
      AND start_time < v_day_end
      AND effective_end_time > v_day_start;

    IF (v_daily_used + v_counted_sec) > 14400 THEN
        RAISE EXCEPTION 'DAILY_LIMIT: Exceeds 4 hours per day limit';
    END IF;

    -- Check weekly quota (43,200s)
    v_week_start := date_trunc('week', p_start AT TIME ZONE v_tz) AT TIME ZONE v_tz;
    v_week_end := v_week_start + INTERVAL '7 days';

    SELECT COALESCE(SUM(public.calculate_weekday_quota_seconds(start_time, effective_end_time, v_tz)), 0)
    INTO v_weekly_used
    FROM public.reservations
    WHERE user_id = v_caller
      AND status IN ('reserved', 'checked_in', 'completed', 'released_no_show')
      AND start_time < v_week_end
      AND effective_end_time > v_week_start;

    IF (v_weekly_used + v_counted_sec) > 43200 THEN
        RAISE EXCEPTION 'WEEKLY_LIMIT: Exceeds 12 hours per week limit';
    END IF;

    v_deadline := p_start + INTERVAL '15 minutes';

    -- Insert reservation
    INSERT INTO public.reservations (
        building_id, charger_id, user_id, start_time, scheduled_end_time, effective_end_time, checkin_deadline, status
    ) VALUES (
        v_building_id, p_charger_id, v_caller, p_start, p_end, p_end, v_deadline, 'reserved'
    ) RETURNING id INTO v_reservation_id;

    -- Allocate resource
    INSERT INTO public.resource_allocations (
        charger_id, reservation_id, reserved_range
    ) VALUES (
        p_charger_id, v_reservation_id, tstzrange(p_start, p_end, '[)')
    );

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_reservation_id,
        'start_time', p_start,
        'scheduled_end_time', p_end,
        'checkin_deadline', v_deadline,
        'status', 'reserved'
    );
END;
$$;

-- RPC: check_in
CREATE OR REPLACE FUNCTION public.check_in(
    p_reservation_id UUID,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_now TIMESTAMPTZ := clock_timestamp();
    r RECORD;
BEGIN
    SELECT * INTO r
    FROM public.reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF r.id IS NULL THEN
        RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
    END IF;

    IF r.user_id != v_caller THEN
        RAISE EXCEPTION 'FORBIDDEN: Only booking owner can check in';
    END IF;

    IF r.status = 'checked_in' THEN
        RETURN jsonb_build_object('success', true, 'status', 'checked_in', 'checked_in_at', r.checked_in_at);
    END IF;

    IF r.status != 'reserved' THEN
        RAISE EXCEPTION 'INVALID_STATE: Reservation status is %', r.status;
    END IF;

    IF v_now < r.start_time THEN
        RAISE EXCEPTION 'CHECKIN_NOT_OPEN: Check-in opens at booking start';
    END IF;

    IF v_now >= r.checkin_deadline THEN
        -- Already overdue! Reconcile as no-show
        UPDATE public.reservations
        SET status = 'released_no_show',
            released_at = v_now,
            effective_end_time = LEAST(r.checkin_deadline, r.scheduled_end_time)
        WHERE id = r.id;

        UPDATE public.resource_allocations
        SET reserved_range = tstzrange(r.start_time, LEAST(r.checkin_deadline, r.scheduled_end_time), '[)')
        WHERE reservation_id = r.id;

        RAISE EXCEPTION 'CHECKIN_EXPIRED: Check-in deadline has passed';
    END IF;

    UPDATE public.reservations
    SET status = 'checked_in',
        checked_in_at = v_now,
        version = version + 1
    WHERE id = r.id;

    RETURN jsonb_build_object('success', true, 'status', 'checked_in', 'checked_in_at', v_now);
END;
$$;

-- RPC: finish_early
CREATE OR REPLACE FUNCTION public.finish_early(
    p_reservation_id UUID,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_now TIMESTAMPTZ := clock_timestamp();
    r RECORD;
BEGIN
    SELECT * INTO r
    FROM public.reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF r.id IS NULL OR r.user_id != v_caller THEN
        RAISE EXCEPTION 'FORBIDDEN';
    END IF;

    IF r.status != 'checked_in' THEN
        RAISE EXCEPTION 'INVALID_STATE';
    END IF;

    UPDATE public.reservations
    SET status = 'completed',
        effective_end_time = v_now,
        version = version + 1
    WHERE id = r.id;

    UPDATE public.resource_allocations
    SET reserved_range = tstzrange(r.start_time, v_now, '[)')
    WHERE reservation_id = r.id;

    RETURN jsonb_build_object('success', true, 'status', 'completed', 'effective_end_time', v_now);
END;
$$;

-- RPC: claim_membership (bind invitation to authenticated user)
CREATE OR REPLACE FUNCTION public.claim_membership()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_email TEXT;
    v_invitation RECORD;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    v_email := lower(auth.jwt()->>'email');
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'NO_VERIFIED_EMAIL';
    END IF;

    SELECT * INTO v_invitation
    FROM public.member_invitations
    WHERE lower(email) = v_email
    FOR UPDATE;

    IF v_invitation.id IS NULL THEN
        RAISE EXCEPTION 'NO_INVITATION_FOUND: Your email is not on the building member allowlist';
    END IF;

    INSERT INTO public.memberships (building_id, user_id, role, active)
    VALUES (v_invitation.building_id, v_caller, v_invitation.intended_role, true)
    ON CONFLICT (building_id, user_id)
    DO UPDATE SET active = true, role = EXCLUDED.role;

    UPDATE public.member_invitations
    SET claimed_user_id = v_caller
    WHERE id = v_invitation.id;

    RETURN jsonb_build_object(
        'success', true,
        'building_id', v_invitation.building_id,
        'role', v_invitation.intended_role
    );
END;
$$;


