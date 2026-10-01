-- ==============================================================================
-- Employee Task Log Management System - Supabase PostgreSQL Schema & RLS Policies
-- ==============================================================================

-- 1. Create Enums and Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Role type: employee, team_leader, admin
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('employee', 'team_leader', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create `profiles` table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    avatar_url TEXT,
    role user_role NOT NULL DEFAULT 'employee',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for fast lookup by email and role
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 3. Create `team_assignments` table
-- Rule: An employee can be assigned to any number of Team Leaders (each pair once)
CREATE TABLE IF NOT EXISTS public.team_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_leader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_not_self_assigned CHECK (team_leader_id <> employee_id),
    CONSTRAINT uq_team_assignment_pair UNIQUE (team_leader_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_team_assignments_leader ON public.team_assignments(team_leader_id);
CREATE INDEX IF NOT EXISTS idx_team_assignments_employee ON public.team_assignments(employee_id);

-- 4. Create `task_logs` table
CREATE TABLE IF NOT EXISTS public.task_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    task_name TEXT NOT NULL,
    task_description TEXT,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    work_date DATE NOT NULL CHECK (work_date <= CURRENT_DATE),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_task_logs_user_id ON public.task_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_task_logs_work_date ON public.task_logs(work_date);
CREATE INDEX IF NOT EXISTS idx_task_logs_user_date ON public.task_logs(user_id, work_date DESC);

-- ==============================================================================
-- 5. Helper Functions for Security & Role Checking (Avoid RLS recursion)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_team_leader()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'team_leader'
    );
$$;

-- Function to check if a target employee is assigned to the current user (if current user is a team leader)
CREATE OR REPLACE FUNCTION public.is_assigned_to_team_leader(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.team_assignments
        WHERE team_leader_id = auth.uid()
          AND employee_id = target_employee_id
    );
$$;

-- ==============================================================================
-- 6. Trigger: Automatic Profile Sync from Google OAuth / Supabase Auth
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    approved_domain TEXT := '@zeroado.com';
    user_email TEXT;
    raw_meta JSONB;
    user_name TEXT;
    user_avatar TEXT;
    assigned_role user_role;
    existing_profile_count INTEGER;
BEGIN
    user_email := lower(new.email);

    -- Strict domain restriction at database trigger level
    IF user_email NOT LIKE ('%' || approved_domain) THEN
        RAISE EXCEPTION 'Access Denied: Only % accounts are permitted to authenticate.', approved_domain;
    END IF;

    raw_meta := new.raw_user_meta_data;

    -- Extract name & avatar from Google OAuth metadata
    user_name := COALESCE(
        raw_meta->>'name',
        raw_meta->>'full_name',
        split_part(user_email, '@', 1)
    );
    user_avatar := COALESCE(
        raw_meta->>'avatar_url',
        raw_meta->>'picture',
        ''
    );

    -- Check if first user in company: automatically grant Admin
    SELECT count(*) INTO existing_profile_count FROM public.profiles;
    IF existing_profile_count = 0 THEN
        assigned_role := 'admin'::user_role;
    ELSE
        assigned_role := 'employee'::user_role;
    END IF;

    -- Insert or update profile
    INSERT INTO public.profiles (id, auth_user_id, name, email, avatar_url, role)
    VALUES (
        new.id,
        new.id,
        user_name,
        user_email,
        user_avatar,
        assigned_role
    )
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        email = EXCLUDED.email,
        -- Keep a photo the user uploaded; otherwise refresh it from Google
        avatar_url = CASE
            WHEN public.profiles.avatar_url LIKE '%/storage/v1/object/public/avatars/%'
                THEN public.profiles.avatar_url
            ELSE EXCLUDED.avatar_url
        END,
        updated_at = timezone('utc'::text, now());

    RETURN new;
END;
$$;

-- Drop trigger if already exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_task_logs_updated_at ON public.task_logs;
CREATE TRIGGER set_task_logs_updated_at
    BEFORE UPDATE ON public.task_logs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==============================================================================
-- 7. Row Level Security (RLS) Configuration
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_logs ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 7.1 PROFILES RLS Policies
-- ------------------------------------------------------------------------------

-- Everyone authenticated can view profiles (needed to see names, avatars, team leaders)
CREATE POLICY "Authenticated users can view profiles"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (true);

-- Only Admin can insert or change roles/profiles of anyone
CREATE POLICY "Admins have full access to profiles"
    ON public.profiles
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Users can update their own non-role profile details
CREATE POLICY "Users can update their own profile basic info"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    );

