import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { dataService } from '@/services/dataService'
import { TaskLog, DashboardMetrics } from '@/types'
import { formatMinutes } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { SpotlightCard } from '@/components/react-bits/SpotlightCard'
import { BlurText } from '@/components/react-bits/BlurText'
import { TaskEntryForm } from '@/components/tasks/TaskEntryForm'
import { TaskLogList } from '@/components/tasks/TaskLogList'
import { Clock, CheckCircle2, CalendarDays, Briefcase, Mail } from 'lucide-react'

export const EmployeeDashboard: React.FC = () => {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<TaskLog[]>([])
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalEmployees: 1,
    totalTeamLeaders: 0,
    todayLoggedMinutes: 0,
    todayTasksCount: 0,
    totalLoggedDays: 0,
  })
  const [isLoading, setIsLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!user) return
    setIsLoading(true)
    try {
      const [fetchedTasks, fetchedMetrics] = await Promise.all([
        dataService.getTaskLogs(user.id, user.role),
        dataService.getEmployeeMetrics(user.id),
      ])
      setTasks(fetchedTasks)
      setMetrics(fetchedMetrics)
    } catch (err) {
      console.error('Failed to load employee dashboard data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (!user) return null

  // Greeting based on time of day
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-6">
      {/* Top Welcome Card with Google Profile Image, Name, and Email */}
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
                {greeting},
              </p>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                <BlurText text={user.name} />
              </h1>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                <span>{user.email}</span>
                <span>•</span>
                <Badge variant="employee" className="text-[10px]">
                  Employee
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-100 px-4 py-2.5 sm:self-start">
            <Briefcase className="h-4 w-4 text-blue-600" />
            <div className="text-xs">
              <span className="text-slate-400 block text-[10px]">Work Status</span>
              <span className="font-semibold text-slate-700">Active Logging</span>
            </div>
          </div>
        </div>
      </SpotlightCard>

      {/* Metrics Summary Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Today's Hours */}
        <SpotlightCard className="p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Today's Hours
            </span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
              {formatMinutes(metrics.todayLoggedMinutes)}
            </div>
            <p className="mt-1 text-xs text-slate-400">Total duration logged today</p>
          </div>
        </SpotlightCard>

        {/* Today's Tasks */}
        <SpotlightCard className="p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Today's Tasks
            </span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {metrics.todayTasksCount}
            </div>
            <p className="mt-1 text-xs text-slate-400">Tasks completed or logged</p>
          </div>
        </SpotlightCard>

        {/* Total Logged Days */}
        <SpotlightCard className="p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Logged Days
            </span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <CalendarDays className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {metrics.totalLoggedDays || 1}
            </div>
            <p className="mt-1 text-xs text-slate-400">Days with active log records</p>
          </div>
        </SpotlightCard>
      </div>

      {/* Add Task Log Form */}
      <TaskEntryForm onTaskAdded={loadData} />

      {/* Task Log List (All days in one page with date grouping) */}
      <TaskLogList
        tasks={tasks}
        isLoading={isLoading}
        onTaskChange={loadData}
        showUserInfo={false}
      />
    </div>
  )
}
