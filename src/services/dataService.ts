import { Profile, TaskLog, TeamAssignment, UserRole, TaskFilterOptions, DashboardMetrics } from '@/types'
import { INITIAL_PROFILES, INITIAL_ASSIGNMENTS, INITIAL_TASKS } from '@/lib/mockData'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { getTodayDateString } from '@/lib/utils'

const PROFILES_STORAGE_KEY = 'tasklog_profiles_v1'
const ASSIGNMENTS_STORAGE_KEY = 'tasklog_assignments_v1'
const TASKS_STORAGE_KEY = 'tasklog_tasks_v1'

// Local storage helpers
function getStoredProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(INITIAL_PROFILES))
      return INITIAL_PROFILES
    }
    return JSON.parse(raw)
  } catch {
    return INITIAL_PROFILES
  }
}

function saveProfiles(profiles: Profile[]): void {
  localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles))
}

function getStoredAssignments(): TeamAssignment[] {
  try {
    const raw = localStorage.getItem(ASSIGNMENTS_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(INITIAL_ASSIGNMENTS))
      return INITIAL_ASSIGNMENTS
    }
    return JSON.parse(raw)
  } catch {
    return INITIAL_ASSIGNMENTS
  }
}

function saveAssignments(assignments: TeamAssignment[]): void {
  localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments))
}

function getStoredTasks(): TaskLog[] {
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(INITIAL_TASKS))
      return INITIAL_TASKS
    }
    return JSON.parse(raw)
  } catch {
    return INITIAL_TASKS
  }
}

function saveTasks(tasks: TaskLog[]): void {
  localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks))
}

// Reset data to initial mock
export function resetMockData(): void {
  localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(INITIAL_PROFILES))
  localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(INITIAL_ASSIGNMENTS))
  localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(INITIAL_TASKS))
}

