import {
  Profile,
  TaskLog,
  TeamAssignment,
  UserRole,
  UserStatus,
  TaskFilterOptions,
  DashboardMetrics,
  Invitation,
  InviteResult,
  InvitationPreview,
  ManagedUser,
} from '@/types'
import { INITIAL_PROFILES, INITIAL_ASSIGNMENTS, INITIAL_TASKS } from '@/lib/mockData'
import { isSupabaseConfigured, supabase, validateCompanyEmail } from '@/lib/supabase'
import { getTodayDateString } from '@/lib/utils'

const PROFILES_STORAGE_KEY = 'tasklog_profiles_v1'
const ASSIGNMENTS_STORAGE_KEY = 'tasklog_assignments_v1'
const TASKS_STORAGE_KEY = 'tasklog_tasks_v1'
const INVITATIONS_STORAGE_KEY = 'tasklog_invitations_v1'

const INVITE_VALID_DAYS = 7

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

// supabase.functions.invoke() reports a non-2xx reply as a generic
// "Edge Function returned a non-2xx status code". The real reason is in the
// response body, so pull it out and show that instead.
async function readFunctionError(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response }).context

  if (context && typeof context.json === 'function') {
    // A function that was never deployed 404s without CORS headers, so the
    // browser reports a network failure rather than the status
    if (context.status === 404) {
      return 'The invite-user Edge Function is not deployed on this Supabase project. Run: supabase functions deploy invite-user'
    }
    try {
      const body = await context.json()
      if (body?.error) return String(body.error)
    } catch {
      // Body was not JSON; fall through to the generic message
    }
  }

  // FunctionsFetchError: the request never got a response at all
  const message = error instanceof Error ? error.message : ''
  if (/failed to send a request|failed to fetch|networkerror/i.test(message)) {
    return 'Could not reach the invite-user Edge Function. It is most likely not deployed yet — run: supabase functions deploy invite-user (and set the SMTP_USER, SMTP_PASS and APP_URL secrets).'
  }

  return message || fallback
}

