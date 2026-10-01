import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { dataService } from '@/services/dataService'
import { Profile, TaskLog } from '@/types'
import { formatMinutes } from '@/lib/utils'
import { SpotlightCard } from '@/components/react-bits/SpotlightCard'
import { BlurText } from '@/components/react-bits/BlurText'
import { TaskEntryForm } from '@/components/tasks/TaskEntryForm'
import { TaskLogList } from '@/components/tasks/TaskLogList'
import { TeamAssignmentModal } from '@/components/team/TeamAssignmentModal'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Users,
  Clock,
  Briefcase,
  UserPlus,
  Search,
  FilterX,
  FileSpreadsheet,
  CheckCircle2,
  Trash2,
  Calendar,
  Lock,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import { RichText, LinkifiedText, Highlight, richTextToPlain } from '@/components/common/RichText'

interface TeamLeaderDashboardProps {
  initialTab?: string
}

export const TeamLeaderDashboard: React.FC<TeamLeaderDashboardProps> = ({
  initialTab = 'overview',
}) => {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState(initialTab)

  const [assignedEmployees, setAssignedEmployees] = useState<Profile[]>([])
  const [teamTasks, setTeamTasks] = useState<TaskLog[]>([])
  const [myOwnTasks, setMyOwnTasks] = useState<TaskLog[]>([])
  const [todayTeamMinutes, setTodayTeamMinutes] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  // Modals & Filters
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>('all')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterDate, setFilterDate] = useState('')

  const loadData = useCallback(async () => {
    if (!user) return
    setIsLoading(true)
    try {
      const [members, tasks, leaderMetrics] = await Promise.all([
        dataService.getAssignedEmployeesForLeader(user.id),
        dataService.getTaskLogs(user.id, 'team_leader'),
        dataService.getTeamLeaderMetrics(user.id),
      ])

      setAssignedEmployees(members)
      setTeamTasks(tasks)
      setMyOwnTasks(tasks.filter((t) => t.user_id === user.id))
      setTodayTeamMinutes(leaderMetrics.todayTeamMinutes)
    } catch (err) {
      console.error('Failed to load team leader dashboard data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filtered team task logs
  const filteredTeamTasks = useMemo(() => {
    return teamTasks.filter((t) => {
      // Exclude own tasks if viewing team members only in logs, or keep all
      if (filterEmployeeId !== 'all' && t.user_id !== filterEmployeeId) {
        return false
      }
      if (filterDate && t.work_date !== filterDate) {
        return false
      }
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase().trim()
        const matchesName = t.task_name.toLowerCase().includes(q)
        const matchesDesc = richTextToPlain(t.task_description).toLowerCase().includes(q)
        const matchesUser = t.profiles?.name?.toLowerCase().includes(q)
        if (!matchesName && !matchesDesc && !matchesUser) return false
      }
      return true
    })
  }, [teamTasks, filterEmployeeId, filterDate, filterSearch])

  // Filtered period total
  const filteredPeriodTotal = useMemo(() => {
    return filteredTeamTasks.reduce((acc, t) => acc + t.duration_minutes, 0)
  }, [filteredTeamTasks])

  // Remove employee directly
  const handleRemoveEmployee = async (employeeId: string, employeeName: string) => {
    if (!user) return
    try {
      await dataService.removeEmployeeFromLeader(user.id, employeeId, user.id, user.role)
      toast.success(`Removed ${employeeName} from your team`)
      loadData()
    } catch (err: any) {
      toast.error('Failed to remove employee', { description: err.message })
    }
  }

  if (!user) return null

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <SpotlightCard className="border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-4 ring-blue-500/10 shadow-sm">
              <AvatarImage src={user.avatar_url} alt={user.name} />
              <AvatarFallback className="text-xl font-bold bg-blue-100 text-blue-700">
                {user.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                Team Leader Workspace
              </p>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                <BlurText text={user.name} />
              </h1>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span>{user.email}</span>
                <span>•</span>
                <Badge variant="leader" className="text-[10px]">
                  Team Leader
                </Badge>
              </div>
            </div>
          </div>

          <Button
            onClick={() => setIsAssignModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <UserPlus className="h-4 w-4" />
            <span>Manage Team Roster</span>
          </Button>
        </div>
      </SpotlightCard>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* My Team Count */}
        <SpotlightCard className="p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              My Team
            </span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {assignedEmployees.length} Employees
            </div>
            <p className="mt-1 text-xs text-slate-400">Directly assigned members</p>
          </div>
        </SpotlightCard>

        {/* Today's Team Hours */}
        <SpotlightCard className="p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Today's Team Hours
            </span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
              {formatMinutes(todayTeamMinutes)}
            </div>
            <p className="mt-1 text-xs text-slate-400">Logged by team members today</p>
          </div>
        </SpotlightCard>
      </div>

      {/* Main Tabs: My Tasks | My Team | Team Task Logs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-100 p-1 w-full sm:w-auto grid grid-cols-3">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">
            My Tasks
          </TabsTrigger>
          <TabsTrigger value="my-team" className="text-xs sm:text-sm">
            My Team ({assignedEmployees.length})
          </TabsTrigger>
          <TabsTrigger value="team-logs" className="text-xs sm:text-sm">
            Team Task Logs
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: MY TASKS */}
        <TabsContent value="overview" className="space-y-6">
          <TaskEntryForm onTaskAdded={loadData} />
          <TaskLogList
            tasks={myOwnTasks}
            isLoading={isLoading}
            onTaskChange={loadData}
            showUserInfo={false}
          />
        </TabsContent>

        {/* TAB 2: MY TEAM */}
        <TabsContent value="my-team" className="space-y-4">
          <Card className="border border-slate-200 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold">Assigned Team Members</CardTitle>
                <CardDescription className="text-xs">
                  Employees assigned to you. Only their task logs are visible to you.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAssignModalOpen(true)}
                className="gap-1.5 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Add / Remove Members</span>
              </Button>
            </CardHeader>

            <CardContent>
              {assignedEmployees.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed rounded-lg border-slate-200">
                  <Users className="h-8 w-8 text-slate-400" />
                  <h4 className="mt-2 text-sm font-semibold text-slate-800">No Employees Assigned</h4>
                  <p className="mt-1 text-xs text-slate-500 max-w-sm">
                    You currently have no employees assigned to your team. Click the button below to assign team members.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setIsAssignModalOpen(true)}
                    className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                  >
                    Assign Employees
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {assignedEmployees.map((emp) => (
                    <div
                      key={emp.id}
                      className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/90 bg-white hover:border-blue-200 hover:shadow-xs transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={emp.avatar_url} alt={emp.name} />
                          <AvatarFallback className="text-xs bg-slate-100 font-semibold">
                            {emp.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 leading-tight">
                            {emp.name}
                          </p>
                          <p className="text-xs text-slate-500">{emp.email}</p>
                          <Badge variant="employee" className="mt-1 text-[9px] px-1.5 py-0">
                            Assigned
                          </Badge>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveEmployee(emp.id, emp.name)}
                        className="text-slate-400 hover:text-rose-600 h-8 w-8"
                        title="Remove from team"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: TEAM TASK LOGS */}
        <TabsContent value="team-logs" className="space-y-4">
          <Card className="border border-slate-200 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Team Task Logs
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Work logs of employees assigned to you (RLS protected)
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3.5 py-1.5">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-blue-600 block">
                      Total Hours
                    </span>
                    <span className="text-sm font-bold text-blue-950 font-mono">
                      {formatMinutes(filteredPeriodTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                {/* Employee Filter */}
                <div className="sm:col-span-4">
                  <select
                    value={filterEmployeeId}
                    onChange={(e) => setFilterEmployeeId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="all">All Assigned Team Members</option>
                    {assignedEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.email})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Filter */}
                <div className="sm:col-span-3">
                  <Input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="bg-white text-xs"
                    placeholder="Specific date"
                  />
                </div>

                {/* Search */}
                <div className="relative sm:col-span-4">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search tasks..."
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    className="pl-9 bg-white text-xs"
                  />
                </div>

                {/* Clear */}
                {(filterEmployeeId !== 'all' || filterDate || filterSearch) && (
                  <div className="sm:col-span-1 flex items-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setFilterEmployeeId('all')
                        setFilterDate('')
                        setFilterSearch('')
                      }}
                      className="h-10 w-10 text-slate-500 hover:text-slate-900"
                    >
                      <FilterX className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Logs Table */}
              {isLoading ? (
                <div className="space-y-2 py-4">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : filteredTeamTasks.length === 0 ? (
                <div className="text-center py-10 border border-dashed rounded-lg border-slate-200">
                  <p className="text-xs text-slate-500">
                    No task logs found for the selected team member and criteria.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="px-4 py-3">Employee</th>
                        <th className="px-4 py-3">Task</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3 text-right">Time Spent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredTeamTasks.map((t) => (
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
                                  <Highlight text={t.profiles?.name || 'Unknown'} query={filterSearch} />
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {t.profiles?.email}
                                </span>
                              </div>
                            </div>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Team Assignment Modal */}
      <TeamAssignmentModal
        leader={user}
        open={isAssignModalOpen}
        onOpenChange={setIsAssignModalOpen}
        onSaved={loadData}
      />
    </div>
  )
}
