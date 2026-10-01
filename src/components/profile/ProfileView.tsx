import React from 'react'
import { useAuth } from '@/context/AuthContext'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SpotlightCard } from '@/components/react-bits/SpotlightCard'
import { ShieldCheck, Mail, Calendar, Key, UserCheck, Briefcase, LogOut } from 'lucide-react'

export const ProfileView: React.FC = () => {
  const { user, signOut, approvedDomain } = useAuth()

  if (!user) return null

  return (
    <div className="max-w-3xl space-y-6">
      <SpotlightCard className="border border-slate-200 bg-white">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <Avatar className="h-20 w-20 ring-4 ring-blue-500/10 shadow-md">
              <AvatarImage src={user.avatar_url} alt={user.name} />
              <AvatarFallback className="text-2xl font-bold bg-blue-100 text-blue-700">
                {user.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{user.name}</h2>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                <span>{user.email}</span>
              </div>
              <div className="pt-1 flex items-center gap-2">
                {user.role === 'admin' && <Badge variant="admin">Company Administrator</Badge>}
                {user.role === 'team_leader' && <Badge variant="leader">Team Leader</Badge>}
                {user.role === 'employee' && <Badge variant="employee">Employee</Badge>}
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={signOut}
            className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs sm:self-start"
          >
            <LogOut className="h-3.5 w-3.5 mr-1.5" />
            <span>Sign Out</span>
          </Button>
        </div>
      </SpotlightCard>

      <Card className="border border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-bold">Authentication & Account Details</CardTitle>
          <CardDescription className="text-xs">
            Profile metadata synchronized from Google OAuth 2.0
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-1">
              <span className="text-slate-400 text-[11px] block">Corporate Domain</span>
              <span className="font-semibold text-slate-800 font-mono">{approvedDomain}</span>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-1">
              <span className="text-slate-400 text-[11px] block">System Role</span>
              <span className="font-semibold text-slate-800 capitalize">{user.role.replace('_', ' ')}</span>
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs text-blue-900 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              <span>Row Level Security (RLS) Active</span>
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              All queries and task log operations are validated at the PostgreSQL database level. Unauthorized queries are automatically blocked by Supabase RLS security policies.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
