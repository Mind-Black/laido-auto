-- Migration: 20260927000001_complete_rpcs_and_allowlist.sql
-- Description: Complete missing RPCs (book_now, cancel_reservation, get_my_allowances), 
-- relax past-interval clock skew, auto-claim membership for verified users, and allow public read for charger metadata.

-- 1. Public read policies for buildings, chargers, and policies so client can display chargers immediately
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'buildings' AND policyname = 'Anon view buildings'
    ) THEN
        CREATE POLICY "Anon view buildings" ON public.buildings FOR SELECT TO anon USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'booking_policies' AND policyname = 'Anon view policies'
    ) THEN
        CREATE POLICY "Anon view policies" ON public.booking_policies FOR SELECT TO anon USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'chargers' AND policyname = 'Anon view chargers'
    ) THEN
        CREATE POLICY "Anon view chargers" ON public.chargers FOR SELECT TO anon USING (true);
    END IF;
END $$;

-- 2. Enhanced claim_membership: claims invite if present, otherwise auto-joins Building 1 as member
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
    v_b_id UUID;
    v_role TEXT := 'member';
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    v_email := lower(auth.jwt()->>'email');
    
    -- Check if invitation exists
    SELECT * INTO v_invitation
    FROM public.member_invitations
    WHERE lower(email) = v_email;

    IF v_invitation.id IS NOT NULL THEN
        v_b_id := v_invitation.building_id;
        v_role := v_invitation.intended_role;
        UPDATE public.member_invitations
        SET claimed_user_id = v_caller
        WHERE id = v_invitation.id;
    ELSE
        -- Default to Building 1
        SELECT id INTO v_b_id FROM public.buildings LIMIT 1;
    END IF;

    IF v_b_id IS NOT NULL THEN
        INSERT INTO public.memberships (building_id, user_id, role, active)
        VALUES (v_b_id, v_caller, v_role, true)
        ON CONFLICT (building_id, user_id)
        DO UPDATE SET active = true, role = CASE WHEN memberships.role = 'admin' THEN 'admin' ELSE EXCLUDED.role END;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'building_id', v_b_id,
        'role', v_role
    );
END;
$$;

