-- Migration: 20260927000002_grant_table_permissions.sql
-- Description: Grant table-level SELECT and EXECUTE permissions to anon and authenticated roles

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Public read tables (subject to RLS policies)
GRANT SELECT ON public.chargers TO anon, authenticated;
GRANT SELECT ON public.buildings TO anon, authenticated;
GRANT SELECT ON public.booking_policies TO anon, authenticated;

-- Authenticated member tables (subject to RLS policies)
GRANT SELECT ON public.memberships TO authenticated;
GRANT SELECT ON public.reservations TO authenticated;
GRANT SELECT ON public.resource_allocations TO authenticated;
GRANT SELECT ON public.maintenance_blocks TO authenticated;

-- Default future privileges for safety
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
