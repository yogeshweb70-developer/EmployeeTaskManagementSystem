import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { dataService } from '@/services/dataService'
import { Profile, TaskLog, TeamAssignment, DashboardMetrics, UserRole } from '@/types'
import { formatMinutes } from '@/lib/utils'
import { SpotlightCard } from '@/components/react-bits/SpotlightCard'
import { BlurText } from '@/components/react-bits/BlurText'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ChangeRoleModal } from '@/components/admin/ChangeRoleModal'
import { AssignLeaderModal } from '@/components/admin/AssignLeaderModal'
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
  FilterX,
  Plus,
  Pencil,
  Trash2,
  UserPlus,
  Calendar,
  Briefcase,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

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
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([])
  const [assignments, setAssignments] = useState<TeamAssignment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modals state
  const [roleModalUser, setRoleModalUser] = useState<Profile | null>(null)
  const [assignModalEmployee, setAssignModalEmployee] = useState<Profile | null>(null)
  const [teamLeaderToManage, setTeamLeaderToManage] = useState<Profile | null>(null)
  const [editingTask, setEditingTask] = useState<TaskLog | null>(null)
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

  const loadAllData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [fetchedProfiles, fetchedTasks, fetchedAssignments, fetchedMetrics] = await Promise.all([
        dataService.getProfiles(),
        dataService.getTaskLogs('admin', 'admin'),
        dataService.getTeamAssignments(),
        dataService.getAdminMetrics(),
      ])

      setProfiles(fetchedProfiles)
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

  // Filtered task logs
  const filteredTasks = useMemo(() => {
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

      // Date range filter
      if (filterStartDate && task.work_date < filterStartDate) return false
      if (filterEndDate && task.work_date > filterEndDate) return false

      // Search
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase().trim()
        const matchesName = task.task_name.toLowerCase().includes(q)
        const matchesDesc = task.task_description?.toLowerCase().includes(q)
        const matchesUser = task.profiles?.name?.toLowerCase().includes(q)
        if (!matchesName && !matchesDesc && !matchesUser) return false
      }

      return true
    })
  }, [taskLogs, filterEmployeeId, filterLeaderId, filterStartDate, filterEndDate, filterSearch, assignments])

  // Filtered users
  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      if (userRoleFilter !== 'all' && p.role !== userRoleFilter) return false
      if (userSearch.trim()) {
        const q = userSearch.toLowerCase().trim()
        if (!p.name.toLowerCase().includes(q) && !p.email.toLowerCase().includes(q)) {
          return false
        }
      }
      return true
    })
  }, [profiles, userRoleFilter, userSearch])

  // Overall minutes in filtered tasks
  const periodTotalMinutes = useMemo(() => {
    return filteredTasks.reduce((acc, t) => acc + t.duration_minutes, 0)
  }, [filteredTasks])

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
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
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
            <p className="mt-1 text-xs text-slate-400">Registered staff members</p>
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
            <p className="mt-1 text-xs text-slate-400">Supervising leads</p>
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
        <TabsList className="bg-slate-100 p-1 w-full sm:w-auto grid grid-cols-3">
          <TabsTrigger value="all-tasks" className="text-xs sm:text-sm">
            All Task Logs
          </TabsTrigger>
          <TabsTrigger value="user-management" className="text-xs sm:text-sm">
            User Management ({profiles.length})
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
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Filter controls matching prompt: [Employee] [Team Leader] [Date Range] [Search] */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                {/* Employee Filter */}
                <div className="sm:col-span-3">
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
                <div className="sm:col-span-3">
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
                <div className="sm:col-span-2">
                  <Input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="bg-white text-xs"
                    placeholder="From Date"
                  />
                </div>

                {/* Date range To */}
                <div className="sm:col-span-2">
                  <Input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="bg-white text-xs"
                    placeholder="To Date"
                  />
                </div>

                {/* Search */}
                <div className="relative sm:col-span-2">
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
                <div className="overflow-x-auto rounded-lg border border-slate-200">
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
                          <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
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
                                    {t.profiles?.name || 'Staff Member'}
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
                              <span className="font-medium text-slate-900 block">{t.task_name}</span>
                              {t.task_description && (
                                <span className="text-[11px] text-slate-500 line-clamp-1">
                                  {t.task_description}
                                </span>
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
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-slate-400 hover:text-blue-600"
                                  onClick={() => setEditingTask(t)}
                                  title="Edit task log"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-slate-400 hover:text-rose-600"
                                  onClick={() => setDeletingTask(t)}
                                  title="Delete task log"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: USER MANAGEMENT (ADMIN-ONLY PAGE) */}
        <TabsContent value="user-management" className="space-y-4">
          <Card className="border border-slate-200 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    User Management & Role Permissions
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Manage users, change system roles, assign team leaders, and control company access
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Search and Role Filter */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                <div className="relative sm:col-span-8">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search users by name or email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-9 bg-white text-xs"
                  />
                </div>

                <div className="sm:col-span-4">
                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="all">All Roles</option>
                    <option value="employee">Employees Only</option>
                    <option value="team_leader">Team Leaders Only</option>
                    <option value="admin">Admins Only</option>
                  </select>
                </div>
              </div>

              {/* Users Table */}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Team Leader</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredProfiles.map((p) => {
                      const leader = p.role === 'employee' ? getLeaderForEmployee(p.id) : null

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-8 w-8 ring-1 ring-slate-200">
                                <AvatarImage src={p.avatar_url} />
                                <AvatarFallback className="text-xs">
                                  {p.name.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-semibold text-slate-800">{p.name}</span>
                            </div>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                            {p.email}
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            {p.role === 'admin' ? (
                              <Badge variant="admin">Admin</Badge>
                            ) : p.role === 'team_leader' ? (
                              <Badge variant="leader">Team Leader</Badge>
                            ) : (
                              <Badge variant="employee">Employee</Badge>
                            )}
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            {p.role === 'employee' ? (
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
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRoleModalUser(p)}
                                className="h-7 text-[11px] px-2"
                              >
                                Change Role
                              </Button>

                              {p.role === 'employee' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setAssignModalEmployee(p)}
                                  className="h-7 text-[11px] px-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                                >
                                  Assign Leader
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
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

      {/* Role Change Modal */}
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