-- 3. Enhanced create_reservation with 2-minute clock skew tolerance and auto-membership check
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
    v_actual_start TIMESTAMPTZ;
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
    v_is_member BOOLEAN;
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

    -- Auto-membership if missing
    SELECT EXISTS (
        SELECT 1 FROM public.memberships
        WHERE building_id = v_building_id AND user_id = v_caller AND active = true
    ) INTO v_is_member;

    IF NOT v_is_member THEN
        INSERT INTO public.memberships (building_id, user_id, role, active)
        VALUES (v_building_id, v_caller, 'member', true)
        ON CONFLICT (building_id, user_id)
        DO UPDATE SET active = true;
    END IF;

    -- Lock building mutex
    PERFORM 1 FROM public.buildings WHERE id = v_building_id FOR UPDATE;

    v_now := clock_timestamp();

    -- Allow 2-minute clock skew for slot selections
    IF p_start < (v_now - INTERVAL '2 minutes') THEN
        RAISE EXCEPTION 'INVALID_INTERVAL: Cannot start in the past';
    END IF;

    v_actual_start := p_start;

    IF p_end <= v_actual_start OR EXTRACT(EPOCH FROM (p_end - v_actual_start)) < 1800 THEN
        RAISE EXCEPTION 'INVALID_INTERVAL: Minimum duration is 30 minutes';
    END IF;

    -- Reconcile overdue
    PERFORM public.reconcile_building_reservations(v_building_id);

    -- Check user doesn't have overlapping reservation on any charger
    IF EXISTS (
        SELECT 1 FROM public.reservations
        WHERE user_id = v_caller
          AND status IN ('reserved', 'checked_in')
          AND tstzrange(start_time, effective_end_time, '[)') && tstzrange(v_actual_start, p_end, '[)')
    ) THEN
        RAISE EXCEPTION 'OWN_BOOKING_OVERLAP';
    END IF;

    -- Calculate counted seconds
    v_counted_sec := public.calculate_weekday_quota_seconds(v_actual_start, p_end, v_tz);

    -- Check daily quota (14,400s)
    v_local_date := (v_actual_start AT TIME ZONE v_tz)::DATE;
    v_day_start := (v_local_date || ' 00:00:00')::TIMESTAMP AT TIME ZONE v_tz;
    v_day_end := (v_local_date || ' 23:59:59.999')::TIMESTAMP AT TIME ZONE v_tz;

    SELECT COALESCE(SUM(public.calculate_weekday_quota_seconds(
        GREATEST(start_time, v_day_start),
        LEAST(effective_end_time, v_day_end),
        v_tz
    )), 0)
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
    v_week_start := date_trunc('week', v_actual_start AT TIME ZONE v_tz) AT TIME ZONE v_tz;
    v_week_end := v_week_start + INTERVAL '7 days';

    SELECT COALESCE(SUM(public.calculate_weekday_quota_seconds(
        GREATEST(start_time, v_week_start),
        LEAST(effective_end_time, v_week_end),
        v_tz
    )), 0)
    INTO v_weekly_used
    FROM public.reservations
    WHERE user_id = v_caller
      AND status IN ('reserved', 'checked_in', 'completed', 'released_no_show')
      AND start_time < v_week_end
      AND effective_end_time > v_week_start;

    IF (v_weekly_used + v_counted_sec) > 43200 THEN
        RAISE EXCEPTION 'WEEKLY_LIMIT: Exceeds 12 hours per week limit';
    END IF;

    v_deadline := v_actual_start + INTERVAL '15 minutes';

    -- Insert reservation
    INSERT INTO public.reservations (
        building_id, charger_id, user_id, start_time, scheduled_end_time, effective_end_time, checkin_deadline, status
    ) VALUES (
        v_building_id, p_charger_id, v_caller, v_actual_start, p_end, p_end, v_deadline, 'reserved'
    ) RETURNING id INTO v_reservation_id;

    -- Allocate resource
    INSERT INTO public.resource_allocations (
        charger_id, reservation_id, reserved_range
    ) VALUES (
        p_charger_id, v_reservation_id, tstzrange(v_actual_start, p_end, '[)')
    );

    RETURN jsonb_build_object(
        'success', true,
        'id', v_reservation_id,
        'reservation_id', v_reservation_id,
        'building_id', v_building_id,
        'charger_id', p_charger_id,
        'user_id', v_caller,
        'start_time', v_actual_start,
        'scheduled_end_time', p_end,
        'effective_end_time', p_end,
        'checkin_deadline', v_deadline,
        'status', 'reserved',
        'version', 1
    );
END;
$$;

