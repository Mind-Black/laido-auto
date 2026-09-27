-- The original membership SELECT policy queried memberships from inside its
-- own predicate. PostgreSQL applies that policy to the inner query as well,
-- causing 42P17 for every signed-in read.

-- This helper runs as the migration owner, so its membership lookup does not
-- recursively apply the caller's row policy. It only answers whether the
-- current authenticated user is an active admin of the requested building.
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE OR REPLACE FUNCTION app_private.is_building_admin(p_building_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.memberships AS m
        WHERE m.building_id = p_building_id
          AND m.user_id = auth.uid()
          AND m.role = 'admin'
          AND m.active = true
    );
$$;

REVOKE ALL ON FUNCTION app_private.is_building_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.is_building_admin(UUID) TO authenticated;

DROP POLICY IF EXISTS "Members view own membership" ON public.memberships;
CREATE POLICY "Members view own membership" ON public.memberships
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR app_private.is_building_admin(building_id));
