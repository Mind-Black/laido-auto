-- Allow active building admins to change only the operational status of a charger.
-- The policy uses the non-recursive private helper from the prior migration.
REVOKE UPDATE ON public.chargers FROM authenticated;
GRANT UPDATE (enabled) ON public.chargers TO authenticated;

DROP POLICY IF EXISTS "Admins update charger status" ON public.chargers;
CREATE POLICY "Admins update charger status" ON public.chargers
    FOR UPDATE TO authenticated
    USING (app_private.is_building_admin(building_id))
    WITH CHECK (app_private.is_building_admin(building_id));
