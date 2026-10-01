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
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@radix-ui/react-checkbox'
import { Check, Users, AlertCircle, Info } from 'lucide-react'
import { toast } from 'sonner'

interface TeamAssignmentModalProps {
  leader: Profile
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export const TeamAssignmentModal: React.FC<TeamAssignmentModalProps> = ({
  leader,
  open,
  onOpenChange,
  onSaved,
}) => {
  const { user } = useAuth()
  const [allEmployees, setAllEmployees] = useState<Profile[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [initialSelectedIds, setInitialSelectedIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    async function loadTeamData() {
      if (!open) return
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const [profiles, assignedIds] = await Promise.all([
          dataService.getProfiles(),
          dataService.getAssignedEmployeeIdsForLeader(leader.id),
        ])
        // Filter out non-employees (only employees can be assigned to a team leader)
        const employeesOnly = profiles.filter((p) => p.role === 'employee' && p.id !== leader.id)
        setAllEmployees(employeesOnly)
        setSelectedIds(assignedIds)
        setInitialSelectedIds(assignedIds)
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load team members')
      } finally {
        setIsLoading(false)
      }
    }

    loadTeamData()
  }, [leader.id, open])

  const handleToggleEmployee = (empId: string) => {
    setSelectedIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    )
  }

  const handleSave = async () => {
    if (!user) return
    setIsSaving(true)
    setErrorMessage(null)
    try {
      await dataService.assignEmployeesToLeader(
        leader.id,
        selectedIds,
        user.id,
        user.role
      )
      toast.success('Team roster updated successfully', {
        description: `${selectedIds.length} employee(s) assigned to ${leader.name}`,
      })
      onOpenChange(false)
      onSaved()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update team assignments')
      toast.error('Could not update assignments', { description: err.message })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-2 text-blue-600">
            <Users className="h-5 w-5" />
            <DialogTitle>Manage Assigned Employees</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Assign or remove employees for <span className="font-semibold text-slate-800">{leader.name}</span>.
            Note: An employee can be assigned to multiple Team Leaders.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex items-center gap-2 rounded-lg bg-blue-50/60 border border-blue-100 p-2.5 text-xs text-blue-800">
          <Info className="h-4 w-4 shrink-0 text-blue-600" />
          <span>
            Selected employees: <strong>{selectedIds.length}</strong> assigned to {leader.name}
          </span>
        </div>

        {/* Employee Checkbox List */}
        <div className="flex-1 overflow-y-auto space-y-1.5 py-2 pr-1">
          {isLoading ? (
            <div className="space-y-2 py-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 rounded-lg bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : allEmployees.length === 0 ? (
            <p className="text-center text-xs text-slate-500 py-6">
              No employees available to assign.
            </p>
          ) : (
            allEmployees.map((emp) => {
              const isChecked = selectedIds.includes(emp.id)
              const isAssignedToOther =
                emp.assigned_leader &&
                emp.assigned_leader.id !== leader.id &&
                !initialSelectedIds.includes(emp.id)

              return (
                <div
                  key={emp.id}
                  onClick={() => handleToggleEmployee(emp.id)}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                    isChecked
                      ? 'border-blue-300 bg-blue-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                        isChecked
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isChecked && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    </div>

                    <Avatar className="h-8 w-8">
                      <AvatarImage src={emp.avatar_url} alt={emp.name} />
                      <AvatarFallback className="text-xs">
                        {emp.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div>
                      <p className="text-sm font-semibold text-slate-800 leading-tight">
                        {emp.name}
                      </p>
                      <p className="text-xs text-slate-500">{emp.email}</p>
                    </div>
                  </div>

                  {isAssignedToOther && (
                    <Badge variant="outline" className="text-[10px] text-slate-600 border-slate-200 bg-slate-50">
                      Also with {emp.assigned_leader?.name}
                    </Badge>
                  )}
                </div>
              )
            })
          )}
        </div>

        <DialogFooter className="pt-3 border-t border-slate-100">
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
            disabled={isSaving || isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
          >
            {isSaving ? 'Saving Team...' : 'Save Team'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
