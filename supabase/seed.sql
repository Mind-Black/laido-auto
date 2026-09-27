-- Seed data for local development

INSERT INTO public.buildings (id, name, timezone)
VALUES ('00000000-0000-0000-0000-000000000001', 'Laido Building 1', 'Europe/Kyiv')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.booking_policies (building_id, version, weekday_start_time, weekday_end_time, daily_limit_seconds, weekly_limit_seconds, checkin_grace_seconds, min_duration_seconds)
VALUES ('00000000-0000-0000-0000-000000000001', 1, '08:00:00', '17:00:00', 14400, 43200, 900, 1800)
ON CONFLICT (building_id, version) DO NOTHING;

INSERT INTO public.chargers (id, building_id, display_name, enabled)
VALUES 
    ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'Charger 1', true),
    ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000001', 'Charger 2', true)
ON CONFLICT (id) DO NOTHING;
