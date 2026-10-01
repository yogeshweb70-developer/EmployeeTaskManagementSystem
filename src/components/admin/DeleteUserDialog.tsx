import React, { useState } from 'react'
import { Profile } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { dataService } from '@/services/dataService'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface DeleteUserDialogProps {
  user: Profile | null
  onOpenChange: (open: boolean) => void
  onUserDeleted: () => void
}

export const DeleteUserDialog: React.FC<DeleteUserDialogProps> = ({ user: target, onOpenChange, onUserDeleted }) => {
  const { user } = useAuth()
  const [confirmText, setConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!target || !user) return null

  // Typing the email guards against deleting the wrong person
  const isConfirmed = confirmText.trim().toLowerCase() === target.email.toLowerCase()

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setConfirmText('')
      setError(null)
    }
    onOpenChange(open)
  }

  const handleDelete = async () => {
    if (!isConfirmed) {
      setError('Type the email exactly to confirm.')
      return
    }
    setIsDeleting(true)
    try {
      await dataService.deleteUser(target.id, user.id, user.role)
      toast.success(`${target.name} was deleted`)
      handleOpenChange(false)
      onUserDeleted()
    } catch (err: any) {
      toast.error('Could not delete user', { description: err.message })
      setError(err.message || 'Could not delete user.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog open={Boolean(target)} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
            Delete {target.name}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-slate-600">
              <p>This permanently deletes:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>their login account and profile</li>
                <li>
                  <strong>all of their task logs</strong>
                </li>
                <li>their team assignments</li>
              </ul>
              <p>This cannot be undone. If they sign in with Google again, they will start as a new employee.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Field
          label={
            <span>
              Type <span className="font-mono text-slate-900">{target.email}</span> to confirm
            </span>
          }
          htmlFor="delete-user-confirm"
          error={error}
        >
          <Input
            id="delete-user-confirm"
            value={confirmText}
            onChange={(e) => {
              setConfirmText(e.target.value)
              if (error) setError(null)
            }}
            placeholder={target.email}
            autoComplete="off"
            aria-invalid={!!error}
            aria-describedby={error ? 'delete-user-confirm-error' : undefined}
          />
        </Field>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting || !isConfirmed}
          >
            {isDeleting ? 'Deleting...' : 'Delete user'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