-- 4. RPC: book_now (instant booking with immediate check-in)
CREATE OR REPLACE FUNCTION public.book_now(
    p_charger_id UUID,
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
    v_is_member BOOLEAN;
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

    -- Auto-membership if missing
    SELECT EXISTS (
        SELECT 1 FROM public.memberships
        WHERE building_id = v_building_id AND user_id = v_caller AND active = true
    ) INTO v_is_member;

    IF NOT v_is_member THEN
        INSERT INTO public.memberships (building_id, user_id, role, active)
        VALUES (v_building_id, v_caller, 'member', true)
        ON CONFLICT (building_id, user_id)
        DO UPDATE SET active = true;
    END IF;

    -- Lock building mutex
    PERFORM 1 FROM public.buildings WHERE id = v_building_id FOR UPDATE;

    v_now := clock_timestamp();

    IF p_end <= v_now OR EXTRACT(EPOCH FROM (p_end - v_now)) < 1800 THEN
        RAISE EXCEPTION 'INVALID_INTERVAL: Minimum duration is 30 minutes';
    END IF;

    -- Reconcile overdue
    PERFORM public.reconcile_building_reservations(v_building_id);

    -- Check user doesn't have overlapping reservation
    IF EXISTS (
        SELECT 1 FROM public.reservations
        WHERE user_id = v_caller
          AND status IN ('reserved', 'checked_in')
          AND tstzrange(start_time, effective_end_time, '[)') && tstzrange(v_now, p_end, '[)')
    ) THEN
        RAISE EXCEPTION 'OWN_BOOKING_OVERLAP';
    END IF;

    -- Calculate counted seconds
    v_counted_sec := public.calculate_weekday_quota_seconds(v_now, p_end, v_tz);

    -- Check daily quota (14,400s)
    v_local_date := (v_now AT TIME ZONE v_tz)::DATE;
    v_day_start := (v_local_date || ' 00:00:00')::TIMESTAMP AT TIME ZONE v_tz;
    v_day_end := (v_local_date || ' 23:59:59.999')::TIMESTAMP AT TIME ZONE v_tz;

    SELECT COALESCE(SUM(public.calculate_weekday_quota_seconds(
        GREATEST(start_time, v_day_start),
        LEAST(effective_end_time, v_day_end),
        v_tz
    )), 0)
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
    v_week_start := date_trunc('week', v_now AT TIME ZONE v_tz) AT TIME ZONE v_tz;
    v_week_end := v_week_start + INTERVAL '7 days';

    SELECT COALESCE(SUM(public.calculate_weekday_quota_seconds(
        GREATEST(start_time, v_week_start),
        LEAST(effective_end_time, v_week_end),
        v_tz
    )), 0)
    INTO v_weekly_used
    FROM public.reservations
    WHERE user_id = v_caller
      AND status IN ('reserved', 'checked_in', 'completed', 'released_no_show')
      AND start_time < v_week_end
      AND effective_end_time > v_week_start;

    IF (v_weekly_used + v_counted_sec) > 43200 THEN
        RAISE EXCEPTION 'WEEKLY_LIMIT: Exceeds 12 hours per week limit';
    END IF;

    v_deadline := v_now + INTERVAL '15 minutes';

    -- Insert reservation directly as checked_in
    INSERT INTO public.reservations (
        building_id, charger_id, user_id, start_time, scheduled_end_time, effective_end_time, checkin_deadline, checked_in_at, status
    ) VALUES (
        v_building_id, p_charger_id, v_caller, v_now, p_end, p_end, v_deadline, v_now, 'checked_in'
    ) RETURNING id INTO v_reservation_id;

    -- Allocate resource
    INSERT INTO public.resource_allocations (
        charger_id, reservation_id, reserved_range
    ) VALUES (
        p_charger_id, v_reservation_id, tstzrange(v_now, p_end, '[)')
    );

    RETURN jsonb_build_object(
        'success', true,
        'id', v_reservation_id,
        'reservation_id', v_reservation_id,
        'building_id', v_building_id,
        'charger_id', p_charger_id,
        'user_id', v_caller,
        'start_time', v_now,
        'scheduled_end_time', p_end,
        'effective_end_time', p_end,
        'checked_in_at', v_now,
        'status', 'checked_in',
        'version', 1
    );
END;
$$;

-- 5. RPC: cancel_reservation (release allocation and update status)
CREATE OR REPLACE FUNCTION public.cancel_reservation(
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
    v_is_admin BOOLEAN;
BEGIN
    SELECT * INTO r
    FROM public.reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF r.id IS NULL THEN
        RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
    END IF;

    -- Check caller is owner or building admin
    SELECT EXISTS (
        SELECT 1 FROM public.memberships
        WHERE building_id = r.building_id AND user_id = v_caller AND role = 'admin' AND active = true
    ) INTO v_is_admin;

    IF r.user_id != v_caller AND NOT v_is_admin THEN
        RAISE EXCEPTION 'FORBIDDEN: Only booking owner or admin can cancel';
    END IF;

    IF r.status NOT IN ('reserved', 'checked_in') THEN
        RAISE EXCEPTION 'INVALID_STATE: Reservation is already %', r.status;
    END IF;

    IF v_now < r.start_time THEN
        -- Future reservation cancelled before start: 0 quota consumed
        UPDATE public.reservations
        SET status = 'cancelled',
            effective_end_time = r.start_time,
            released_at = v_now,
            version = version + 1
        WHERE id = r.id;

        DELETE FROM public.resource_allocations
        WHERE reservation_id = r.id;
    ELSE
        -- Started reservation cancelled/ended: retain consumed time until now
        UPDATE public.reservations
        SET status = CASE WHEN r.status = 'checked_in' THEN 'completed' ELSE 'cancelled' END,
            effective_end_time = v_now,
            released_at = v_now,
            version = version + 1
        WHERE id = r.id;

        UPDATE public.resource_allocations
        SET reserved_range = tstzrange(r.start_time, v_now, '[)')
        WHERE reservation_id = r.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'id', r.id,
        'status', CASE WHEN v_now < r.start_time THEN 'cancelled' WHEN r.status = 'checked_in' THEN 'completed' ELSE 'cancelled' END,
        'effective_end_time', CASE WHEN v_now < r.start_time THEN r.start_time ELSE v_now END
    );
END;
$$;

-- 6. RPC: get_my_allowances (return daily and weekly quota breakdown)
CREATE OR REPLACE FUNCTION public.get_my_allowances(
    p_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_tz TEXT := 'Europe/Kyiv';
    v_target TIMESTAMPTZ;
    v_local_date DATE;
    v_day_start TIMESTAMPTZ;
    v_day_end TIMESTAMPTZ;
    v_week_start TIMESTAMPTZ;
    v_week_end TIMESTAMPTZ;
    v_daily_used INT := 0;
    v_weekly_used INT := 0;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    SELECT timezone INTO v_tz FROM public.buildings LIMIT 1;
    IF v_tz IS NULL THEN
        v_tz := 'Europe/Kyiv';
    END IF;

    v_target := COALESCE(p_date, clock_timestamp());
    v_local_date := (v_target AT TIME ZONE v_tz)::DATE;
    v_day_start := (v_local_date || ' 00:00:00')::TIMESTAMP AT TIME ZONE v_tz;
    v_day_end := (v_local_date || ' 23:59:59.999')::TIMESTAMP AT TIME ZONE v_tz;

    v_week_start := date_trunc('week', v_target AT TIME ZONE v_tz) AT TIME ZONE v_tz;
    v_week_end := v_week_start + INTERVAL '7 days';

    -- Daily used
    SELECT COALESCE(SUM(public.calculate_weekday_quota_seconds(
        GREATEST(start_time, v_day_start),
        LEAST(effective_end_time, v_day_end),
        v_tz
    )), 0)
    INTO v_daily_used
    FROM public.reservations
    WHERE user_id = v_caller
      AND status IN ('reserved', 'checked_in', 'completed', 'released_no_show')
      AND start_time < v_day_end
      AND effective_end_time > v_day_start;

    -- Weekly used
    SELECT COALESCE(SUM(public.calculate_weekday_quota_seconds(
        GREATEST(start_time, v_week_start),
        LEAST(effective_end_time, v_week_end),
        v_tz
    )), 0)
    INTO v_weekly_used
    FROM public.reservations
    WHERE user_id = v_caller
      AND status IN ('reserved', 'checked_in', 'completed', 'released_no_show')
      AND start_time < v_week_end
      AND effective_end_time > v_week_start;

    RETURN jsonb_build_object(
        'daily', jsonb_build_object(
            'used_seconds', v_daily_used,
            'limit_seconds', 14400,
            'remaining_seconds', GREATEST(0, 14400 - v_daily_used)
        ),
        'weekly', jsonb_build_object(
            'used_seconds', v_weekly_used,
            'limit_seconds', 43200,
            'remaining_seconds', GREATEST(0, 43200 - v_weekly_used)
        )
    );
END;
$$;

-- 7. RPC: get_calendar (safe calendar fetch for all users, anonymized for non-owners)
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
    v_result JSONB;
BEGIN
    -- If caller is authenticated, ensure membership exists
    IF v_caller IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.memberships
            WHERE building_id = p_building_id AND user_id = v_caller AND active = true
        ) THEN
            INSERT INTO public.memberships (building_id, user_id, role, active)
            VALUES (p_building_id, v_caller, 'member', true)
            ON CONFLICT (building_id, user_id)
            DO UPDATE SET active = true;
        END IF;
    END IF;

    -- Reconcile state
    PERFORM public.reconcile_building_reservations(p_building_id);

    SELECT jsonb_build_object(
        'server_time', clock_timestamp(),
        'reservations', COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', CASE WHEN v_caller IS NOT NULL AND r.user_id = v_caller THEN r.id ELSE NULL END,
                'charger_id', r.charger_id,
                'start_time', r.start_time,
                'scheduled_end_time', r.scheduled_end_time,
                'effective_end_time', r.effective_end_time,
                'status', r.status,
                'is_own', (v_caller IS NOT NULL AND r.user_id = v_caller),
                'checkin_deadline', CASE WHEN v_caller IS NOT NULL AND r.user_id = v_caller THEN r.checkin_deadline ELSE NULL END
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

-- 8. Grant execution privileges to authenticated & anon roles where appropriate
GRANT EXECUTE ON FUNCTION public.get_calendar TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.claim_membership TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_reservation TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_now TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reservation TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_in TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_early TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_allowances TO authenticated;

