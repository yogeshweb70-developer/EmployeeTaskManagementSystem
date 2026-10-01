import React, { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { dataService } from '@/services/dataService'
import { getTodayDateString, parseHoursAndMinutes } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { PlusCircle, Clock, Calendar, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import confetti from 'canvas-confetti'

interface TaskEntryFormProps {
  onTaskAdded?: () => void
}

export const TaskEntryForm: React.FC<TaskEntryFormProps> = ({ onTaskAdded }) => {
  const { user } = useAuth()
  const today = getTodayDateString()

  const [taskName, setTaskName] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [hours, setHours] = useState<number | string>(2)
  const [minutes, setMinutes] = useState<number | string>(30)
  const [workDate, setWorkDate] = useState<string>(today)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  if (!user) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    // Form validations
    if (!taskName.trim()) {
      setValidationError('Task Name is required and cannot be empty.')
      return
    }

    const totalMinutes = parseHoursAndMinutes(Number(hours), Number(minutes))
    if (totalMinutes <= 0) {
      setValidationError('Time spent must be greater than 0 minutes.')
      return
    }

    if (workDate !== today) {
      setValidationError('Tasks can only be logged for today.')
      return
    }

    setIsSubmitting(true)
    try {
      await dataService.addTaskLog(
        {
          task_name: taskName,
          task_description: taskDescription,
          duration_minutes: totalMinutes,
          work_date: workDate,
          user_id: user.id,
        },
        user.id,
        user.role
      )

      toast.success('Task log recorded successfully!', {
        description: `${taskName.trim()} (${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m) logged for ${workDate}`,
      })

      // Celebration effect for healthy productive logging
      try {
        confetti({
          particleCount: 25,
          spread: 45,
          origin: { y: 0.8 },
        })
      } catch {
        // ignore if confetti fails
      }

      // Reset form
      setTaskName('')
      setTaskDescription('')
      setHours(1)
      setMinutes(0)
      setWorkDate(today)

      if (onTaskAdded) {
        onTaskAdded()
      }
    } catch (err: any) {
      setValidationError(err.message || 'Failed to save task log.')
      toast.error('Could not save task log', { description: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="border border-slate-200 shadow-xs">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <PlusCircle className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Add Task Log</CardTitle>
              <CardDescription className="text-xs">
                Log your work tasks and time spent for today or previous dates
              </CardDescription>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            Default: Today ({today})
          </span>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {validationError && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{validationError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Task Name */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-700">
                Task Name <span className="text-rose-500">*</span>
              </label>
              <Input
                placeholder="e.g., Website Development, Client Meeting, Bug Fixes"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                required
                className="bg-white"
              />
            </div>

            {/* Task Description */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-700">
                Task Description <span className="text-xs font-normal text-slate-400">(optional)</span>
              </label>
              <Textarea
                placeholder="Briefly describe what was accomplished, technical details, or notes..."
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                rows={2}
                className="resize-none bg-white"
              />
            </div>

            {/* Time Spent (Hours & Minutes) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Clock className="h-3.5 w-3.5 text-blue-600" />
                  Time Spent <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] font-mono font-medium text-blue-600">
                  Total: {parseHoursAndMinutes(Number(hours), Number(minutes))}m ({Math.floor(parseHoursAndMinutes(Number(hours), Number(minutes)) / 60)}h {parseHoursAndMinutes(Number(hours), Number(minutes)) % 60}m)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="24"
                      placeholder="Hours"
                      value={hours}
                      onChange={(e) => setHours(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                      className="pr-12 bg-white"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400 select-none">
                      Hours
                    </span>
                  </div>
                </div>
                <div>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      step="5"
                      placeholder="Minutes"
                      value={minutes}
                      onChange={(e) => setMinutes(e.target.value === '' ? '' : Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="pr-14 bg-white"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400 select-none">
                      Minutes
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Work date is locked to today */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Calendar className="h-3.5 w-3.5 text-blue-600" />
                  Work Date <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-slate-500">Today only</span>
              </div>
              <Input
                type="date"
                min={today}
                max={today}
                value={workDate}
                readOnly
                required
                className="bg-slate-50 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              {isSubmitting ? 'Recording...' : 'Add Task Log'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
