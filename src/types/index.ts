export type UserRole = 'employee' | 'team_leader' | 'admin'

// Access status of someone who already has an account
export type UserStatus = 'pending' | 'active' | 'deactivated'

// Lifecycle of an invitation record
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export interface Profile {
  id: string
  auth_user_id?: string
  name: string
  email: string
  avatar_url: string
  role: UserRole
  status?: UserStatus
  invited_at?: string | null
  activated_at?: string | null
  deactivated_at?: string | null
  invited_by?: string | null
  created_at: string
  updated_at?: string
  assigned_leader?: {
    id: string
    name: string
    email: string
  } | null
}

export interface Invitation {
  id: string
  name: string
  email: string
  role: UserRole
  status: InvitationStatus
  invited_by?: string | null
  accepted_profile_id?: string | null
  send_count: number
  created_at: string
  last_sent_at: string
  expires_at: string
  link_opened_at?: string | null
  accepted_at?: string | null
  revoked_at?: string | null
}

// What the admin User Management table renders: one row per person, whether
// they are still a pending invitation or an account that has been accepted.
export interface ManagedUser {
  key: string
  kind: 'profile' | 'invitation'
  name: string
  email: string
  avatar_url: string
  role: UserRole
  status: UserStatus
  invitationStatus?: InvitationStatus
  invitedAt?: string | null
  activatedAt?: string | null
  deactivatedAt?: string | null
  expiresAt?: string | null
  sendCount?: number
  profile?: Profile
  invitation?: Invitation
}

export interface InviteResult {
  invitation_id: string
  name: string
  email: string
  expires_at: string
  invite_link: string
  emailed: boolean
  email_error?: string
}

// Public details shown on the invitation landing page
export interface InvitationPreview {
  name: string
  email: string
  status: InvitationStatus
  expires_at: string
}

export interface TaskLog {
  id: string
  user_id: string
  task_name: string
  task_description?: string | null
  duration_minutes: number
  work_date: string // Format: YYYY-MM-DD
  created_at: string
  updated_at?: string
  // Joined relation for Team Leader and Admin views
  profiles?: {
    id: string
    name: string
    email: string
    avatar_url: string
    role: UserRole
  }
}

export interface TeamAssignment {
  id: string
  team_leader_id: string
  employee_id: string
  created_at: string
  team_leader?: Profile
  employee?: Profile
}

export interface DateGroupedTasks {
  date: string
  formattedDate: string
  totalMinutes: number
  tasks: TaskLog[]
}

export interface TaskFilterOptions {
  searchQuery?: string
  employeeId?: string
  teamLeaderId?: string
  startDate?: string
  endDate?: string
  specificDate?: string
}

export interface DashboardMetrics {
  totalEmployees: number
  totalTeamLeaders: number
  todayLoggedMinutes: number
  todayTasksCount: number
  totalLoggedDays?: number
  pendingInvites?: number
  deactivatedUsers?: number
}