// Invitations are only persisted locally when Supabase is not configured, so the
// demo mode still behaves like an invite-only workspace.
function getStoredInvitations(): Invitation[] {
  try {
    return JSON.parse(localStorage.getItem(INVITATIONS_STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveInvitations(invitations: Invitation[]): void {
  localStorage.setItem(INVITATIONS_STORAGE_KEY, JSON.stringify(invitations))
}

// A pending invitation that has run out of time counts as expired everywhere
function withExpiry(invitation: Invitation): Invitation {
  if (invitation.status === 'pending' && new Date(invitation.expires_at).getTime() <= Date.now()) {
    return { ...invitation, status: 'expired' }
  }
  return invitation
}

function profileToManagedUser(profile: Profile): ManagedUser {
  return {
    key: `profile-${profile.id}`,
    kind: 'profile',
    name: profile.name,
    email: profile.email,
    avatar_url: profile.avatar_url,
    role: profile.role,
    status: profile.status ?? 'active',
    invitedAt: profile.invited_at ?? null,
    activatedAt: profile.activated_at ?? profile.created_at,
    deactivatedAt: profile.deactivated_at ?? null,
    profile,
  }
}

function invitationToManagedUser(invitation: Invitation): ManagedUser {
  return {
    key: `invitation-${invitation.id}`,
    kind: 'invitation',
    name: invitation.name,
    email: invitation.email,
    avatar_url: '',
    role: invitation.role,
    status: 'pending',
    invitationStatus: invitation.status,
    invitedAt: invitation.created_at,
    activatedAt: null,
    expiresAt: invitation.expires_at,
    sendCount: invitation.send_count,
    invitation,
  }
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

  // Permanently removes the user's login, profile, task logs and team assignments
  async deleteUser(targetUserId: string, requesterId: string, requesterRole: UserRole): Promise<void> {
    if (requesterRole !== 'admin') {
      throw new Error('Unauthorized: Only administrators can delete users.')
    }
    if (targetUserId === requesterId) {
      throw new Error('You cannot delete your own account.')
    }

    if (isSupabaseConfigured()) {
      const { error } = await supabase.rpc('admin_delete_user', { target_user_id: targetUserId })
      if (error) throw error
      return
    }

    // Local-only mode (no Supabase configured)
    saveProfiles(getStoredProfiles().filter((p) => p.id !== targetUserId))
    saveAssignments(
      getStoredAssignments().filter((a) => a.employee_id !== targetUserId && a.team_leader_id !== targetUserId)
    )
    saveTasks(getStoredTasks().filter((t) => t.user_id !== targetUserId))
  },

  // --------------------------------------------------------------------------
  // INVITATIONS & ACCESS STATUS
  // --------------------------------------------------------------------------

  // Every invitation ever sent, newest first. Admin only.
  async getInvitations(): Promise<Invitation[]> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase.rpc('admin_list_invitations')
      if (error) throw error
      return ((data ?? []) as Invitation[]).map(withExpiry)
    }

    return getStoredInvitations()
      .map(withExpiry)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  },

  // One row per person for the User Management table: existing accounts first,
  // then invitations that have not been accepted yet. An accepted invitation is
  // never listed twice, because the account it created takes its place.
  async getManagedUsers(): Promise<ManagedUser[]> {
    const profiles = await this.getProfiles()
    const profileEmails = new Set(profiles.map((p) => p.email.toLowerCase()))

    let invitations: Invitation[] = []
    try {
      invitations = await this.getInvitations()
    } catch (err) {
      // Non-admins cannot read invitations; the account list is still useful
      console.warn('Could not load invitations:', err)
    }

    const outstanding = invitations.filter(
      (inv) => inv.status !== 'accepted' && !profileEmails.has(inv.email.toLowerCase())
    )

    return [...profiles.map(profileToManagedUser), ...outstanding.map(invitationToManagedUser)]
  },

  // Creates (or refreshes) the invitation and emails the link
  async inviteUser(name: string, email: string, role: UserRole = 'employee'): Promise<InviteResult> {
    const cleanName = name.trim()
    const cleanEmail = email.trim().toLowerCase()

    if (!cleanName) throw new Error('Please enter the name of the person you are inviting.')

    const emailCheck = validateCompanyEmail(cleanEmail)
    if (!emailCheck.isValid) throw new Error(emailCheck.message || 'Please enter a valid company email address.')

    if (isSupabaseConfigured()) {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { action: 'invite', name: cleanName, email: cleanEmail, role },
      })
      if (error) throw new Error(await readFunctionError(error, 'The invitation could not be sent.'))
      if (data?.error) throw new Error(data.error)
      return data as InviteResult
    }

    // Local-only mode: no email is sent, the admin shares the link by hand
    const profiles = getStoredProfiles()
    if (profiles.some((p) => p.email.toLowerCase() === cleanEmail)) {
      throw new Error(`${cleanEmail} already has an account.`)
    }

    const invitations = getStoredInvitations()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + INVITE_VALID_DAYS * 86_400_000).toISOString()
    const token = `local-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
    const existing = invitations.find((inv) => inv.email === cleanEmail)

    const invitation: Invitation = {
      id: existing?.id ?? `invite-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName,
      email: cleanEmail,
      role,
      status: 'pending',
      send_count: (existing?.send_count ?? 0) + 1,
      created_at: existing?.created_at ?? now.toISOString(),
      last_sent_at: now.toISOString(),
      expires_at: expiresAt,
      link_opened_at: null,
      accepted_at: null,
      revoked_at: null,
    }

    saveInvitations([...invitations.filter((inv) => inv.email !== cleanEmail), invitation])

    return {
      invitation_id: invitation.id,
      name: invitation.name,
      email: invitation.email,
      expires_at: invitation.expires_at,
      invite_link: `${window.location.origin}/?invite=${token}`,
      emailed: false,
      email_error: 'Connect Supabase to send invitation emails. Share this link instead.',
    }
  },

  // Issues a fresh link for an invitation that was never accepted
  async resendInvitation(invitationId: string): Promise<InviteResult> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { action: 'resend', invitationId },
      })
      if (error) throw new Error(await readFunctionError(error, 'The invitation could not be resent.'))
      if (data?.error) throw new Error(data.error)
      return data as InviteResult
    }

    const invitation = getStoredInvitations().find((inv) => inv.id === invitationId)
    if (!invitation) throw new Error('Invitation not found.')
    return this.inviteUser(invitation.name, invitation.email, invitation.role)
  },

  async revokeInvitation(invitationId: string): Promise<void> {
    if (isSupabaseConfigured()) {
      const { error } = await supabase.rpc('admin_revoke_invitation', { p_invitation_id: invitationId })
      if (error) throw error
      return
    }

    saveInvitations(
      getStoredInvitations().map((inv) =>
        inv.id === invitationId ? { ...inv, status: 'revoked', revoked_at: new Date().toISOString() } : inv
      )
    )
  },

  // Deactivate or reactivate an account that already exists
  async setUserStatus(targetUserId: string, status: UserStatus, requesterId: string, requesterRole: UserRole): Promise<void> {
    if (requesterRole !== 'admin') {
      throw new Error('Unauthorized: Only administrators can change a user’s access.')
    }
    if (targetUserId === requesterId) {
      throw new Error('You cannot change your own access status.')
    }

    if (isSupabaseConfigured()) {
      const { error } = await supabase.rpc('admin_set_user_status', {
        p_user_id: targetUserId,
        p_status: status,
      })
      if (error) throw error
      return
    }

    const profiles = getStoredProfiles()
    const index = profiles.findIndex((p) => p.id === targetUserId)
    if (index === -1) throw new Error('User not found.')

    profiles[index] = {
      ...profiles[index],
      status,
      deactivated_at: status === 'deactivated' ? new Date().toISOString() : null,
      activated_at: profiles[index].activated_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    saveProfiles(profiles)
  },

  // Used by the invitation landing page before the invitee has signed in
  async getInvitationByToken(token: string): Promise<InvitationPreview | null> {
    if (!token) return null

    if (isSupabaseConfigured()) {
      const { data, error } = await supabase.rpc('get_invitation_by_token', { p_token: token })
      if (error) {
        console.warn('Could not resolve invitation token:', error)
        return null
      }
      const row = Array.isArray(data) ? data[0] : data
      if (!row) return null
      return {
        name: row.invite_name,
        email: row.invite_email,
        status: row.invite_status,
        expires_at: row.expires_at,
      }
    }

    return null
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
    if (taskData.work_date !== todayStr) {
      throw new Error('Tasks can only be logged for today.')
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
      if (error) throw error
      // RLS returns no row when the user may not edit this log
      if (!data || data.length === 0) {
        throw new Error('You can only update your own task logs, or the task no longer exists.')
      }
      return data[0] as TaskLog
    }

    // Local-only mode (no Supabase configured)
    const tasks = getStoredTasks()
    const target = tasks.find((t) => t.id === logId)
    if (!target) throw new Error('Task log not found.')
    if (target.user_id !== requesterId && requesterRole !== 'admin') {
      throw new Error('Unauthorized: You can only update your own task logs.')
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
    if (isSupabaseConfigured()) {
      // RLS (owner or admin) decides; .select() tells us whether a row was actually removed
      const { data, error } = await supabase.from('task_logs').delete().eq('id', logId).select('id')
      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('You can only delete your own task logs, or the task no longer exists.')
      }
      return
    }

    // Local-only mode (no Supabase configured)
    const tasks = getStoredTasks()
    const target = tasks.find((t) => t.id === logId)
    if (!target) return
    if (target.user_id !== requesterId && requesterRole !== 'admin') {
      throw new Error('Unauthorized: You can only delete your own task logs.')
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

    // Headcount reflects people who can actually get in right now
    const isActive = (p: Profile) => (p.status ?? 'active') === 'active'
    const employees = profiles.filter((p) => p.role === 'employee' && isActive(p))
    const teamLeaders = profiles.filter((p) => p.role === 'team_leader' && isActive(p))

    let pendingInvites = 0
    try {
      pendingInvites = (await this.getInvitations()).filter((inv) => inv.status === 'pending').length
    } catch {
      pendingInvites = 0
    }

    const todayTasks = tasks.filter((t) => t.work_date === today)
    const todayMinutes = todayTasks.reduce((acc, t) => acc + t.duration_minutes, 0)

    return {
      totalEmployees: employees.length,
      totalTeamLeaders: teamLeaders.length,
      todayLoggedMinutes: todayMinutes,
      todayTasksCount: todayTasks.length,
      pendingInvites,
      deactivatedUsers: profiles.filter((p) => p.status === 'deactivated').length,
    }
  },
}