// Data service object
export const dataService = {
  // --------------------------------------------------------------------------
  // PROFILES
  // --------------------------------------------------------------------------
  async getProfiles(): Promise<Profile[]> {
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.from('profiles').select('*').order('name')
        if (error) throw error
        return data as Profile[]
      } catch (err) {
        console.warn('Falling back to local storage for profiles:', err)
      }
    }

    const profiles = getStoredProfiles()
    const assignments = getStoredAssignments()

    // Enrich profiles with assigned leader information
    return profiles.map((p) => {
      const assignment = assignments.find((a) => a.employee_id === p.id)
      if (assignment) {
        const leader = profiles.find((l) => l.id === assignment.team_leader_id)
        return {
          ...p,
          assigned_leader: leader ? { id: leader.id, name: leader.name, email: leader.email } : null,
        }
      }
      return { ...p, assigned_leader: null }
    })
  },

  async getProfileById(id: string): Promise<Profile | null> {
    const profiles = await this.getProfiles()
    return profiles.find((p) => p.id === id) || null
  },

  async updateUserRole(targetUserId: string, newRole: UserRole, requesterRole: UserRole): Promise<Profile> {
    if (requesterRole !== 'admin') {
      throw new Error('Unauthorized: Only administrators are authorized to modify user roles.')
    }

    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .update({ role: newRole })
          .eq('id', targetUserId)
          .select()
          .single()
        if (error) throw error
        return data as Profile
      } catch (err) {
        console.warn('Falling back to local update for role:', err)
      }
    }

    const profiles = getStoredProfiles()
    const index = profiles.findIndex((p) => p.id === targetUserId)
    if (index === -1) throw new Error('User not found')

    profiles[index] = {
      ...profiles[index],
      role: newRole,
      updated_at: new Date().toISOString(),
    }
    saveProfiles(profiles)

    // If changing from team_leader to something else, remove their leader assignments
    if (newRole !== 'team_leader') {
      const assignments = getStoredAssignments()
      const filtered = assignments.filter((a) => a.team_leader_id !== targetUserId)
      saveAssignments(filtered)
    }

    // If changing from employee to team_leader or admin, remove their employee assignment to a leader
    if (newRole !== 'employee') {
      const assignments = getStoredAssignments()
      const filtered = assignments.filter((a) => a.employee_id !== targetUserId)
      saveAssignments(filtered)
    }

    return profiles[index]
  },

  // --------------------------------------------------------------------------
  // TEAM ASSIGNMENTS
  // --------------------------------------------------------------------------
  async getTeamAssignments(): Promise<TeamAssignment[]> {
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('team_assignments')
          .select('*, team_leader:profiles!team_assignments_team_leader_id_fkey(*), employee:profiles!team_assignments_employee_id_fkey(*)')
        if (error) throw error
        return data as TeamAssignment[]
      } catch (err) {
        console.warn('Falling back to local storage for assignments:', err)
      }
    }

    const assignments = getStoredAssignments()
    const profiles = getStoredProfiles()

    return assignments.map((a) => ({
      ...a,
      team_leader: profiles.find((p) => p.id === a.team_leader_id),
      employee: profiles.find((p) => p.id === a.employee_id),
    }))
  },

  async getAssignedEmployeeIdsForLeader(leaderId: string): Promise<string[]> {
    const assignments = await this.getTeamAssignments()
    return assignments.filter((a) => a.team_leader_id === leaderId).map((a) => a.employee_id)
  },

  async getAssignedEmployeesForLeader(leaderId: string): Promise<Profile[]> {
    const assignments = await this.getTeamAssignments()
    const profiles = await this.getProfiles()
    const assignedIds = new Set(assignments.filter((a) => a.team_leader_id === leaderId).map((a) => a.employee_id))
    return profiles.filter((p) => assignedIds.has(p.id))
  },

  async assignEmployeesToLeader(
    leaderId: string,
    employeeIds: string[],
    requesterId: string,
    requesterRole: UserRole
  ): Promise<void> {
    // Only Admin or the specific Team Leader can assign
    if (requesterRole !== 'admin' && (requesterRole !== 'team_leader' || requesterId !== leaderId)) {
      throw new Error('Unauthorized: You can only assign members to your own team or as an Admin.')
    }

    if (isSupabaseConfigured()) {
      try {
        // Delete current assignments for this leader
        await supabase.from('team_assignments').delete().eq('team_leader_id', leaderId)

        if (employeeIds.length > 0) {
          // Remove any previous assignments where these employees belonged to another leader
          // (One Employee -> One Team Leader rule)
          await supabase.from('team_assignments').delete().in('employee_id', employeeIds)

          const rowsToInsert = employeeIds.map((empId) => ({
            team_leader_id: leaderId,
            employee_id: empId,
          }))
          const { error } = await supabase.from('team_assignments').insert(rowsToInsert)
          if (error) throw error
        }
        return
      } catch (err) {
        console.warn('Falling back to local storage for assignEmployees:', err)
      }
    }

    let assignments = getStoredAssignments()
    // Remove all current members for this leader
    assignments = assignments.filter((a) => a.team_leader_id !== leaderId)
    // Remove employees that were in other teams (One employee -> One leader rule)
    assignments = assignments.filter((a) => !employeeIds.includes(a.employee_id))

    // Add new assignments
    for (const empId of employeeIds) {
      assignments.push({
        id: `assign-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        team_leader_id: leaderId,
        employee_id: empId,
        created_at: new Date().toISOString(),
      })
    }

    saveAssignments(assignments)
  },

  async removeEmployeeFromLeader(
    leaderId: string,
    employeeId: string,
    requesterId: string,
    requesterRole: UserRole
  ): Promise<void> {
    if (requesterRole !== 'admin' && (requesterRole !== 'team_leader' || requesterId !== leaderId)) {
      throw new Error('Unauthorized: You can only remove members from your own team.')
    }

    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase
          .from('team_assignments')
          .delete()
          .match({ team_leader_id: leaderId, employee_id: employeeId })
        if (error) throw error
        return
      } catch (err) {
        console.warn('Falling back to local storage for removeEmployee:', err)
      }
    }

    let assignments = getStoredAssignments()
    assignments = assignments.filter((a) => !(a.team_leader_id === leaderId && a.employee_id === employeeId))
    saveAssignments(assignments)
  },

  // --------------------------------------------------------------------------
  // TASK LOGS (Enforcing RLS equivalent in logic)
  // --------------------------------------------------------------------------
  async getTaskLogs(
    currentUserId: string,
    currentUserRole: UserRole,
    filters?: TaskFilterOptions
  ): Promise<TaskLog[]> {
    if (isSupabaseConfigured()) {
      try {
        let query = supabase.from('task_logs').select('*, profiles(*)')

        if (filters?.employeeId) {
          query = query.eq('user_id', filters.employeeId)
        }
        if (filters?.startDate) {
          query = query.gte('work_date', filters.startDate)
        }
        if (filters?.endDate) {
          query = query.lte('work_date', filters.endDate)
        }
        if (filters?.specificDate) {
          query = query.eq('work_date', filters.specificDate)
        }
        if (filters?.searchQuery) {
          query = query.ilike('task_name', `%${filters.searchQuery}%`)
        }

        const { data, error } = await query.order('work_date', { ascending: false }).order('created_at', { ascending: false })
        if (error) throw error
        return data as TaskLog[]
      } catch (err) {
        console.warn('Falling back to local storage for task logs query:', err)
      }
    }

    const allTasks = getStoredTasks()
    const profiles = getStoredProfiles()
    const assignments = getStoredAssignments()

    // Determine authorized employee IDs based on role
    let allowedUserIds: Set<string> | null = null // null means all (Admin)

    if (currentUserRole === 'employee') {
      // Employee sees ONLY own tasks
      allowedUserIds = new Set([currentUserId])
    } else if (currentUserRole === 'team_leader') {
      // Team Leader sees OWN tasks + tasks of assigned employees
      const assignedIds = assignments
        .filter((a) => a.team_leader_id === currentUserId)
        .map((a) => a.employee_id)
      allowedUserIds = new Set([currentUserId, ...assignedIds])
    } else if (currentUserRole === 'admin') {
      // Admin sees ALL
      allowedUserIds = null
    }

    // Filter tasks based on RLS access
    let filtered = allTasks.filter((t) => {
      if (allowedUserIds !== null && !allowedUserIds.has(t.user_id)) {
        return false
      }
      return true
    })

    // Apply specific filters
    if (filters?.employeeId) {
      filtered = filtered.filter((t) => t.user_id === filters.employeeId)
    }

    if (filters?.teamLeaderId) {
      const leaderAssignedIds = new Set(
        assignments.filter((a) => a.team_leader_id === filters.teamLeaderId).map((a) => a.employee_id)
      )
      // Include the team leader themselves + their assigned members
      leaderAssignedIds.add(filters.teamLeaderId)
      filtered = filtered.filter((t) => leaderAssignedIds.has(t.user_id))
    }

    if (filters?.specificDate) {
      filtered = filtered.filter((t) => t.work_date === filters.specificDate)
    }

    if (filters?.startDate) {
      filtered = filtered.filter((t) => t.work_date >= filters.startDate!)
    }

    if (filters?.endDate) {
      filtered = filtered.filter((t) => t.work_date <= filters.endDate!)
    }

    if (filters?.searchQuery && filters.searchQuery.trim() !== '') {
      const q = filters.searchQuery.toLowerCase().trim()
      filtered = filtered.filter(
        (t) =>
          t.task_name.toLowerCase().includes(q) ||
          (t.task_description && t.task_description.toLowerCase().includes(q))
      )
    }

    // Sort descending by date and creation
    filtered.sort((a, b) => {
      if (a.work_date !== b.work_date) {
        return b.work_date.localeCompare(a.work_date)
      }
      return b.created_at.localeCompare(a.created_at)
    })

    // Attach profile info
    return filtered.map((t) => {
      const prof = profiles.find((p) => p.id === t.user_id)
      return {
        ...t,
        profiles: prof
          ? {
              id: prof.id,
              name: prof.name,
              email: prof.email,
              avatar_url: prof.avatar_url,
              role: prof.role,
            }
          : undefined,
      }
    })
  },

  async addTaskLog(
    taskData: {
      task_name: string
      task_description?: string
      duration_minutes: number
      work_date: string
      user_id: string
    },
    requesterId: string,
    requesterRole: UserRole
  ): Promise<TaskLog> {
    // Validation
    if (!taskData.task_name || taskData.task_name.trim() === '') {
      throw new Error('Task name is required.')
    }

    if (!taskData.duration_minutes || taskData.duration_minutes <= 0) {
      throw new Error('Time spent must be greater than 0 minutes.')
    }

    const todayStr = getTodayDateString()
    if (taskData.work_date > todayStr) {
      throw new Error('Future dates are not allowed. You can only log tasks for today or previous dates.')
    }

    // RLS: Only self or Admin can insert
    if (taskData.user_id !== requesterId && requesterRole !== 'admin') {
      throw new Error('Unauthorized: You can only record task logs for yourself.')
    }

    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('task_logs')
          .insert({
            user_id: taskData.user_id,
            task_name: taskData.task_name.trim(),
            task_description: taskData.task_description?.trim() || null,
            duration_minutes: taskData.duration_minutes,
            work_date: taskData.work_date,
          })
          .select('*, profiles(*)')
          .single()
        if (error) throw error
        return data as TaskLog
      } catch (err) {
        console.warn('Falling back to local storage for addTaskLog:', err)
      }
    }

    const tasks = getStoredTasks()
    const profiles = getStoredProfiles()
    const newTask: TaskLog = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      user_id: taskData.user_id,
      task_name: taskData.task_name.trim(),
      task_description: taskData.task_description?.trim() || null,
      duration_minutes: taskData.duration_minutes,
      work_date: taskData.work_date,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    tasks.unshift(newTask)
    saveTasks(tasks)

    const prof = profiles.find((p) => p.id === newTask.user_id)
    return {
      ...newTask,
      profiles: prof
        ? {
            id: prof.id,
            name: prof.name,
            email: prof.email,
            avatar_url: prof.avatar_url,
            role: prof.role,
          }
        : undefined,
    }
  },

  async updateTaskLog(
    logId: string,
    updates: {
      task_name?: string
      task_description?: string | null
      duration_minutes?: number
      work_date?: string
    },
    requesterId: string,
    requesterRole: UserRole
  ): Promise<TaskLog> {
    const tasks = getStoredTasks()
    const target = tasks.find((t) => t.id === logId)
    if (!target) throw new Error('Task log not found.')

    // RLS: Only owner or admin can update
    if (target.user_id !== requesterId && requesterRole !== 'admin') {
      throw new Error('Unauthorized: You can only update your own task logs.')
    }

    if (updates.work_date) {
      const todayStr = getTodayDateString()
      if (updates.work_date > todayStr) {
        throw new Error('Future dates are not allowed. You can only log tasks for today or previous dates.')
      }
    }

    if (updates.task_name !== undefined && updates.task_name.trim() === '') {
      throw new Error('Task name cannot be empty.')
    }

    if (updates.duration_minutes !== undefined && updates.duration_minutes <= 0) {
      throw new Error('Time spent must be greater than 0 minutes.')
    }

    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('task_logs')
          .update({
            ...(updates.task_name !== undefined ? { task_name: updates.task_name.trim() } : {}),
            ...(updates.task_description !== undefined ? { task_description: updates.task_description } : {}),
            ...(updates.duration_minutes !== undefined ? { duration_minutes: updates.duration_minutes } : {}),
            ...(updates.work_date !== undefined ? { work_date: updates.work_date } : {}),
          })
          .eq('id', logId)
          .select('*, profiles(*)')
          .single()
        if (error) throw error
        return data as TaskLog
      } catch (err) {
        console.warn('Falling back to local storage for updateTaskLog:', err)
      }
    }

    const index = tasks.findIndex((t) => t.id === logId)
    tasks[index] = {
      ...tasks[index],
      ...(updates.task_name !== undefined ? { task_name: updates.task_name.trim() } : {}),
      ...(updates.task_description !== undefined ? { task_description: updates.task_description } : {}),
      ...(updates.duration_minutes !== undefined ? { duration_minutes: updates.duration_minutes } : {}),
      ...(updates.work_date !== undefined ? { work_date: updates.work_date } : {}),
      updated_at: new Date().toISOString(),
    }
    saveTasks(tasks)

    const profiles = getStoredProfiles()
    const prof = profiles.find((p) => p.id === tasks[index].user_id)
    return {
      ...tasks[index],
      profiles: prof
        ? {
            id: prof.id,
            name: prof.name,
            email: prof.email,
            avatar_url: prof.avatar_url,
            role: prof.role,
          }
        : undefined,
    }
  },

  async deleteTaskLog(logId: string, requesterId: string, requesterRole: UserRole): Promise<void> {
    const tasks = getStoredTasks()
    const target = tasks.find((t) => t.id === logId)
    if (!target) return

    // RLS: Only owner or admin can delete
    if (target.user_id !== requesterId && requesterRole !== 'admin') {
      throw new Error('Unauthorized: You can only delete your own task logs.')
    }

    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('task_logs').delete().eq('id', logId)
        if (error) throw error
        return
      } catch (err) {
        console.warn('Falling back to local storage for deleteTaskLog:', err)
      }
    }

    const filtered = tasks.filter((t) => t.id !== logId)
    saveTasks(filtered)
  },

  // --------------------------------------------------------------------------
  // METRICS & SUMMARIES
  // --------------------------------------------------------------------------
  async getEmployeeMetrics(userId: string): Promise<DashboardMetrics> {
    const tasks = await this.getTaskLogs(userId, 'employee')
    const today = getTodayDateString()

    const todayTasks = tasks.filter((t) => t.work_date === today)
    const todayMinutes = todayTasks.reduce((acc, t) => acc + t.duration_minutes, 0)
    const uniqueDates = new Set(tasks.map((t) => t.work_date))

    return {
      totalEmployees: 1,
      totalTeamLeaders: 0,
      todayLoggedMinutes: todayMinutes,
      todayTasksCount: todayTasks.length,
      totalLoggedDays: uniqueDates.size,
    }
  },

  async getTeamLeaderMetrics(leaderId: string): Promise<{ teamCount: number; todayTeamMinutes: number }> {
    const assignedIds = await this.getAssignedEmployeeIdsForLeader(leaderId)
    const today = getTodayDateString()

    // Leader's team tasks today (including assigned employees)
    const allRelevantIds = new Set([leaderId, ...assignedIds])
    const tasks = await this.getTaskLogs(leaderId, 'team_leader')
    const todayTeamTasks = tasks.filter((t) => t.work_date === today && allRelevantIds.has(t.user_id))
    const todayTeamMinutes = todayTeamTasks.reduce((acc, t) => acc + t.duration_minutes, 0)

    return {
      teamCount: assignedIds.length,
      todayTeamMinutes,
    }
  },

  async getAdminMetrics(): Promise<DashboardMetrics> {
    const profiles = await this.getProfiles()
    const tasks = await this.getTaskLogs('admin', 'admin')
    const today = getTodayDateString()

    const employees = profiles.filter((p) => p.role === 'employee')
    const teamLeaders = profiles.filter((p) => p.role === 'team_leader')

    const todayTasks = tasks.filter((t) => t.work_date === today)
    const todayMinutes = todayTasks.reduce((acc, t) => acc + t.duration_minutes, 0)

    return {
      totalEmployees: employees.length,
      totalTeamLeaders: teamLeaders.length,
      todayLoggedMinutes: todayMinutes,
      todayTasksCount: todayTasks.length,
    }
  },
}
