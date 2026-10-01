import React, { useState, useMemo } from 'react'
import { TaskLog, DateGroupedTasks } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { dataService } from '@/services/dataService'
import { formatMinutes } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EditTaskModal } from './EditTaskModal'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import {
  Calendar as CalendarIcon,
  Search,
  Clock,
  Pencil,
  Trash2,
  FilterX,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Inbox,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'

interface TaskLogListProps {
  tasks: TaskLog[]
  isLoading?: boolean
  onTaskChange: () => void
  showUserInfo?: boolean
}

export const TaskLogList: React.FC<TaskLogListProps> = ({
  tasks,
  isLoading = false,
  onTaskChange,
  showUserInfo = false,
}) => {
  const { user } = useAuth()

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // State for modals
  const [editingTask, setEditingTask] = useState<TaskLog | null>(null)
  const [deletingTask, setDeletingTask] = useState<TaskLog | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Filter tasks based on search and date range
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Search
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim()
        const matchesName = t.task_name.toLowerCase().includes(q)
        const matchesDesc = t.task_description?.toLowerCase().includes(q)
        const matchesUser = t.profiles?.name?.toLowerCase().includes(q)
        if (!matchesName && !matchesDesc && !matchesUser) {
          return false
        }
      }
      // Date range
      if (startDate && t.work_date < startDate) return false
      if (endDate && t.work_date > endDate) return false
      return true
    })
  }, [tasks, searchQuery, startDate, endDate])

  // Overall total minutes for selected filter
  const overallMinutes = useMemo(() => {
    return filteredTasks.reduce((acc, t) => acc + t.duration_minutes, 0)
  }, [filteredTasks])

  // Group tasks by date
  const groupedTasks: DateGroupedTasks[] = useMemo(() => {
    const map = new Map<string, TaskLog[]>()

    // Sort descending by date
    const sorted = [...filteredTasks].sort((a, b) => {
      if (a.work_date !== b.work_date) {
        return b.work_date.localeCompare(a.work_date)
      }
      return b.created_at.localeCompare(a.created_at)
    })

    sorted.forEach((task) => {
      const existing = map.get(task.work_date) || []
      existing.push(task)
      map.set(task.work_date, existing)
    })

    const result: DateGroupedTasks[] = []
    map.forEach((dayTasks, dateStr) => {
      const dayTotal = dayTasks.reduce((acc, t) => acc + t.duration_minutes, 0)
      let formatted = dateStr
      try {
        formatted = format(parseISO(dateStr), 'MMMM d, yyyy')
      } catch {
        formatted = dateStr
      }

      result.push({
        date: dateStr,
        formattedDate: formatted,
        totalMinutes: dayTotal,
        tasks: dayTasks,
      })
    })

    return result
  }, [filteredTasks])

  // Reset filters
  const handleClearFilters = () => {
    setSearchQuery('')
    setStartDate('')
    setEndDate('')
  }

  // Handle task delete
  const handleConfirmDelete = async () => {
    if (!deletingTask || !user) return
    setIsDeleting(true)
    try {
      await dataService.deleteTaskLog(deletingTask.id, user.id, user.role)
      toast.success('Task log deleted')
      setDeletingTask(null)
      onTaskChange()
    } catch (err: any) {
      toast.error('Failed to delete task', { description: err.message })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header and Filter Controls */}
      <Card className="border border-slate-200 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900">
                {showUserInfo ? 'All Employee Task Logs' : 'My Work Logs'}
              </CardTitle>
              <CardDescription className="text-xs">
                Complete historical work logs organized and grouped by day on one page
              </CardDescription>
            </div>
            {/* Overall Total Hours Badge */}
            <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <div>
                <span className="text-[10px] uppercase font-semibold tracking-wider text-blue-600 block">
                  Period Total Hours
                </span>
                <span className="text-sm font-bold text-blue-950 font-mono">
                  {formatMinutes(overallMinutes)}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
            {/* Search input */}
            <div className="relative sm:col-span-6">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search tasks by name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white"
              />
            </div>

            {/* Start Date */}
            <div className="sm:col-span-2.5">
              <div className="relative">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  placeholder="From date"
                  className="bg-white text-xs"
                />
              </div>
            </div>

            {/* End Date */}
            <div className="sm:col-span-2.5">
              <div className="relative">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  placeholder="To date"
                  className="bg-white text-xs"
                />
              </div>
            </div>

            {/* Reset Filter Button */}
            {(searchQuery || startDate || endDate) && (
              <div className="sm:col-span-1 flex items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearFilters}
                  title="Clear all filters"
                  className="h-10 w-10 text-slate-500 hover:text-slate-900"
                >
                  <FilterX className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Grouped Logs List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-28 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : groupedTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="rounded-full bg-slate-100 p-3 text-slate-400">
            <Inbox className="h-8 w-8" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-slate-900">No Task Logs Found</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            {searchQuery || startDate || endDate
              ? 'No task entries matched the current search query and date range filters.'
              : 'You have not recorded any tasks yet. Use the form above to add your first task log.'}
          </p>
          {(searchQuery || startDate || endDate) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearFilters}
              className="mt-4 text-xs"
            >
              Reset Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedTasks.map((group) => (
            <div
              key={group.date}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
            >
              {/* Group Header (Date & Daily Total) */}
              <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 sm:px-6">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-blue-600" />
                  <span className="font-bold text-slate-900 text-sm sm:text-base">
                    {group.formattedDate}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">({group.date})</span>
                </div>
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="text-xs text-slate-500">Daily Total:</span>
                  <Badge variant="time" className="text-xs">
                    {formatMinutes(group.totalMinutes)}
                  </Badge>
                </div>
              </div>

              {/* Group Tasks Table / Card List */}
              <div className="divide-y divide-slate-100">
                {group.tasks.map((task) => {
                  const canManage =
                    user?.id === task.user_id || user?.role === 'admin'

                  return (
                    <div
                      key={task.id}
                      className="flex flex-col gap-2 p-4 transition-colors hover:bg-slate-50/60 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-3.5"
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 text-sm">
                            {task.task_name}
                          </span>
                          {showUserInfo && task.profiles && (
                            <Badge variant="outline" className="text-[10px] text-slate-600">
                              {task.profiles.name}
                            </Badge>
                          )}
                        </div>
                        {task.task_description && (
                          <p className="text-xs text-slate-500 line-clamp-2">
                            {task.task_description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0">
                        {/* Time Spent */}
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-mono text-sm font-semibold text-slate-800">
                            {formatMinutes(task.duration_minutes)}
                          </span>
                        </div>

                        {/* Actions (Edit / Delete) */}
                        {canManage && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-blue-600"
                              onClick={() => setEditingTask(task)}
                              title="Edit task log"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-rose-600"
                              onClick={() => setDeletingTask(task)}
                              title="Delete task log"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Task Modal */}
      <EditTaskModal
        task={editingTask}
        open={Boolean(editingTask)}
        onOpenChange={(open) => {
          if (!open) setEditingTask(null)
        }}
        onTaskUpdated={onTaskChange}
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
