# ZeroAdo TaskLog — Employee Task Log Management System

A modern, production-grade **Employee Task Log Management System** built with **React**, **Supabase**, **shadcn/ui**, and **React Bits**.

---

## 🌟 Overview & Key Features

### 1. Authentication & Security
- **Invite Only — no self sign-up**: A Google account cannot create access on its own. An admin invites someone by **name and email**, which creates a record with **Pending Invitation** status and emails an invitation link. Access is granted only when that person accepts and completes Google authentication.
- **Supabase Google OAuth SSO**: Dedicated Google login with corporate single sign-on flow.
- **Approved Company Domain Restriction**: Only accounts ending in the approved company domain (e.g. `@company.com`) are allowed access. Personal Gmail or external email domains are blocked at the gateway and database trigger level.
- **Automatic Profile Sync**: On acceptance, name, email, profile picture, user ID, activation date and access status are stored on the profile automatically.
- **Access status on every user**: `Pending Invite`, `Active` or `Deactivated`, shown in the admin User Management table.
- **Deactivation is enforced, not cosmetic**: a deactivated account is rejected by the sign-in trigger *and* by every RLS policy, so an existing Google session cannot be reused.

#### Invite flow

1. Admin opens **User Management → Invite User** and enters the person's name, email and joining role.
2. A row is created in `public.invitations` with status `pending`, a 7-day expiry and a SHA-256 hash of a one-time token. The raw token is only ever in the emailed link (and shown once to the admin, in case the mail bounces).
3. The invitee opens `/?invite=<token>`, sees a personalised accept screen and signs in with Google.
4. The sign-in trigger matches the verified Google email against the pending invitation, creates the profile as **Active**, and marks the invitation `accepted` — it updates the same invitation row rather than creating a second user record.
5. Admins can **Resend** (new token, new expiry), **Cancel** a pending invitation, and **Deactivate / Reactivate** accounts that already exist. Every one of these steps is appended to `public.access_events`, so the invitation and access history is preserved.
- **Role-Based Access Control (RBAC)**: Supports three user tiers:
  - **Employee**: Can view, add, edit, and delete their own task logs. Cannot view others' logs.
  - **Team Leader**: Can add/edit their own logs, view assigned team members' logs, and manage team assignments. Cannot access unrelated employees or admin controls.
  - **Administrator**: Full company-wide visibility. Central dashboard with all historical employee task logs, user role assignment, and team roster management.

---

### 2. Task Logging & Time Tracking
- **Time Spent Input**: Easy-to-understand Hours and Minutes inputs (e.g., `2 Hours 30 Minutes`). Stored as `duration_minutes` (`150m`) in PostgreSQL and rendered as `2h 30m`.
- **Date Restriction**: Default date is always the current date. Employees can log work for today or previous dates. **Future dates are strictly disabled** both in the date picker UI and via PostgreSQL database check constraints (`CHECK (work_date <= CURRENT_DATE)`).
- **All Days in One Page**: Historical work logs are grouped by date with daily total hours and overall period total hours.
- **Multi-criteria Filtering & Search**: Instant task name/description search, employee filtering, team leader filtering, and custom date range filters.

---

### 3. Database & Row Level Security (RLS)
The database structure is located in `supabase/schema.sql`, with invite-only access layered on top in `supabase/invite_access.sql`:
- **`public.profiles`**: Stores user ID, Google OAuth metadata, role (`employee`, `team_leader`, `admin`), and access status (`pending`, `active`, `deactivated`) with `invited_at`, `activated_at`, `deactivated_at` and `invited_by`.
- **`public.invitations`**: One durable row per invited email — name, role, status (`pending` / `accepted` / `revoked` / `expired`), hashed token, expiry, resend count and acceptance timestamps. Reused across resends, so a person never ends up with duplicate records.
- **`public.access_events`**: Append-only invitation and access history (`invited`, `resent`, `link_opened`, `accepted`, `revoked`, `deactivated`, `reactivated`, `blocked`).
- **`public.team_assignments`**: Manages team assignments enforcing **One Employee → One Team Leader** via unique constraint.
- **`public.task_logs`**: Stores task records with foreign keys to profiles, duration, and work date.
- **PostgreSQL Row Level Security (RLS)**:
  - `public.is_active()`, `public.is_admin()` and `public.is_team_leader()` security-definer helper functions prevent infinite recursion. `is_admin()` and `is_team_leader()` also require an active profile.
  - Every policy requires `public.is_active()`, so deactivation immediately removes all read and write access.
  - Employees can only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` their own logs (`user_id = auth.uid()`).
  - Team leaders can only `SELECT` their own logs + assigned employees' logs (`public.is_assigned_to_team_leader(user_id)`).
  - Admins have full access.
- **Admin RPCs** (all re-check `is_admin()` in the database): `admin_invite_user`, `admin_resend_invitation`, `admin_revoke_invitation`, `admin_set_user_status`, `admin_list_invitations`, `admin_delete_user`. `get_invitation_by_token` is the only invite function callable anonymously, and it returns just the name, email, status and expiry shown on the accept screen.

---

## 🚀 Quick Start Guide

### 1. Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build production bundle
npm run build
```

