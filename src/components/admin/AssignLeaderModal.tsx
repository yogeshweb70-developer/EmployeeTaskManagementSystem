import React, { useState, useEffect } from 'react'
import { Profile } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { dataService } from '@/services/dataService'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Users, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface AssignLeaderModalProps {
  employee: Profile | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export const AssignLeaderModal: React.FC<AssignLeaderModalProps> = ({
  employee,
  open,
  onOpenChange,
  onSaved,
}) => {
  const { user } = useAuth()
  const [leaders, setLeaders] = useState<Profile[]>([])
  const [selectedLeaderId, setSelectedLeaderId] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadLeaders() {
      if (!open || !employee) return
      try {
        const profiles = await dataService.getProfiles()
        const teamLeaders = profiles.filter((p) => p.role === 'team_leader')
        setLeaders(teamLeaders)
        setSelectedLeaderId(employee.assigned_leader?.id || '')
        setError(null)
      } catch (err: any) {
        setError('Failed to load team leaders')
      }
    }

    loadLeaders()
  }, [employee, open])

  if (!employee || !user) return null

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      if (!selectedLeaderId) {
        // If unassigned selected, remove from current leader
        if (employee.assigned_leader) {
          await dataService.removeEmployeeFromLeader(
            employee.assigned_leader.id,
            employee.id,
            user.id,
            user.role
          )
        }
      } else {
        // Assign to selected leader
        const currentAssigned = await dataService.getAssignedEmployeeIdsForLeader(selectedLeaderId)
        const updated = Array.from(new Set([...currentAssigned, employee.id]))
        await dataService.assignEmployeesToLeader(
          selectedLeaderId,
          updated,
          user.id,
          user.role
        )
      }

      toast.success('Assignment updated')
      onOpenChange(false)
      onSaved()
    } catch (err: any) {
      setError(err.message || 'Failed to update assignment')
      toast.error('Assignment error', { description: err.message })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-blue-600">
            <Users className="h-5 w-5" />
            <DialogTitle>Assign Team Leader</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Assign <span className="font-semibold text-slate-800">{employee.name}</span> to a designated Team Leader.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4 py-2">
          {/* Employee Details */}
          <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={employee.avatar_url} />
              <AvatarFallback>{employee.name.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold text-slate-800">{employee.name}</p>
              <p className="text-xs text-slate-500">{employee.email}</p>
            </div>
          </div>

          {/* Leader Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Designated Team Leader</label>
            <select
              value={selectedLeaderId}
              onChange={(e) => setSelectedLeaderId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">(None / Unassigned)</option>
              {leaders.map((leader) => (
                <option key={leader.id} value={leader.id}>
                  {leader.name} ({leader.email})
                </option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving ? 'Saving...' : 'Save Assignment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
