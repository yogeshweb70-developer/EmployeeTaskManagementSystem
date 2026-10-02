-- ==============================================================================
-- Invite-Only Access Control
-- ==============================================================================
-- Run this AFTER supabase/schema.sql, on both fresh and existing projects.
-- It is idempotent: every object is created with IF NOT EXISTS / OR REPLACE, and
-- every policy it owns is dropped before being recreated.
--
-- What it changes:
--   * Nobody can self-register any more. A Google sign-in only succeeds when a
--     pending invitation exists for that exact email (or the database is empty,
--     so the very first sign-in bootstraps the admin).
--   * public.profiles gains an access status: pending / active / deactivated.
--   * Deactivated users are blocked at the auth layer (the sign-in transaction
--     is rolled back) *and* at the RLS layer (every policy requires an active
--     profile), so a previously authenticated Google session cannot be reused.
--   * public.invitations keeps one durable row per invited person, and
--     public.access_events keeps the full invitation / access history.
--
-- Note on search_path: Supabase installs pgcrypto into the `extensions` schema,
-- so every function below that calls digest() or gen_random_bytes() sets
-- `search_path = public, extensions`. With `public` alone those calls fail with
-- "function gen_random_bytes(integer) does not exist".
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. Enums
-- ------------------------------------------------------------------------------

DO $enum$ BEGIN
    CREATE TYPE user_status AS ENUM ('pending', 'active', 'deactivated');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

DO $enum$ BEGIN
    CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- ------------------------------------------------------------------------------
-- 2. Access columns on profiles
-- ------------------------------------------------------------------------------

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS status user_status NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- Everyone who already had a profile before invite-only was switched on stays active
UPDATE public.profiles SET activated_at = created_at WHERE activated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

-- ------------------------------------------------------------------------------
-- 3. Invitations
-- ------------------------------------------------------------------------------
-- One row per invited email, reused across resends, so accepting an invitation
-- never creates a second user record.

CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role user_role NOT NULL DEFAULT 'employee',
    status invitation_status NOT NULL DEFAULT 'pending',
    -- Only the SHA-256 of the invite token is stored; the raw token lives in the
    -- emailed link and is returned to the admin once, at invite/resend time.
    token_hash TEXT NOT NULL,
    invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    accepted_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    send_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL,
    link_opened_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT chk_invitation_email_lower CHECK (email = lower(email))
);

CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON public.invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_token_hash ON public.invitations(token_hash);

-- ------------------------------------------------------------------------------
-- 4. Access / invitation history
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.access_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    event TEXT NOT NULL,
    invitation_id UUID REFERENCES public.invitations(id) ON DELETE SET NULL,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_access_event_kind CHECK (
        event IN ('invited', 'resent', 'revoked', 'link_opened', 'accepted',
                  'deactivated', 'reactivated', 'blocked', 'expired')
    )
);

CREATE INDEX IF NOT EXISTS idx_access_events_email ON public.access_events(email);
CREATE INDEX IF NOT EXISTS idx_access_events_created ON public.access_events(created_at DESC);

-- ------------------------------------------------------------------------------
-- 5. Helper functions
-- ------------------------------------------------------------------------------

-- An "active" caller: has a profile and has not been deactivated.
CREATE OR REPLACE FUNCTION public.is_active()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND status = 'active'
    );
$fn$;

-- Admin checks now also require an active profile, so a deactivated admin
-- cannot keep using admin-only policies or RPCs.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
    );
$fn$;

CREATE OR REPLACE FUNCTION public.is_team_leader()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'team_leader' AND status = 'active'
    );
$fn$;

CREATE OR REPLACE FUNCTION public.approved_email_domain()
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $fn$ SELECT '@zeroado.com'::text; $fn$;

