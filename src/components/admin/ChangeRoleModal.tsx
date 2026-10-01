import React, { useState, useEffect } from 'react'
import { Profile, UserRole } from '@/types'
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
import { Shield, Users, Check, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface ChangeRoleModalProps {
  userToEdit: Profile | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRoleChanged: () => void
}

export const ChangeRoleModal: React.FC<ChangeRoleModalProps> = ({
  userToEdit,
  open,
  onOpenChange,
  onRoleChanged,
}) => {
  const { user } = useAuth()
  const [selectedRole, setSelectedRole] = useState<UserRole>('employee')
  const [allEmployees, setAllEmployees] = useState<Profile[]>([])
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (userToEdit) {
      setSelectedRole(userToEdit.role)
      setError(null)
    }
  }, [userToEdit])

  useEffect(() => {
    async function loadPossibleEmployees() {
      if (!open || !userToEdit) return
      try {
        const profiles = await dataService.getProfiles()
        const emps = profiles.filter((p) => p.role === 'employee' && p.id !== userToEdit.id)
        setAllEmployees(emps)

        // If user is currently a team leader, fetch their current team
        if (userToEdit.role === 'team_leader') {
          const currentTeam = await dataService.getAssignedEmployeeIdsForLeader(userToEdit.id)
          setSelectedEmployeeIds(currentTeam)
        } else {
          setSelectedEmployeeIds([])
        }
      } catch (err: any) {
        console.error('Failed to load employees for role assignment:', err)
      }
    }

    loadPossibleEmployees()
  }, [userToEdit, open])

  if (!userToEdit || !user) return null

  const handleToggleEmployee = (id: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      // 1. Update role
      await dataService.updateUserRole(userToEdit.id, selectedRole, user.role)

      // 2. If changing to team_leader, also save assigned employees
      if (selectedRole === 'team_leader') {
        await dataService.assignEmployeesToLeader(
          userToEdit.id,
          selectedEmployeeIds,
          user.id,
          user.role
        )
      }

      toast.success(`Role updated for ${userToEdit.name}`, {
        description: `User is now assigned the role of ${selectedRole.replace('_', ' ')}`,
      })
      onOpenChange(false)
      onRoleChanged()
    } catch (err: any) {
      setError(err.message || 'Failed to update role')
      toast.error('Role update failed', { description: err.message })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2 text-blue-600">
            <Shield className="h-5 w-5" />
            <DialogTitle>Change User Role</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Modify security role and access permissions for this user
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* User Card */}
        <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={userToEdit.avatar_url} />
            <AvatarFallback>{userToEdit.name.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">{userToEdit.name}</h4>
            <p className="text-xs text-slate-500">{userToEdit.email}</p>
          </div>
        </div>

        {/* Role Selection */}
        <div className="space-y-2 py-2">
          <label className="text-xs font-semibold text-slate-700">Select Role</label>
          <div className="grid grid-cols-3 gap-2">
            {(['employee', 'team_leader', 'admin'] as UserRole[]).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setSelectedRole(role)}
                className={`p-3 rounded-lg border text-center transition-all cursor-pointer ${
                  selectedRole === role
                    ? 'border-blue-600 bg-blue-50/70 text-blue-800 font-semibold ring-1 ring-blue-600'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs capitalize font-medium">{role.replace('_', ' ')}</div>
              </button>
            ))}
          </div>
        </div>

        {/* When Team Leader is selected, allow assigning employees */}
        {selectedRole === 'team_leader' && (
          <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Assigned Employees ({selectedEmployeeIds.length})
              </label>
              <span className="text-[10px] text-slate-500">Optional initial team</span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-48 space-y-1.5 pr-1 border border-slate-200 rounded-lg p-2">
              {allEmployees.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No employees available</p>
              ) : (
                allEmployees.map((emp) => {
                  const isChecked = selectedEmployeeIds.includes(emp.id)
                  return (
                    <div
                      key={emp.id}
                      onClick={() => handleToggleEmployee(emp.id)}
                      className={`flex items-center justify-between p-2 rounded border cursor-pointer text-xs ${
                        isChecked
                          ? 'border-blue-300 bg-blue-50/60 font-medium'
                          : 'border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            isChecked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'
                          }`}
                        >
                          {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                        </div>
                        <span>{emp.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">{emp.email}</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

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
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving ? 'Saving...' : 'Save Role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
