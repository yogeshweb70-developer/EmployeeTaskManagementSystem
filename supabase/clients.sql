-- ==============================================================================
-- Clients (admin-managed) + client on task logs
-- ==============================================================================
-- Run this AFTER supabase/schema.sql and supabase/invite_access.sql.
-- It is idempotent and safe to re-run: the seed list is inserted only when a
-- client of that name does not already exist, so renames are never undone.
--
-- Access model:
--   * Every active user can READ the client list (they need it for the dropdown).
--   * Only admins can create, rename, archive or delete clients.
--   * Archiving (is_active = false) hides a client from the task dropdown but
--     keeps it on the task logs that already reference it. Hard delete is
--     refused while any task log still points at the client.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Clients table
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_client_name_not_blank CHECK (btrim(name) <> '')
);

-- Case-insensitive uniqueness: "Zaptick" and "zaptick" are the same client
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_name_lower ON public.clients (lower(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_clients_is_active ON public.clients(is_active);

DROP TRIGGER IF EXISTS set_clients_updated_at ON public.clients;
CREATE TRIGGER set_clients_updated_at
    BEFORE UPDATE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 2. Link task logs to a client
-- ------------------------------------------------------------------------------
-- Nullable: task logs created before this feature have no client, and not every
-- task is client work. ON DELETE SET NULL is only a backstop -- the delete RPC
-- below refuses to remove a client that is still in use.

ALTER TABLE public.task_logs
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_logs_client_id ON public.task_logs(client_id);

-- ------------------------------------------------------------------------------
-- 3. Seed the initial client list
-- ------------------------------------------------------------------------------
-- ON CONFLICT on the case-insensitive unique index, so re-running never
-- duplicates a client and never overwrites an admin's rename.

INSERT INTO public.clients (name)
VALUES
    ('Prem AI'),
    ('Masters India'),
    ('Zaptick'),
    ('P3 LogiQ'),
    ('Chaitanya''s Academy')
ON CONFLICT (lower(btrim(name))) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. Admin-only write RPCs
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_create_client(p_name TEXT)
RETURNS public.clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_name TEXT := btrim(p_name);
    v_client public.clients%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can add clients.';
    END IF;

    IF v_name = '' THEN
        RAISE EXCEPTION 'A client name is required.';
    END IF;

    SELECT * INTO v_client FROM public.clients WHERE lower(btrim(name)) = lower(v_name);
    IF v_client.id IS NOT NULL THEN
        IF v_client.is_active THEN
            RAISE EXCEPTION '% is already on the client list.', v_client.name;
        END IF;
        -- Re-adding an archived client restores it instead of failing
        UPDATE public.clients SET is_active = true, name = v_name WHERE id = v_client.id
        RETURNING * INTO v_client;
        RETURN v_client;
    END IF;

    INSERT INTO public.clients (name, created_by)
    VALUES (v_name, auth.uid())
    RETURNING * INTO v_client;

    RETURN v_client;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_update_client(
    p_client_id UUID,
    p_name TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL
)
RETURNS public.clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_name TEXT := btrim(COALESCE(p_name, ''));
    v_client public.clients%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can change clients.';
    END IF;

    SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
    IF v_client.id IS NULL THEN
        RAISE EXCEPTION 'Client not found.';
    END IF;

    IF p_name IS NOT NULL THEN
        IF v_name = '' THEN
            RAISE EXCEPTION 'A client name is required.';
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.clients
            WHERE lower(btrim(name)) = lower(v_name) AND id <> p_client_id
        ) THEN
            RAISE EXCEPTION 'Another client is already called %.', v_name;
        END IF;
    END IF;

    UPDATE public.clients
    SET name = COALESCE(NULLIF(v_name, ''), name),
        is_active = COALESCE(p_is_active, is_active)
    WHERE id = p_client_id
    RETURNING * INTO v_client;

    RETURN v_client;
END;
$fn$;

-- Permanently remove a client. Refused while task logs still reference it, so
-- reporting history can never lose the client it was recorded against.
CREATE OR REPLACE FUNCTION public.admin_delete_client(p_client_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_client public.clients%ROWTYPE;
    v_in_use INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can delete clients.';
    END IF;

    SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
    IF v_client.id IS NULL THEN
        RAISE EXCEPTION 'Client not found.';
    END IF;

    SELECT count(*) INTO v_in_use FROM public.task_logs WHERE client_id = p_client_id;
    IF v_in_use > 0 THEN
        RAISE EXCEPTION '% is used by % task log(s). Archive it instead so the history is kept.',
            v_client.name, v_in_use;
    END IF;

    DELETE FROM public.clients WHERE id = p_client_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_create_client(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_client(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_client(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_create_client(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_client(UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_client(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. Row Level Security
-- ------------------------------------------------------------------------------
-- Read for every active user (they need the dropdown); writes are admin-only and
-- additionally re-checked inside the RPCs above.

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active users can view clients" ON public.clients;
CREATE POLICY "Active users can view clients"
    ON public.clients
    FOR SELECT
    TO authenticated
    USING (public.is_active());

DROP POLICY IF EXISTS "Admins manage clients" ON public.clients;
CREATE POLICY "Admins manage clients"
    ON public.clients
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 6. Every NEW task log must name an active client
-- ------------------------------------------------------------------------------
-- Replaces only the INSERT policy from invite_access.sql; everything else about
-- it is unchanged.
--
-- Client is mandatory, but the column stays nullable: task logs recorded before
-- this feature existed have no client, and a NOT NULL column would have to
-- invent one for them. The requirement is enforced where it matters -- on new
-- rows -- by this policy, and by the task form.
--
-- The UPDATE policy is deliberately left alone. Requiring an active client there
-- would make an old log uneditable once its client is archived: renaming the
-- task would fail on the untouched client_id. The foreign key already guarantees
-- the client exists, and the task form requires one before saving.

DROP POLICY IF EXISTS "Users can insert their own task logs" ON public.task_logs;
CREATE POLICY "Users can insert their own task logs"
    ON public.task_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_active()
        AND (user_id = auth.uid() OR public.is_admin())
        AND work_date <= CURRENT_DATE
        -- Backdating window: today plus the previous 3 days. The floor is 4 days
        -- rather than 3 because CURRENT_DATE here is UTC while the app sends the
        -- user's local (IST) date; the extra day absorbs that skew instead of
        -- rejecting a legitimate entry made late in the evening. The task form
        -- enforces the exact 3-day rule.
        AND work_date >= CURRENT_DATE - INTERVAL '4 days'
        AND duration_minutes > 0
        AND client_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.is_active)
    );