-- Uses digest() from pgcrypto, hence the `extensions` schema on the search_path.
CREATE OR REPLACE FUNCTION public.hash_invite_token(p_token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $fn$ SELECT encode(digest(p_token, 'sha256'), 'hex'); $fn$;

-- Mark pending invitations past their expiry, so the admin table never shows a
-- stale "Pending Invite" for a link that no longer works.
CREATE OR REPLACE FUNCTION public.expire_stale_invitations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    UPDATE public.invitations
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at <= timezone('utc'::text, now());
END;
$fn$;

-- ------------------------------------------------------------------------------
-- 6. Sign-in gate: only invited people get a profile
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    approved_domain TEXT := public.approved_email_domain();
    user_email TEXT;
    raw_meta JSONB;
    user_name TEXT;
    user_avatar TEXT;
    assigned_role user_role;
    existing public.profiles%ROWTYPE;
    invite public.invitations%ROWTYPE;
    is_bootstrap BOOLEAN;
BEGIN
    user_email := lower(new.email);

    -- Strict domain restriction at database trigger level
    IF user_email NOT LIKE ('%' || approved_domain) THEN
        RAISE EXCEPTION 'Access Denied: Only % accounts are permitted to authenticate.', approved_domain;
    END IF;

    raw_meta := new.raw_user_meta_data;

    user_name := COALESCE(
        NULLIF(raw_meta->>'name', ''),
        NULLIF(raw_meta->>'full_name', ''),
        split_part(user_email, '@', 1)
    );
    user_avatar := COALESCE(
        NULLIF(raw_meta->>'avatar_url', ''),
        NULLIF(raw_meta->>'picture', ''),
        ''
    );

    SELECT * INTO existing FROM public.profiles WHERE id = new.id;

    -- ---------------------------------------------------------------------
    -- Returning user: refresh their Google details, but refuse if deactivated
    -- ---------------------------------------------------------------------
    IF existing.id IS NOT NULL THEN
        IF existing.status = 'deactivated' THEN
            RAISE EXCEPTION 'Access Revoked: % has been deactivated by an administrator.', user_email;
        END IF;

        UPDATE public.profiles
        SET name = user_name,
            email = user_email,
            -- Keep a photo the user uploaded; otherwise refresh it from Google
            avatar_url = CASE
                WHEN public.profiles.avatar_url LIKE '%/storage/v1/object/public/avatars/%'
                    THEN public.profiles.avatar_url
                ELSE user_avatar
            END,
            updated_at = timezone('utc'::text, now())
        WHERE id = new.id;

        RETURN new;
    END IF;

    -- ---------------------------------------------------------------------
    -- First time this Google account signs in: an invitation is required
    -- ---------------------------------------------------------------------
    SELECT count(*) = 0 INTO is_bootstrap FROM public.profiles;

    SELECT * INTO invite
    FROM public.invitations
    WHERE email = user_email
      AND status = 'pending'
      AND expires_at > timezone('utc'::text, now())
    LIMIT 1;

    IF invite.id IS NULL AND NOT is_bootstrap THEN
        RAISE EXCEPTION 'Invitation Required: % has not been invited to this workspace. Ask an administrator to send you an invitation.', user_email;
    END IF;

    -- The very first account in an empty workspace becomes the admin
    assigned_role := CASE
        WHEN is_bootstrap THEN 'admin'::user_role
        ELSE COALESCE(invite.role, 'employee'::user_role)
    END;

    INSERT INTO public.profiles (
        id, auth_user_id, name, email, avatar_url, role,
        status, invited_at, activated_at, invited_by
    )
    VALUES (
        new.id,
        new.id,
        user_name,
        user_email,
        user_avatar,
        assigned_role,
        'active',
        invite.created_at,
        timezone('utc'::text, now()),
        invite.invited_by
    );

    -- Accepting an invitation updates the existing invitation row; it never
    -- creates a second record for the same person.
    IF invite.id IS NOT NULL THEN
        UPDATE public.invitations
        SET status = 'accepted',
            accepted_at = timezone('utc'::text, now()),
            accepted_profile_id = new.id
        WHERE id = invite.id;

        INSERT INTO public.access_events (email, event, invitation_id, profile_id, note)
        VALUES (user_email, 'accepted', invite.id, new.id, 'Invitation accepted via Google sign-in');
    ELSE
        INSERT INTO public.access_events (email, event, profile_id, note)
        VALUES (user_email, 'accepted', new.id, 'First account in the workspace; granted admin');
    END IF;

    RETURN new;
END;
$fn$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 7. Admin RPCs
-- ------------------------------------------------------------------------------

-- Invite a new person. Returns the raw token exactly once so the caller (the
-- invite-user edge function) can build the emailed link.
CREATE OR REPLACE FUNCTION public.admin_invite_user(
    p_name TEXT,
    p_email TEXT,
    p_role user_role DEFAULT 'employee',
    p_expires_in_days INTEGER DEFAULT 7
)
RETURNS TABLE (
    invitation_id UUID,
    invite_name TEXT,
    invite_email TEXT,
    invite_role user_role,
    token TEXT,
    expires_at TIMESTAMPTZ,
    send_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
    v_email TEXT := lower(trim(p_email));
    v_name TEXT := trim(p_name);
    v_token TEXT := encode(gen_random_bytes(32), 'hex');
    v_expires TIMESTAMPTZ := timezone('utc'::text, now()) + make_interval(days => GREATEST(1, p_expires_in_days));
    v_existing_profile public.profiles%ROWTYPE;
    v_invitation public.invitations%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can invite users.';
    END IF;

    IF v_name = '' THEN
        RAISE EXCEPTION 'A name is required to send an invitation.';
    END IF;

    IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
        RAISE EXCEPTION 'Please enter a valid email address.';
    END IF;

    IF v_email NOT LIKE ('%' || public.approved_email_domain()) THEN
        RAISE EXCEPTION 'Only % addresses can be invited.', public.approved_email_domain();
    END IF;

    SELECT * INTO v_existing_profile FROM public.profiles WHERE email = v_email;
    IF v_existing_profile.id IS NOT NULL THEN
        IF v_existing_profile.status = 'deactivated' THEN
            RAISE EXCEPTION '% already has an account that was deactivated. Reactivate it instead of inviting again.', v_email;
        END IF;
        RAISE EXCEPTION '% already has an active account.', v_email;
    END IF;

    -- Reuse the row for this email so the person keeps one invitation history
    INSERT INTO public.invitations (name, email, role, status, token_hash, invited_by, expires_at)
    VALUES (v_name, v_email, p_role, 'pending', public.hash_invite_token(v_token), auth.uid(), v_expires)
    ON CONFLICT (email) DO UPDATE
    SET name = EXCLUDED.name,
        role = EXCLUDED.role,
        status = 'pending',
        token_hash = EXCLUDED.token_hash,
        invited_by = EXCLUDED.invited_by,
        expires_at = EXCLUDED.expires_at,
        last_sent_at = timezone('utc'::text, now()),
        send_count = public.invitations.send_count + 1,
        link_opened_at = NULL,
        accepted_at = NULL,
        accepted_profile_id = NULL,
        revoked_at = NULL
    RETURNING * INTO v_invitation;

    INSERT INTO public.access_events (email, event, invitation_id, actor_id, note)
    VALUES (v_email, CASE WHEN v_invitation.send_count > 1 THEN 'resent' ELSE 'invited' END,
            v_invitation.id, auth.uid(), format('Invitation sent to %s', v_name));

    RETURN QUERY SELECT v_invitation.id, v_invitation.name, v_invitation.email,
                        v_invitation.role, v_token, v_invitation.expires_at, v_invitation.send_count;
END;
$fn$;

-- Re-issue the link for an existing pending / expired / revoked invitation.
CREATE OR REPLACE FUNCTION public.admin_resend_invitation(
    p_invitation_id UUID,
    p_expires_in_days INTEGER DEFAULT 7
)
RETURNS TABLE (
    invitation_id UUID,
    invite_name TEXT,
    invite_email TEXT,
    invite_role user_role,
    token TEXT,
    expires_at TIMESTAMPTZ,
    send_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
    v_token TEXT := encode(gen_random_bytes(32), 'hex');
    v_invitation public.invitations%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can resend invitations.';
    END IF;

    SELECT * INTO v_invitation FROM public.invitations WHERE id = p_invitation_id;
    IF v_invitation.id IS NULL THEN
        RAISE EXCEPTION 'Invitation not found.';
    END IF;
    IF v_invitation.status = 'accepted' THEN
        RAISE EXCEPTION '% has already accepted their invitation.', v_invitation.email;
    END IF;

    UPDATE public.invitations
    SET status = 'pending',
        token_hash = public.hash_invite_token(v_token),
        expires_at = timezone('utc'::text, now()) + make_interval(days => GREATEST(1, p_expires_in_days)),
        last_sent_at = timezone('utc'::text, now()),
        -- Table-qualified: bare `send_count` would collide with the output
        -- parameter of the same name
        send_count = invitations.send_count + 1,
        link_opened_at = NULL,
        revoked_at = NULL
    WHERE id = p_invitation_id
    RETURNING * INTO v_invitation;

    INSERT INTO public.access_events (email, event, invitation_id, actor_id, note)
    VALUES (v_invitation.email, 'resent', v_invitation.id, auth.uid(), 'Invitation link re-issued');

    RETURN QUERY SELECT v_invitation.id, v_invitation.name, v_invitation.email,
                        v_invitation.role, v_token, v_invitation.expires_at, v_invitation.send_count;
END;
$fn$;

-- Cancel a pending invitation. The row, and its history, is kept.
CREATE OR REPLACE FUNCTION public.admin_revoke_invitation(p_invitation_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
    v_invitation public.invitations%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can revoke invitations.';
    END IF;

    SELECT * INTO v_invitation FROM public.invitations WHERE id = p_invitation_id;
    IF v_invitation.id IS NULL THEN
        RAISE EXCEPTION 'Invitation not found.';
    END IF;
    IF v_invitation.status = 'accepted' THEN
        RAISE EXCEPTION 'This invitation was already accepted. Deactivate the user instead.';
    END IF;

    UPDATE public.invitations
    SET status = 'revoked',
        revoked_at = timezone('utc'::text, now()),
        -- Burn the token so the emailed link stops resolving to this invitation
        token_hash = public.hash_invite_token(encode(gen_random_bytes(32), 'hex'))
    WHERE id = p_invitation_id;

    INSERT INTO public.access_events (email, event, invitation_id, actor_id, note)
    VALUES (v_invitation.email, 'revoked', v_invitation.id, auth.uid(), 'Invitation cancelled by an admin');
END;
$fn$;

-- Deactivate or reactivate an existing user.
CREATE OR REPLACE FUNCTION public.admin_set_user_status(p_user_id UUID, p_status user_status)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_profile public.profiles%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can change a user access status.';
    END IF;

    IF p_status NOT IN ('active', 'deactivated') THEN
        RAISE EXCEPTION 'Access status must be either active or deactivated.';
    END IF;

    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot change your own access status.';
    END IF;

    SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
    IF v_profile.id IS NULL THEN
        RAISE EXCEPTION 'User not found.';
    END IF;

    IF p_status = 'deactivated'
       AND v_profile.role = 'admin'
       AND (SELECT count(*) FROM public.profiles WHERE role = 'admin' AND status = 'active') <= 1 THEN
        RAISE EXCEPTION 'Cannot deactivate the last active admin.';
    END IF;

    IF v_profile.status = p_status THEN
        RETURN v_profile;
    END IF;

    UPDATE public.profiles
    SET status = p_status,
        deactivated_at = CASE WHEN p_status = 'deactivated' THEN timezone('utc'::text, now()) ELSE NULL END,
        activated_at = CASE WHEN p_status = 'active' THEN COALESCE(activated_at, timezone('utc'::text, now())) ELSE activated_at END,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_user_id
    RETURNING * INTO v_profile;

    INSERT INTO public.access_events (email, event, profile_id, actor_id, note)
    VALUES (
        v_profile.email,
        CASE WHEN p_status = 'deactivated' THEN 'deactivated' ELSE 'reactivated' END,
        v_profile.id,
        auth.uid(),
        CASE WHEN p_status = 'deactivated'
             THEN 'Access disabled by an admin'
             ELSE 'Access restored by an admin' END
    );

    RETURN v_profile;
END;
$fn$;

-- Public (anon) lookup used by the invitation landing page. Returns only what
-- the page needs to greet the invitee; never the token hash or the inviter.
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token TEXT)
RETURNS TABLE (
    invite_name TEXT,
    invite_email TEXT,
    invite_status invitation_status,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
    v_invitation public.invitations%ROWTYPE;
BEGIN
    IF p_token IS NULL OR length(p_token) < 32 THEN
        RETURN;
    END IF;

    SELECT * INTO v_invitation
    FROM public.invitations
    WHERE token_hash = public.hash_invite_token(p_token);

    IF v_invitation.id IS NULL THEN
        RETURN;
    END IF;

    IF v_invitation.status = 'pending' AND v_invitation.expires_at <= timezone('utc'::text, now()) THEN
        UPDATE public.invitations SET status = 'expired' WHERE id = v_invitation.id;
        v_invitation.status := 'expired';
    END IF;

    IF v_invitation.status = 'pending' AND v_invitation.link_opened_at IS NULL THEN
        UPDATE public.invitations
        SET link_opened_at = timezone('utc'::text, now())
        WHERE id = v_invitation.id;

        INSERT INTO public.access_events (email, event, invitation_id, note)
        VALUES (v_invitation.email, 'link_opened', v_invitation.id, 'Invitation link opened');
    END IF;

    RETURN QUERY SELECT v_invitation.name, v_invitation.email, v_invitation.status, v_invitation.expires_at;
END;
$fn$;

-- Admin-facing read that first sweeps expired invitations.
CREATE OR REPLACE FUNCTION public.admin_list_invitations()
RETURNS SETOF public.invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can view invitations.';
    END IF;

    PERFORM public.expire_stale_invitations();

    RETURN QUERY SELECT * FROM public.invitations ORDER BY created_at DESC;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_invite_user(TEXT, TEXT, user_role, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resend_invitation(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_invitation(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_status(UUID, user_status) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_invitations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expire_stale_invitations() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_invite_user(TEXT, TEXT, user_role, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resend_invitation(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(UUID, user_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_invitations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(TEXT) TO anon, authenticated;

-- Deleting a user must also clear their invitation so they can be re-invited.
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_email TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can delete users.';
    END IF;

    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot delete your own account.';
    END IF;

    SELECT email INTO v_email FROM public.profiles WHERE id = target_user_id;
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'User not found.';
    END IF;

    IF (SELECT role FROM public.profiles WHERE id = target_user_id) = 'admin'
       AND (SELECT count(*) FROM public.profiles WHERE role = 'admin' AND status = 'active') <= 1 THEN
        RAISE EXCEPTION 'Cannot delete the last admin.';
    END IF;

    DELETE FROM public.invitations WHERE email = v_email;
    DELETE FROM auth.users WHERE id = target_user_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 8. Row Level Security
-- ------------------------------------------------------------------------------
-- Every policy below requires public.is_active(), so a deactivated user holding
-- a still-valid Google session sees and can change nothing.

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage invitations" ON public.invitations;
CREATE POLICY "Admins manage invitations"
    ON public.invitations
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins read access events" ON public.access_events;
CREATE POLICY "Admins read access events"
    ON public.access_events
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- ---- profiles ----------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
    ON public.profiles
    FOR SELECT
    TO authenticated
    -- Users always see their own row (the app needs it to tell a deactivated
    -- person why they were signed out); everything else needs an active profile.
    USING (id = auth.uid() OR public.is_active());

DROP POLICY IF EXISTS "Admins have full access to profiles" ON public.profiles;
CREATE POLICY "Admins have full access to profiles"
    ON public.profiles
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users can update their own profile basic info" ON public.profiles;
CREATE POLICY "Users can update their own profile basic info"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id AND public.is_active())
    WITH CHECK (
        auth.uid() = id
        AND public.is_active()
        -- Neither role nor access status can be self-assigned
        AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
        AND status = (SELECT status FROM public.profiles WHERE id = auth.uid())
    );

-- ---- team_assignments --------------------------------------------------------

DROP POLICY IF EXISTS "Team assignments select policy" ON public.team_assignments;
CREATE POLICY "Team assignments select policy"
    ON public.team_assignments
    FOR SELECT
    TO authenticated
    USING (
        public.is_active()
        AND (
            public.is_admin()
            OR team_leader_id = auth.uid()
            OR employee_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admins can manage all team assignments" ON public.team_assignments;
CREATE POLICY "Admins can manage all team assignments"
    ON public.team_assignments
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Team leaders can manage their own team assignments" ON public.team_assignments;
CREATE POLICY "Team leaders can manage their own team assignments"
    ON public.team_assignments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_team_leader()
        AND team_leader_id = auth.uid()
        -- Deactivated people cannot be added to a roster
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = employee_id AND status = 'active')
    );

DROP POLICY IF EXISTS "Team leaders can delete from their own team assignments" ON public.team_assignments;
CREATE POLICY "Team leaders can delete from their own team assignments"
    ON public.team_assignments
    FOR DELETE
    TO authenticated
    USING (
        public.is_team_leader()
        AND team_leader_id = auth.uid()
    );

-- ---- task_logs ---------------------------------------------------------------

DROP POLICY IF EXISTS "Task logs select policy" ON public.task_logs;
CREATE POLICY "Task logs select policy"
    ON public.task_logs
    FOR SELECT
    TO authenticated
    USING (
        public.is_active()
        AND (
            public.is_admin()
            OR user_id = auth.uid()
            OR (
                public.is_team_leader()
                AND public.is_assigned_to_team_leader(user_id)
            )
        )
    );

DROP POLICY IF EXISTS "Users can insert their own task logs" ON public.task_logs;
CREATE POLICY "Users can insert their own task logs"
    ON public.task_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_active()
        AND (user_id = auth.uid() OR public.is_admin())
        AND work_date <= CURRENT_DATE
        AND duration_minutes > 0
    );

DROP POLICY IF EXISTS "Users can update their own task logs" ON public.task_logs;
CREATE POLICY "Users can update their own task logs"
    ON public.task_logs
    FOR UPDATE
    TO authenticated
    USING (
        public.is_active()
        AND (user_id = auth.uid() OR public.is_admin())
    )
    WITH CHECK (
        public.is_active()
        AND (user_id = auth.uid() OR public.is_admin())
        AND work_date <= CURRENT_DATE
        AND duration_minutes > 0
    );

DROP POLICY IF EXISTS "Users can delete their own task logs" ON public.task_logs;
CREATE POLICY "Users can delete their own task logs"
    ON public.task_logs
    FOR DELETE
    TO authenticated
    USING (
        public.is_active()
        AND (user_id = auth.uid() OR public.is_admin())
    );