### 2. Environment Configuration

Copy `.env.example` to `.env`:

```env
# Supabase Project Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Approved Company Email Domain
VITE_APPROVED_COMPANY_DOMAIN=@company.com

# Application Name
VITE_APP_NAME=ZeroAdo TaskLog
```

---

## 🗄️ Setting Up Supabase Database

1. Open your **Supabase Dashboard** -> **SQL Editor**.
2. Run the script in `supabase/schema.sql` to initialize tables, constraints, trigger functions, and RLS policies.
3. Run `supabase/invite_access.sql` to switch the project to invite-only access. **This step is required** — on its own, `schema.sql` still lets any approved-domain Google account self-register. The script is idempotent, so it is safe to re-run on an existing project; existing profiles are kept and marked `active`.

   > **Always run these two in order, and never `schema.sql` by itself.** `schema.sql` redefines `handle_new_user()`, `is_admin()` and `is_team_leader()` with `CREATE OR REPLACE`, so running it against a project that is already invite-only reverts the gate — self-registration comes back and deactivated users regain access. Re-running `invite_access.sql` afterwards restores it.
4. (Optional) Run `supabase/seed.sql` to populate sample data for testing.
5. Go to **Authentication** -> **Providers** -> **Google**:
   - Enable Google provider.
   - Enter your **Google Client ID** and **Google Client Secret** from Google Cloud Console.
   - Set Redirect URI to `https://<your-project>.supabase.co/auth/v1/callback`.

### Sending invitation emails

Invitation mail is sent by the `invite-user` Edge Function, which reuses the SMTP setup of the daily reminder function:

```bash
# Replace all three values with real ones. APP_URL in particular must be the
# actual address people open — it is pasted straight into the invitation link,
# so a placeholder produces invitations nobody can accept.
supabase secrets set SMTP_USER=yogesh@zeroado.com
supabase secrets set SMTP_PASS=abcdefghijklmnop          # 16-char Google App Password, spaces removed
supabase secrets set APP_URL=https://tasks.zeroado.com

supabase functions deploy invite-user
```

`SMTP_PASS` must be a **Google App Password**, not the account password. Generate one at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (2-Step Verification has to be on first) and strip the spaces Google shows between the four blocks. A regular password, or an app password that has been revoked, fails with `535-5.7.8 Username and Password not accepted`.

Secrets are set per **project**, not per function, so the daily reminder function shares them.

The function never holds privileges of its own: it forwards the signed-in admin's JWT to the `admin_invite_user` / `admin_resend_invitation` RPCs, which enforce the admin check. If SMTP is not configured, or delivery fails, the invitation is still created and the admin is shown the link to share by hand.

### First admin

On a brand-new, empty workspace the first Google sign-in from the approved domain is granted the **admin** role, so there is someone to send the first invitations. Once a single profile exists, that bootstrap is closed and every further sign-in needs an invitation.

---

## 👥 Roles & Test Scenarios

The system includes pre-configured realistic profiles for instant testing:

| Name | Role | Email | Supervised By / Team |
|---|---|---|---|
| **David Admin** | Administrator | `david@company.com` | Full company access |
| **Sarah Williams** | Team Leader | `sarah@company.com` | Leads John, Mike, Emily |
| **Alex Rivera** | Team Leader | `alex@company.com` | Leads Jessica, Kevin |
| **John Smith** | Employee | `john@company.com` | Assigned to Sarah Williams |
| **Mike Johnson** | Employee | `mike@company.com` | Assigned to Sarah Williams |
| **Emily Davis** | Employee | `emily@company.com` | Assigned to Sarah Williams |
| **Daniel Clark** | Employee | `daniel@company.com` | Unassigned Employee |

---

## 🛠️ Tech Stack & UI Components

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS + Plus Jakarta Sans typography
- **UI Libraries**:
  - **shadcn/ui**: Dialog, DropdownMenu, Select, Tabs, Table, Avatar, Badge, Card, Alert-Dialog, Tooltip, Input, Textarea, Button, Skeleton
  - **React Bits**: `SpotlightCard`, `ShinyText`, `BlurText`, `AnimatedGrid`
  - **Icons**: Lucide React
  - **Notifications**: Sonner toasts + Canvas Confetti
