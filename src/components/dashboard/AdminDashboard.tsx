import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { dataService } from '@/services/dataService'
import { Profile, TaskLog, TeamAssignment, DashboardMetrics, ManagedUser } from '@/types'
import { cn, formatDateDDMMYYYY, formatMinutes, getTodayDateString, getWeekStartDateString, getMonthStartDateString, daysActiveSince } from '@/lib/utils'
import { SpotlightCard } from '@/components/react-bits/SpotlightCard'
import { BlurText } from '@/components/react-bits/BlurText'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ChangeRoleModal } from '@/components/admin/ChangeRoleModal'
import { DeleteUserDialog } from '@/components/admin/DeleteUserDialog'
import { AssignLeaderModal } from '@/components/admin/AssignLeaderModal'
import { InviteUserModal } from '@/components/admin/InviteUserModal'
import { UserStatusBadge } from '@/components/admin/UserStatusBadge'
import { TeamAssignmentModal } from '@/components/team/TeamAssignmentModal'
import { EditTaskModal } from '@/components/tasks/EditTaskModal'
import { DeleteConfirmDialog } from '@/components/tasks/DeleteConfirmDialog'
import {
  Users,
  UserCheck,
  Clock,
  CheckCircle2,
  Shield,
  Layers,
  Search,
  CalendarDays,
  FilterX,
  Plus,
  Pencil,
  Trash2,
  UserPlus,
  Calendar,
  Briefcase,
  ChevronRight,
  MailPlus,
  MailCheck,
  RefreshCw,
  Ban,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { RichText, LinkifiedText, Highlight, richTextToPlain } from '@/components/common/RichText'
import { Hint } from '@/components/ui/tooltip'

interface AdminDashboardProps {
  initialTab?: string
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  initialTab = 'all-tasks',
}) => {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState(initialTab)

  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalEmployees: 0,
    totalTeamLeaders: 0,
    todayLoggedMinutes: 0,
    todayTasksCount: 0,
  })
  const [profiles, setProfiles] = useState<Profile[]>([])
  // Accounts and outstanding invitations in one list, for the User Management table
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([])
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([])
  const [assignments, setAssignments] = useState<TeamAssignment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modals state
  const [roleModalUser, setRoleModalUser] = useState<Profile | null>(null)
  const [deletingUser, setDeletingUser] = useState<Profile | null>(null)
  const [assignModalEmployee, setAssignModalEmployee] = useState<Profile | null>(null)
  const [teamLeaderToManage, setTeamLeaderToManage] = useState<Profile | null>(null)
  const [editingTask, setEditingTask] = useState<TaskLog | null>(null)
  const [modalMode, setModalMode] = useState<'view' | 'edit'>('view')
  const [deletingTask, setDeletingTask] = useState<TaskLog | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Filters for All Task Logs page
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>('all')
  const [filterLeaderId, setFilterLeaderId] = useState<string>('all')
  const [filterStartDate, setFilterStartDate] = useState<string>('')
  const [filterEndDate, setFilterEndDate] = useState<string>('')
  const [filterSearch, setFilterSearch] = useState<string>('')

  // Filter for User Management table
  const [userSearch, setUserSearch] = useState<string>('')
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all')
  const [userStatusFilter, setUserStatusFilter] = useState<string>('all')

  // Invite / access controls
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  // Row key currently running an action, so only that row shows a spinner
  const [busyRowKey, setBusyRowKey] = useState<string | null>(null)

  const loadAllData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [fetchedProfiles, fetchedManagedUsers, fetchedTasks, fetchedAssignments, fetchedMetrics] =
        await Promise.all([
          dataService.getProfiles(),
          dataService.getManagedUsers(),
          dataService.getTaskLogs('admin', 'admin'),
          dataService.getTeamAssignments(),
          dataService.getAdminMetrics(),
        ])

      setProfiles(fetchedProfiles)
      setManagedUsers(fetchedManagedUsers)
      setTaskLogs(fetchedTasks)
      setAssignments(fetchedAssignments)
      setMetrics(fetchedMetrics)
    } catch (err) {
      console.error('Failed to load admin data:', err)
      toast.error('Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  // Helpers
  const employeesList = useMemo(() => profiles.filter((p) => p.role === 'employee'), [profiles])
  const teamLeadersList = useMemo(() => profiles.filter((p) => p.role === 'team_leader'), [profiles])

  // Tasks for the selected employee / team leader (no date or search filter)
  const scopedTasks = useMemo(() => {
    return taskLogs.filter((task) => {
      // Employee filter
      if (filterEmployeeId !== 'all' && task.user_id !== filterEmployeeId) {
        return false
      }

      // Team Leader filter: find if task.user_id is the leader OR assigned to this leader
      if (filterLeaderId !== 'all') {
        const isLeader = task.user_id === filterLeaderId
        const isAssigned = assignments.some(
          (a) => a.team_leader_id === filterLeaderId && a.employee_id === task.user_id
        )
        if (!isLeader && !isAssigned) return false
      }

      return true
    })
  }, [taskLogs, filterEmployeeId, filterLeaderId, assignments])

  // Filtered task logs
  const filteredTasks = useMemo(() => {
    return scopedTasks.filter((task) => {

      // Date range filter
      if (filterStartDate && task.work_date < filterStartDate) return false
      if (filterEndDate && task.work_date > filterEndDate) return false

      // Search
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase().trim()
        const matchesName = task.task_name.toLowerCase().includes(q)
        const matchesDesc = richTextToPlain(task.task_description).toLowerCase().includes(q)
        const matchesUser = task.profiles?.name?.toLowerCase().includes(q)
        if (!matchesName && !matchesDesc && !matchesUser) return false
      }

      return true
    })
  }, [scopedTasks, filterStartDate, filterEndDate, filterSearch])

  // Filtered users: accounts and outstanding invitations together
  const filteredUsers = useMemo(() => {
    return managedUsers.filter((u) => {
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false

      if (userStatusFilter !== 'all') {
        // "pending" covers every invitation that has not been accepted yet
        const matchesStatus =
          userStatusFilter === 'pending' ? u.kind === 'invitation' : u.kind === 'profile' && u.status === userStatusFilter
        if (!matchesStatus) return false
      }

      if (userSearch.trim()) {
        const q = userSearch.toLowerCase().trim()
        if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) {
          return false
        }
      }
      return true
    })
  }, [managedUsers, userRoleFilter, userStatusFilter, userSearch])

  // Counts for the status summary strip
  const accessCounts = useMemo(() => {
    return {
      active: managedUsers.filter((u) => u.kind === 'profile' && u.status === 'active').length,
      pending: managedUsers.filter((u) => u.kind === 'invitation' && u.invitationStatus === 'pending').length,
      deactivated: managedUsers.filter((u) => u.kind === 'profile' && u.status === 'deactivated').length,
    }
  }, [managedUsers])

  // Issue a fresh link for an invitation that was never accepted
  const handleResendInvite = async (row: ManagedUser) => {
    if (!row.invitation) return
    setBusyRowKey(row.key)
    try {
      const result = await dataService.resendInvitation(row.invitation.id)
      if (result.emailed) {
        toast.success(`Invitation resent to ${result.email}`)
      } else {
        toast.warning(`New link created for ${result.email}`, {
          description: result.email_error || 'The email could not be sent; share the link manually.',
        })
      }
      loadAllData()
    } catch (err: any) {
      toast.error('Could not resend the invitation', { description: err.message })
    } finally {
      setBusyRowKey(null)
    }
  }

  // Cancel a pending invitation; the record and its history are kept
  const handleRevokeInvite = async (row: ManagedUser) => {
    if (!row.invitation) return
    setBusyRowKey(row.key)
    try {
      await dataService.revokeInvitation(row.invitation.id)
      toast.success(`Invitation for ${row.email} cancelled`)
      loadAllData()
    } catch (err: any) {
      toast.error('Could not cancel the invitation', { description: err.message })
    } finally {
      setBusyRowKey(null)
    }
  }

  // Turn an existing account's access off or back on
  const handleToggleAccess = async (row: ManagedUser) => {
    if (!row.profile || !user) return
    const nextStatus = row.status === 'deactivated' ? 'active' : 'deactivated'
    setBusyRowKey(row.key)
    try {
      await dataService.setUserStatus(row.profile.id, nextStatus, user.id, user.role)
      toast.success(
        nextStatus === 'deactivated' ? `${row.name}'s access has been disabled` : `${row.name} can sign in again`,
        {
          description:
            nextStatus === 'deactivated'
              ? 'They are signed out and blocked even if they authenticate with Google again.'
              : 'Their previous task logs and team assignments are untouched.',
        }
      )
      loadAllData()
    } catch (err: any) {
      toast.error('Could not update access', { description: err.message })
    } finally {
      setBusyRowKey(null)
    }
  }

  // Overall minutes in filtered tasks
  const periodTotalMinutes = useMemo(() => {
    return filteredTasks.reduce((acc, t) => acc + t.duration_minutes, 0)
  }, [filteredTasks])

  // Weekly card appears after 7 days of activity, monthly after 30 (counted from the first logged task)
  const periodSummary = useMemo(() => {
    const today = getTodayDateString()
    if (scopedTasks.length === 0) return { showWeekly: false, showMonthly: false, weekMinutes: 0, monthMinutes: 0 }
    const firstLogDate = scopedTasks.reduce((min, t) => (t.work_date < min ? t.work_date : min), today)
    const activeDays = daysActiveSince(firstLogDate, today)
    const weekStart = getWeekStartDateString()
    const monthStart = getMonthStartDateString()
    let weekMinutes = 0
    let monthMinutes = 0
    for (const t of scopedTasks) {
      if (t.work_date >= weekStart && t.work_date <= today) weekMinutes += t.duration_minutes
      if (t.work_date >= monthStart && t.work_date <= today) monthMinutes += t.duration_minutes
    }
    return { showWeekly: activeDays >= 7, showMonthly: activeDays >= 30, weekMinutes, monthMinutes }
  }, [scopedTasks])

  // Map employee ID to their Team Leader object
  const getLeaderForEmployee = (empId: string): Profile | null => {
    const assignment = assignments.find((a) => a.employee_id === empId)
    if (!assignment) return null
    return profiles.find((p) => p.id === assignment.team_leader_id) || null
  }

  // Handle task deletion
  const handleConfirmDelete = async () => {
    if (!deletingTask || !user) return
    setIsDeleting(true)
    try {
      await dataService.deleteTaskLog(deletingTask.id, user.id, user.role)
      toast.success('Task log deleted')
      setDeletingTask(null)
      loadAllData()
    } catch (err: any) {
      toast.error('Failed to delete task', { description: err.message })
    } finally {
      setIsDeleting(false)
    }
  }

  // Reset task filters
  const resetTaskFilters = () => {
    setFilterEmployeeId('all')
    setFilterLeaderId('all')
    setFilterStartDate('')
    setFilterEndDate('')
    setFilterSearch('')
  }

  if (!user) return null

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <SpotlightCard className="border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-4 ring-blue-500/10 shadow-sm">
              <AvatarImage src={user.avatar_url} alt={user.name} />
              <AvatarFallback className="text-xl font-bold bg-blue-100 text-blue-600">
                {user.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                Company Administration Portal
              </p>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                <BlurText text={user.name} />
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span>{user.email}</span>
                <span>•</span>
                <Badge variant="admin" className="text-[10px]">
                  Full Administrator Access
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </SpotlightCard>

      {/* Admin Dashboard 4 Key Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Employees */}
        <SpotlightCard className="p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Employees
            </span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {metrics.totalEmployees}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Active staff members
              {metrics.pendingInvites ? ` · ${metrics.pendingInvites} invite${metrics.pendingInvites === 1 ? '' : 's'} pending` : ''}
              {metrics.deactivatedUsers ? ` · ${metrics.deactivatedUsers} deactivated` : ''}
            </p>
          </div>
        </SpotlightCard>

        {/* Team Leaders */}
        <SpotlightCard className="p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Team Leaders
            </span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {metrics.totalTeamLeaders}
            </div>
            <p className="mt-1 text-xs text-slate-400">Active supervising leads</p>
          </div>
        </SpotlightCard>

        {/* Today's Logged Hours */}
        <SpotlightCard className="p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Today's Logged Hours
            </span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
              {formatMinutes(metrics.todayLoggedMinutes)}
            </div>
            <p className="mt-1 text-xs text-slate-400">Total company hours today</p>
          </div>
        </SpotlightCard>

        {/* Today's Tasks */}
        <SpotlightCard className="p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Today's Tasks
            </span>
            <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {metrics.todayTasksCount}
            </div>
            <p className="mt-1 text-xs text-slate-400">Logged across all staff</p>
          </div>
        </SpotlightCard>
      </div>

      {/* Tabs: All Task Logs | User Management | Team Assignments */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="p-1 w-full sm:w-auto grid grid-cols-3">
          <TabsTrigger value="all-tasks" className="text-xs sm:text-sm">
            All Task Logs
          </TabsTrigger>
          <TabsTrigger value="user-management" className="text-xs sm:text-sm">
            User Management ({managedUsers.length})
          </TabsTrigger>
          <TabsTrigger value="team-assignments" className="text-xs sm:text-sm">
            Team Assignments
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: ALL TASK LOGS (CENTRAL PAGE) */}
        <TabsContent value="all-tasks" className="space-y-4">
          <Card className="border border-slate-200 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Employee Task Logs Central View
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Comprehensive log entries across all historical dates and employees
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {periodSummary.showWeekly && (
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-1.5">
                      <CalendarDays className="h-4 w-4 text-blue-600" />
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                          This Week Hours
                        </span>
                        <span className="text-sm font-bold text-blue-950 font-mono">
                          {formatMinutes(periodSummary.weekMinutes)}
                        </span>
                      </div>
                    </div>
                  )}
                  {periodSummary.showMonthly && (
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-1.5">
                      <CalendarDays className="h-4 w-4 text-blue-600" />
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                          This Month Hours
                        </span>
                        <span className="text-sm font-bold text-blue-950 font-mono">
                          {formatMinutes(periodSummary.monthMinutes)}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-1.5">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-blue-600 block">
                        Period Total Hours
                      </span>
                      <span className="text-sm font-bold text-blue-950 font-mono">
                        {formatMinutes(periodTotalMinutes)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Filter controls matching prompt: [Employee] [Team Leader] [Date Range] [Search] */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
                {/* Employee Filter */}
                <div className="lg:col-span-3">
                  <select
                    value={filterEmployeeId}
                    onChange={(e) => setFilterEmployeeId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="all">Filter by Employee: All</option>
                    {employeesList.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Team Leader Filter */}
                <div className="lg:col-span-3">
                  <select
                    value={filterLeaderId}
                    onChange={(e) => setFilterLeaderId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="all">Filter by Team Leader: All</option>
                    {teamLeadersList.map((ldr) => (
                      <option key={ldr.id} value={ldr.id}>
                        {ldr.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date range From */}
                <div className="lg:col-span-2">
                  <Input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="bg-white text-xs"
                    placeholder="From Date"
                  />
                </div>

                {/* Date range To */}
                <div className="lg:col-span-2">
                  <Input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="bg-white text-xs"
                    placeholder="To Date"
                  />
                </div>

                {/* Search */}
                <div className="relative lg:col-span-2">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search task..."
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    className="pl-8 bg-white text-xs"
                  />
                </div>
              </div>

              {(filterEmployeeId !== 'all' ||
                filterLeaderId !== 'all' ||
                filterStartDate ||
                filterEndDate ||
                filterSearch) && (
                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span>Filtered: showing {filteredTasks.length} task entries</span>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={resetTaskFilters}
                    className="h-auto p-0 text-blue-600 text-xs"
                  >
                    Reset all filters
                  </Button>
                </div>
              )}

              {/* Central Logs Table */}
              {isLoading ? (
                <div className="space-y-2 py-6">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-lg border-slate-200">
                  <p className="text-xs text-slate-500">
                    No task logs found matching the selected filters.
                  </p>
                </div>
              ) : (
                <>
                <div className="hidden overflow-x-auto rounded-lg border border-slate-200 lg:block">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="px-4 py-3">Employee</th>
                        <th className="px-4 py-3">Team Leader</th>
                        <th className="px-4 py-3">Task</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3 text-right">Time Spent</th>
                        <th className="px-4 py-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredTasks.map((t) => {
                        const assignedLeader = getLeaderForEmployee(t.user_id)

                        return (
                          <tr
                            key={t.id}
                            onClick={() => {
                              setModalMode('view')
                              setEditingTask(t)
                            }}
                            className="cursor-pointer hover:bg-slate-50/70 transition-colors"
                          >
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <Avatar className="h-7 w-7">
                                  <AvatarImage src={t.profiles?.avatar_url} />
                                  <AvatarFallback className="text-[10px]">
                                    {t.profiles?.name?.substring(0, 2).toUpperCase() || 'EM'}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <span className="font-semibold text-slate-800 block">
                                    <Highlight text={t.profiles?.name || 'Staff Member'} query={filterSearch} />
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {t.profiles?.email}
                                  </span>
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-3 whitespace-nowrap">
                              {assignedLeader ? (
                                <Badge variant="outline" className="text-[10px] text-blue-700 bg-blue-50/50">
                                  {assignedLeader.name}
                                </Badge>
                              ) : t.profiles?.role === 'team_leader' ? (
                                <span className="text-[10px] font-medium text-slate-400">Self (Lead)</span>
                              ) : (
                                <span className="text-[10px] text-slate-400">Unassigned</span>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <LinkifiedText value={t.task_name} highlight={filterSearch} className="font-medium text-slate-900 block" />
                              {t.task_description && (
                                <RichText value={t.task_description} highlight={filterSearch} className="text-[11px] text-slate-500 line-clamp-2" />
                              )}
                            </td>

                            <td className="px-4 py-3 whitespace-nowrap text-slate-600 font-mono">
                              {t.work_date}
                            </td>

                            <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-semibold text-slate-800">
                              {formatMinutes(t.duration_minutes)}
                            </td>

                            <td className="px-4 py-3 whitespace-nowrap text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Hint label="Edit task log">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-slate-400 hover:text-blue-600"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setModalMode('edit')
                                      setEditingTask(t)
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </Hint>
                                <Hint label="Delete task log">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-slate-400 hover:text-rose-600"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setDeletingTask(t)
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </Hint>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Phones/tablets: stacked cards instead of the wide table */}
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white lg:hidden">
                  {filteredTasks.map((t) => (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setModalMode('view')
                        setEditingTask(t)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setModalMode('view')
                          setEditingTask(t)
                        }
                      }}
                      className="cursor-pointer space-y-2 p-3 transition-colors hover:bg-slate-50/70"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarImage src={t.profiles?.avatar_url} />
                            <AvatarFallback className="text-[10px]">
                              {t.profiles?.name?.substring(0, 2).toUpperCase() || 'EM'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <Highlight
                              text={t.profiles?.name || 'Staff Member'}
                              query={filterSearch}
                              className="block truncate text-xs font-semibold text-slate-800"
                            />
                            <span className="block truncate text-[10px] text-slate-400">{t.profiles?.email}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-blue-600"
                            onClick={(e) => {
                              e.stopPropagation()
                              setModalMode('edit')
                              setEditingTask(t)
                            }}
                            aria-label="Edit task log"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-rose-600"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeletingTask(t)
                            }}
                            aria-label="Delete task log"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div>
                        <LinkifiedText value={t.task_name} highlight={filterSearch} className="block text-sm font-medium text-slate-900" />
                        {t.task_description && (
                          <RichText value={t.task_description} highlight={filterSearch} className="text-[11px] text-slate-500 line-clamp-2" />
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-slate-500">{formatDateDDMMYYYY(t.work_date)}</span>
                        <span className="font-mono font-semibold text-slate-800">{formatMinutes(t.duration_minutes)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: USER MANAGEMENT (ADMIN-ONLY PAGE) */}
        <TabsContent value="user-management" className="space-y-4">
          <Card className="border border-slate-200 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    User Management &amp; Access Control
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Access is invite only. Invite people by name and email, track whether the invitation is still
                    pending or has been accepted, and switch access on or off
                  </CardDescription>
                </div>

                <Button
                  onClick={() => setIsInviteOpen(true)}
                  className="h-9 shrink-0 gap-1.5 bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <MailPlus className="h-3.5 w-3.5" />
                  Invite User
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Access status summary */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className="flex items-center gap-2.5 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
                  <UserCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <div className="text-sm font-bold text-slate-900">{accessCounts.active}</div>
                    <div className="text-[11px] text-slate-500">Active users</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2.5">
                  <MailCheck className="h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <div className="text-sm font-bold text-slate-900">{accessCounts.pending}</div>
                    <div className="text-[11px] text-slate-500">Pending invites</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2.5">
                  <Ban className="h-4 w-4 shrink-0 text-rose-600" />
                  <div>
                    <div className="text-sm font-bold text-slate-900">{accessCounts.deactivated}</div>
                    <div className="text-[11px] text-slate-500">Deactivated</div>
                  </div>
                </div>
              </div>

              {/* Search, Role and Status filters */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                <div className="relative sm:col-span-6">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search users by name or email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-9 bg-white text-xs"
                  />
                </div>

                <div className="sm:col-span-3">
                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                    aria-label="Filter by role"
                    className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="all">All Roles</option>
                    <option value="employee">Employees Only</option>
                    <option value="team_leader">Team Leaders Only</option>
                    <option value="admin">Admins Only</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <select
                    value={userStatusFilter}
                    onChange={(e) => setUserStatusFilter(e.target.value)}
                    aria-label="Filter by access status"
                    className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="pending">Pending Invite</option>
                    <option value="deactivated">Deactivated</option>
                  </select>
                </div>
              </div>

              {/* Users Table */}
              <div className="hidden overflow-x-auto rounded-lg border border-slate-200 lg:block">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Team Leader</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Invited / Joined</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                          No users match these filters.
                        </td>
                      </tr>
                    )}

                    {filteredUsers.map((u) => {
                      const p = u.profile
                      const leader = p && p.role === 'employee' ? getLeaderForEmployee(p.id) : null
                      const isSelf = p?.id === user?.id
                      const isBusy = busyRowKey === u.key
                      const isDeactivated = u.kind === 'profile' && u.status === 'deactivated'

                      return (
                        <tr
                          key={u.key}
                          className={cn(
                            'transition-colors hover:bg-slate-50/70',
                            isDeactivated && 'bg-rose-50/30'
                          )}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <Avatar
                                className={cn('h-8 w-8 ring-1 ring-slate-200', isDeactivated && 'opacity-60 grayscale')}
                              >
                                <AvatarImage src={u.avatar_url} />
                                <AvatarFallback className="text-xs">
                                  {u.name.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <Highlight text={u.name} query={userSearch} className="font-semibold text-slate-800" />
                            </div>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                            <Highlight text={u.email} query={userSearch} />
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            {u.role === 'admin' ? (
                              <Badge variant="admin">Admin</Badge>
                            ) : u.role === 'team_leader' ? (
                              <Badge variant="leader">Team Leader</Badge>
                            ) : (
                              <Badge variant="employee">Employee</Badge>
                            )}
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            {u.kind === 'invitation' ? (
                              <span className="text-slate-400">—</span>
                            ) : u.role === 'employee' ? (
                              leader ? (
                                <span className="font-medium text-slate-700">{leader.name}</span>
                              ) : (
                                <span className="text-amber-600 font-medium">Unassigned</span>
                              )
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <UserStatusBadge user={u} />
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap text-[11px] text-slate-500">
                            {u.kind === 'invitation' ? (
                              <>
                                Invited {u.invitedAt ? formatDateDDMMYYYY(u.invitedAt.slice(0, 10)) : '—'}
                                {u.invitationStatus === 'pending' && u.expiresAt && (
                                  <span className="block text-slate-400">
                                    Expires {formatDateDDMMYYYY(u.expiresAt.slice(0, 10))}
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                Joined {u.activatedAt ? formatDateDDMMYYYY(u.activatedAt.slice(0, 10)) : '—'}
                                {isDeactivated && u.deactivatedAt && (
                                  <span className="block text-rose-500">
                                    Disabled {formatDateDDMMYYYY(u.deactivatedAt.slice(0, 10))}
                                  </span>
                                )}
                              </>
                            )}
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {u.kind === 'invitation' ? (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleResendInvite(u)}
                                    disabled={isBusy}
                                    className="h-7 gap-1 px-2 text-[11px] text-blue-600 border-blue-200 hover:bg-blue-50"
                                  >
                                    <RefreshCw className={cn('h-3 w-3', isBusy && 'animate-spin')} />
                                    Resend
                                  </Button>
                                  {u.invitationStatus === 'pending' && (
                                    <Hint label={`Cancel the invitation for ${u.email}`}>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleRevokeInvite(u)}
                                        disabled={isBusy}
                                        aria-label={`Cancel the invitation for ${u.email}`}
                                        className="h-7 w-7 p-0 text-slate-400 border-slate-200 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                                      >
                                        <XCircle className="h-3.5 w-3.5" />
                                      </Button>
                                    </Hint>
                                  )}
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => p && setRoleModalUser(p)}
                                    className="h-7 text-[11px] px-2"
                                  >
                                    Change Role
                                  </Button>

                                  {u.role === 'employee' && !isDeactivated && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => p && setAssignModalEmployee(p)}
                                      className="h-7 text-[11px] px-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                                    >
                                      Assign Leader
                                    </Button>
                                  )}

                                  {/* Own row: shown but disabled; the wrapper keeps the tooltip working on a disabled button */}
                                  <Hint
                                    label={
                                      isSelf
                                        ? "You can't change your own access"
                                        : isDeactivated
                                          ? `Restore access for ${u.name}`
                                          : `Disable access for ${u.name}`
                                    }
                                  >
                                    <span
                                      tabIndex={isSelf ? 0 : undefined}
                                      className={isSelf ? 'inline-flex cursor-not-allowed' : 'inline-flex'}
                                    >
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleToggleAccess(u)}
                                        disabled={isSelf || isBusy}
                                        aria-label={isDeactivated ? `Reactivate ${u.name}` : `Deactivate ${u.name}`}
                                        className={cn(
                                          'h-7 gap-1 px-2 text-[11px]',
                                          isDeactivated
                                            ? 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                                            : 'text-amber-600 border-amber-200 hover:bg-amber-50'
                                        )}
                                      >
                                        {isDeactivated ? (
                                          <RotateCcw className="h-3 w-3" />
                                        ) : (
                                          <Ban className="h-3 w-3" />
                                        )}
                                        {isDeactivated ? 'Reactivate' : 'Deactivate'}
                                      </Button>
                                    </span>
                                  </Hint>

                                  <Hint label={isSelf ? "You can't delete your own account" : `Delete ${u.name}`}>
                                    <span
                                      tabIndex={isSelf ? 0 : undefined}
                                      className={isSelf ? 'inline-flex cursor-not-allowed' : 'inline-flex'}
                                    >
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => p && setDeletingUser(p)}
                                        disabled={isSelf}
                                        className="h-7 w-7 p-0 text-slate-400 border-slate-200 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                                        aria-label={isSelf ? "You can't delete your own account" : `Delete ${u.name}`}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </span>
                                  </Hint>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Phones/tablets: stacked cards instead of the wide table */}
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white lg:hidden">
                {filteredUsers.length === 0 && (
                  <p className="p-6 text-center text-xs text-slate-400">No users match these filters.</p>
                )}

                {filteredUsers.map((u) => {
                  const p = u.profile
                  const leader = p && p.role === 'employee' ? getLeaderForEmployee(p.id) : null
                  const isSelf = p?.id === user?.id
                  const isBusy = busyRowKey === u.key
                  const isDeactivated = u.kind === 'profile' && u.status === 'deactivated'

                  return (
                    <div key={u.key} className={cn('space-y-2.5 p-3', isDeactivated && 'bg-rose-50/30')}>
                      <div className="flex items-center gap-2.5">
                        <Avatar
                          className={cn(
                            'h-9 w-9 shrink-0 ring-1 ring-slate-200',
                            isDeactivated && 'opacity-60 grayscale'
                          )}
                        >
                          <AvatarImage src={u.avatar_url} />
                          <AvatarFallback className="text-xs">{u.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <Highlight
                            text={u.name}
                            query={userSearch}
                            className="block truncate text-sm font-semibold text-slate-800"
                          />
                          <Highlight
                            text={u.email}
                            query={userSearch}
                            className="block truncate text-[11px] text-slate-500"
                          />
                        </div>
                        {u.role === 'admin' ? (
                          <Badge variant="admin">Admin</Badge>
                        ) : u.role === 'team_leader' ? (
                          <Badge variant="leader">Team Leader</Badge>
                        ) : (
                          <Badge variant="employee">Employee</Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <UserStatusBadge user={u} />
                        <span className="text-[11px] text-slate-400">
                          {u.kind === 'invitation'
                            ? `Invited ${u.invitedAt ? formatDateDDMMYYYY(u.invitedAt.slice(0, 10)) : '—'}`
                            : `Joined ${u.activatedAt ? formatDateDDMMYYYY(u.activatedAt.slice(0, 10)) : '—'}`}
                        </span>
                      </div>

                      {u.kind === 'profile' && u.role === 'employee' && (
                        <p className="text-[11px] text-slate-500">
                          Team Leader:{' '}
                          {leader ? (
                            <span className="font-medium text-slate-700">{leader.name}</span>
                          ) : (
                            <span className="font-medium text-amber-600">Unassigned</span>
                          )}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5">
                        {u.kind === 'invitation' ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResendInvite(u)}
                              disabled={isBusy}
                              className="h-8 gap-1 px-2.5 text-[11px] text-blue-600 border-blue-200 hover:bg-blue-50"
                            >
                              <RefreshCw className={cn('h-3 w-3', isBusy && 'animate-spin')} />
                              Resend Invite
                            </Button>
                            {u.invitationStatus === 'pending' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRevokeInvite(u)}
                                disabled={isBusy}
                                className="h-8 gap-1 px-2.5 text-[11px] text-slate-500 border-slate-200 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                              >
                                <XCircle className="h-3 w-3" />
                                Cancel
                              </Button>
                            )}
                          </>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => p && setRoleModalUser(p)}
                              className="h-8 text-[11px] px-2.5"
                            >
                              Change Role
                            </Button>
                            {u.role === 'employee' && !isDeactivated && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => p && setAssignModalEmployee(p)}
                                className="h-8 text-[11px] px-2.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                              >
                                Assign Leader
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleAccess(u)}
                              disabled={isSelf || isBusy}
                              className={cn(
                                'h-8 gap-1 px-2.5 text-[11px]',
                                isDeactivated
                                  ? 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                                  : 'text-amber-600 border-amber-200 hover:bg-amber-50'
                              )}
                            >
                              {isDeactivated ? <RotateCcw className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                              {isDeactivated ? 'Reactivate' : 'Deactivate'}
                            </Button>
                            <Hint label={isSelf ? "You can't delete your own account" : `Delete ${u.name}`}>
                              <span
                                tabIndex={isSelf ? 0 : undefined}
                                className={
                                  isSelf ? 'ml-auto inline-flex cursor-not-allowed' : 'ml-auto inline-flex'
                                }
                              >
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => p && setDeletingUser(p)}
                                  disabled={isSelf}
                                  className="h-8 w-8 p-0 text-slate-400 border-slate-200 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                                  aria-label={isSelf ? "You can't delete your own account" : `Delete ${u.name}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </span>
                            </Hint>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: TEAM ASSIGNMENTS */}
        <TabsContent value="team-assignments" className="space-y-4">
          <Card className="border border-slate-200 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Team Assignments Matrix
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Overview of active team rosters. An employee can belong to multiple Team Leaders
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {teamLeadersList.map((leader) => {
                  const assignedForThisLeader = assignments
                    .filter((a) => a.team_leader_id === leader.id)
                    .map((a) => profiles.find((p) => p.id === a.employee_id))
                    .filter(Boolean) as Profile[]

                  return (
                    <div
                      key={leader.id}
                      className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 ring-2 ring-blue-500/20">
                            <AvatarImage src={leader.avatar_url} />
                            <AvatarFallback>{leader.name.substring(0, 2)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-900 text-sm">{leader.name}</h4>
                              <Badge variant="leader" className="text-[10px]">Leader</Badge>
                            </div>
                            <p className="text-xs text-slate-500">{leader.email}</p>
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTeamLeaderToManage(leader)}
                          className="h-8 text-xs gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>Edit Roster</span>
                        </Button>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-2">
                          <span>Assigned Employees ({assignedForThisLeader.length})</span>
                        </div>

                        {assignedForThisLeader.length === 0 ? (
                          <p className="text-xs text-slate-400 italic py-2">
                            No employees assigned to this team leader yet.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {assignedForThisLeader.map((emp) => (
                              <div
                                key={emp.id}
                                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={emp.avatar_url} />
                                    <AvatarFallback className="text-[9px]">
                                      {emp.name.substring(0, 2)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium text-slate-800">{emp.name}</span>
                                </div>
                                <span className="text-[11px] text-slate-400">{emp.email}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Invite User Modal */}
      <InviteUserModal open={isInviteOpen} onOpenChange={setIsInviteOpen} onInvited={loadAllData} />

      {/* Role Change Modal */}
      <DeleteUserDialog
        user={deletingUser}
        onOpenChange={(open) => {
          if (!open) setDeletingUser(null)
        }}
        onUserDeleted={loadAllData}
      />

      <ChangeRoleModal
        userToEdit={roleModalUser}
        open={Boolean(roleModalUser)}
        onOpenChange={(open) => {
          if (!open) setRoleModalUser(null)
        }}
        onRoleChanged={loadAllData}
      />

      {/* Assign Leader Modal */}
      <AssignLeaderModal
        employee={assignModalEmployee}
        open={Boolean(assignModalEmployee)}
        onOpenChange={(open) => {
          if (!open) setAssignModalEmployee(null)
        }}
        onSaved={loadAllData}
      />

      {/* Team Leader Roster Management Modal */}
      {teamLeaderToManage && (
        <TeamAssignmentModal
          leader={teamLeaderToManage}
          open={Boolean(teamLeaderToManage)}
          onOpenChange={(open) => {
            if (!open) setTeamLeaderToManage(null)
          }}
          onSaved={loadAllData}
        />
      )}

      {/* Edit Task Modal */}
      <EditTaskModal
        task={editingTask}
        mode={modalMode}
        open={Boolean(editingTask)}
        onOpenChange={(open) => {
          if (!open) setEditingTask(null)
        }}
        onTaskUpdated={loadAllData}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={Boolean(deletingTask)}
        onOpenChange={(open) => {
          if (!open) setDeletingTask(null)
        }}
        taskTitle={deletingTask?.task_name || ''}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
    </div>
  )
}
