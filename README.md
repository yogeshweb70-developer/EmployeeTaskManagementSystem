# ZeroAdo TaskLog — Employee Task Log Management System

A modern, production-grade **Employee Task Log Management System** built with **React**, **Supabase**, **shadcn/ui**, and **React Bits**.

---

## 🌟 Overview & Key Features

### 1. Authentication & Security
- **Supabase Google OAuth SSO**: Dedicated Google login with corporate single sign-on flow.
- **Approved Company Domain Restriction**: Only accounts ending in the approved company domain (e.g. `@company.com`) are allowed access. Personal Gmail or external email domains are blocked at the gateway and database trigger level.
- **Automatic Profile Sync**: Google name, email, and avatar picture are extracted automatically upon authentication without manual data entry.
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
The database structure is located in `supabase/schema.sql`:
- **`public.profiles`**: Stores user ID, Google OAuth metadata, and role (`employee`, `team_leader`, `admin`).
- **`public.team_assignments`**: Manages team assignments enforcing **One Employee → One Team Leader** via unique constraint.
- **`public.task_logs`**: Stores task records with foreign keys to profiles, duration, and work date.
- **PostgreSQL Row Level Security (RLS)**:
  - `public.is_admin()` and `public.is_team_leader()` security-definer helper functions prevent infinite recursion.
  - Employees can only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` their own logs (`user_id = auth.uid()`).
  - Team leaders can only `SELECT` their own logs + assigned employees' logs (`public.is_assigned_to_team_leader(user_id)`).
  - Admins have full access.

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
3. (Optional) Run `supabase/seed.sql` to populate sample data for testing.
4. Go to **Authentication** -> **Providers** -> **Google**:
   - Enable Google provider.
   - Enter your **Google Client ID** and **Google Client Secret** from Google Cloud Console.
   - Set Redirect URI to `https://<your-project>.supabase.co/auth/v1/callback`.

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
