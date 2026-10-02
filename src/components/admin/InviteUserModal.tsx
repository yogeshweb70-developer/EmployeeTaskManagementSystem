import React, { useEffect, useState } from 'react'
import { UserRole, InviteResult } from '@/types'
import { dataService } from '@/services/dataService'
import { useAuth } from '@/context/AuthContext'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, Copy, Check, MailPlus, Send } from 'lucide-react'
import { toast } from 'sonner'

interface InviteUserModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInvited: () => void
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'employee', label: 'Employee' },
  { value: 'team_leader', label: 'Team Leader' },
  { value: 'admin', label: 'Admin' },
]

export const InviteUserModal: React.FC<InviteUserModalProps> = ({ open, onOpenChange, onInvited }) => {
  const { approvedDomain } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('employee')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<InviteResult | null>(null)
  const [hasCopied, setHasCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    setEmail('')
    setRole('employee')
    setError(null)
    setResult(null)
    setHasCopied(false)
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSending(true)
    setError(null)
    try {
      const invite = await dataService.inviteUser(name, email, role)
      setResult(invite)

      if (invite.emailed) {
        toast.success(`Invitation sent to ${invite.email}`, {
          description: 'They appear as Pending Invite until they sign in with Google.',
        })
      } else {
        toast.warning(`Invitation created for ${invite.email}`, {
          description: 'The email could not be sent. Copy the link below and share it yourself.',
        })
      }

      // The invitee already exists as a pending record, so refresh the table now
      onInvited()
    } catch (err: any) {
      setError(err.message || 'The invitation could not be sent.')
    } finally {
      setIsSending(false)
    }
  }

  const handleCopyLink = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.invite_link)
      setHasCopied(true)
      toast.success('Invitation link copied')
      setTimeout(() => setHasCopied(false), 2000)
    } catch {
      toast.error('Could not copy the link. Select it and copy manually.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-blue-600">
            <MailPlus className="h-5 w-5" />
            <DialogTitle>Invite a User</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Nobody can sign up on their own. Send an invitation and the person is recorded as a{' '}
            <strong>Pending Invite</strong> until they accept it with Google.
          </DialogDescription>
        </DialogHeader>

        {/* Invitation was created: show what happened and the link to share */}
        {result ? (
          <div className="space-y-3 py-1">
            <div
              className={`flex items-start gap-2.5 rounded-lg border p-3 text-xs ${
                result.emailed
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {result.emailed ? (
                <Send className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              )}
              <div className="space-y-1 leading-relaxed">
                <p className="font-semibold">
                  {result.emailed
                    ? `Invitation emailed to ${result.email}`
                    : `Invitation created for ${result.email}`}
                </p>
                <p>
                  {result.emailed
                    ? 'They stay in Pending Invite until they complete Google sign-in.'
                    : result.email_error || 'The email could not be delivered. Share the link below instead.'}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Invitation link</label>
              <div className="flex items-center gap-2">
                <Input readOnly value={result.invite_link} className="text-[11px] font-mono" />
                <Button type="button" variant="outline" onClick={handleCopyLink} className="h-10 shrink-0 px-3">
                  {hasCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-slate-400">
                This link is shown once. If it is lost, use Resend on the user row to issue a new one.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setResult(null)
                  setName('')
                  setEmail('')
                  setRole('employee')
                }}
              >
                Invite Another
              </Button>
              <Button
                type="button"
                onClick={() => onOpenChange(false)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-1">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="invite-name" className="text-xs font-semibold text-slate-700">
                Full name <span className="text-rose-500">*</span>
              </label>
              <Input
                id="invite-name"
                placeholder="Asha Rao"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="invite-email" className="text-xs font-semibold text-slate-700">
                Work email <span className="text-rose-500">*</span>
              </label>
              <Input
                id="invite-email"
                type="email"
                placeholder={`asha${approvedDomain}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="text-sm font-mono"
              />
              <span className="block text-[10px] text-slate-400">
                Must be a {approvedDomain} address. The invitation only works for this exact Google account.
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700">Role on joining</label>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRole(option.value)}
                    aria-pressed={role === option.value}
                    className={`cursor-pointer rounded-lg border p-2.5 text-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      role === option.value
                        ? 'border-[#061237] bg-[#061237] font-semibold text-white'
                        : 'border-slate-200 bg-white text-[#061237] hover:border-[#061237] hover:bg-[#061237] hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSending} className="bg-blue-600 hover:bg-blue-700 text-white">
                {isSending ? 'Sending…' : 'Send Invitation'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
