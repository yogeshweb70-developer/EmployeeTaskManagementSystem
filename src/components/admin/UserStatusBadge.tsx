import React from 'react'
import { ManagedUser } from '@/types'
import { cn } from '@/lib/utils'

// The three states the admin cares about, plus the two dead ends an invitation
// can reach (cancelled / expired) so a row never silently says "Pending Invite"
// for a link that no longer works.
type Appearance = { label: string; dot: string; text: string }

function appearanceFor(user: ManagedUser): Appearance {
  if (user.kind === 'invitation') {
    switch (user.invitationStatus) {
      case 'revoked':
        return { label: 'Invite Cancelled', dot: 'bg-slate-400', text: 'text-slate-500' }
      case 'expired':
        return { label: 'Invite Expired', dot: 'bg-rose-400', text: 'text-rose-600' }
      default:
        return { label: 'Pending Invite', dot: 'bg-amber-500', text: 'text-amber-600' }
    }
  }

  if (user.status === 'deactivated') {
    return { label: 'Deactivated', dot: 'bg-rose-500', text: 'text-rose-600' }
  }
  if (user.status === 'pending') {
    return { label: 'Pending Invite', dot: 'bg-amber-500', text: 'text-amber-600' }
  }
  return { label: 'Active', dot: 'bg-emerald-500', text: 'text-emerald-600' }
}

export const UserStatusBadge: React.FC<{ user: ManagedUser; className?: string }> = ({ user, className }) => {
  const { label, dot, text } = appearanceFor(user)

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium', text, className)}>
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} />
      {label}
    </span>
  )
}

export { appearanceFor as userStatusAppearance }
