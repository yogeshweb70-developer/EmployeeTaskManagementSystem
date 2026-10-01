export type UserRole = 'employee' | 'team_leader' | 'admin'

export interface Profile {
  id: string
  auth_user_id?: string
  name: string
  email: string
  avatar_url: string
  role: UserRole
  created_at: string
  updated_at?: string
  assigned_leader?: {
    id: string
    name: string
    email: string
  } | null
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
}