-- ------------------------------------------------------------------------------
-- 7.2 TEAM_ASSIGNMENTS RLS Policies
-- ------------------------------------------------------------------------------

-- Select policies:
-- 1. Admins can view all team assignments
-- 2. Team Leaders can view their own team assignments
-- 3. Employees can view assignments where they are the employee
CREATE POLICY "Team assignments select policy"
    ON public.team_assignments
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR team_leader_id = auth.uid()
        OR employee_id = auth.uid()
    );

-- Insert/Delete/Update policies:
-- Admin can manage any assignment
CREATE POLICY "Admins can manage all team assignments"
    ON public.team_assignments
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Team Leaders can add or remove employees from their own team
CREATE POLICY "Team leaders can manage their own team assignments"
    ON public.team_assignments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_team_leader()
        AND team_leader_id = auth.uid()
    );

CREATE POLICY "Team leaders can delete from their own team assignments"
    ON public.team_assignments
    FOR DELETE
    TO authenticated
    USING (
        public.is_team_leader()
        AND team_leader_id = auth.uid()
    );

-- ------------------------------------------------------------------------------
-- 7.3 TASK_LOGS RLS Policies
-- ------------------------------------------------------------------------------

-- SELECT policy:
-- 1. Admins can select ALL task logs
-- 2. Team Leaders can select their own task logs + assigned employees' task logs
-- 3. Employees can select ONLY their own task logs
CREATE POLICY "Task logs select policy"
    ON public.task_logs
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR user_id = auth.uid()
        OR (
            public.is_team_leader()
            AND public.is_assigned_to_team_leader(user_id)
        )
    );

-- INSERT policy:
-- Users can only insert task logs for themselves, with valid work_date <= CURRENT_DATE
CREATE POLICY "Users can insert their own task logs"
    ON public.task_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (user_id = auth.uid() OR public.is_admin())
        AND work_date <= CURRENT_DATE
        AND duration_minutes > 0
    );

-- UPDATE policy:
-- Users can only update their own task logs (or Admin can update)
CREATE POLICY "Users can update their own task logs"
    ON public.task_logs
    FOR UPDATE
    TO authenticated
    USING (
        user_id = auth.uid() OR public.is_admin()
    )
    WITH CHECK (
        (user_id = auth.uid() OR public.is_admin())
        AND work_date <= CURRENT_DATE
        AND duration_minutes > 0
    );

-- DELETE policy:
-- Users can delete their own task logs (or Admin can delete)
CREATE POLICY "Users can delete their own task logs"
    ON public.task_logs
    FOR DELETE
    TO authenticated
    USING (
        user_id = auth.uid() OR public.is_admin()
    );

-- ==============================================================================
-- Storage: profile photo uploads (bucket `avatars`, public read, 2 MB, images only)
-- Files live at avatars/<user id>/<file>; users can only write inside their own folder
-- ==============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Avatar images are publicly readable" ON storage.objects;
CREATE POLICY "Avatar images are publicly readable"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ==============================================================================
-- Admin: delete a user (auth account + profile; task logs and team assignments cascade)
-- Called from the app with supabase.rpc('admin_delete_user', { target_user_id })
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can delete users.';
    END IF;

    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot delete your own account.';
    END IF;

    IF (SELECT role FROM public.profiles WHERE id = target_user_id) = 'admin'
       AND (SELECT count(*) FROM public.profiles WHERE role = 'admin') <= 1 THEN
        RAISE EXCEPTION 'Cannot delete the last admin.';
    END IF;

    DELETE FROM auth.users WHERE id = target_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found.';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
