import React, { useState, useEffect } from 'react'
import { TaskLog } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { dataService } from '@/services/dataService'
import { formatMinutes, getTodayDateString, parseHoursAndMinutes } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Clock, Calendar, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface EditTaskModalProps {
  task: TaskLog | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onTaskUpdated: () => void
}

export const EditTaskModal: React.FC<EditTaskModalProps> = ({
  task,
  open,
  onOpenChange,
  onTaskUpdated,
}) => {
  const { user } = useAuth()
  const today = getTodayDateString()

  const [taskName, setTaskName] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [hours, setHours] = useState<number | string>(0)
  const [minutes, setMinutes] = useState<number | string>(0)
  const [workDate, setWorkDate] = useState<string>(today)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (task) {
      setTaskName(task.task_name)
      setTaskDescription(task.task_description || '')
      setHours(Math.floor(task.duration_minutes / 60))
      setMinutes(task.duration_minutes % 60)
      setWorkDate(task.work_date)
      setError(null)
    }
  }, [task])

  if (!task || !user) return null

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!taskName.trim()) {
      setError('Task Name cannot be empty.')
      return
    }

    const totalMinutes = parseHoursAndMinutes(Number(hours), Number(minutes))
    if (totalMinutes <= 0) {
      setError('Time spent must be greater than 0 minutes.')
      return
    }

    if (workDate > today) {
      setError('Future dates are prohibited. Select today or a previous date.')
      return
    }

    setIsSubmitting(true)
    try {
      await dataService.updateTaskLog(
        task.id,
        {
          task_name: taskName,
          task_description: taskDescription,
          duration_minutes: totalMinutes,
          work_date: workDate,
        },
        user.id,
        user.role
      )

      toast.success('Task updated successfully!')
      onOpenChange(false)
      onTaskUpdated()
    } catch (err: any) {
      setError(err.message || 'Failed to update task')
      toast.error('Update failed', { description: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Task Log</DialogTitle>
          <DialogDescription>
            Update details for this task. Future dates cannot be selected.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 py-2">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Task Name</label>
            <Input
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="Task name"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Task Description</label>
            <Textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Clock className="h-3.5 w-3.5 text-blue-600" />
                Time Spent
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="24"
                    value={hours}
                    onChange={(e) => setHours(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                    className="pr-8"
                  />
                  <span className="absolute right-2 top-2.5 text-xs text-slate-400">h</span>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    step="5"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value === '' ? '' : Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="pr-8"
                  />
                  <span className="absolute right-2 top-2.5 text-xs text-slate-400">m</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Calendar className="h-3.5 w-3.5 text-blue-600" />
                Work Date
              </label>
              <Input
                type="date"
                max={today}
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                required
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
