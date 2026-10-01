import React, { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { UserRole } from '@/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Database,
  LogOut,
  User as UserIcon,
  Shield,
  Users,
  CheckCircle2,
  Menu,
  Sparkles,
} from 'lucide-react'
import { ShinyText } from '@/components/react-bits/ShinyText'

interface NavbarProps {
  onMobileMenuToggle?: () => void
  currentTab?: string
  onTabChange?: (tab: string) => void
}

export const Navbar: React.FC<NavbarProps> = ({
  onMobileMenuToggle,
}) => {
  const { user, signOut, isLiveSupabase } = useAuth()
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)

  if (!user) return null

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return <Badge variant="admin">Admin</Badge>
      case 'team_leader':
        return <Badge variant="leader">Team Leader</Badge>
      case 'employee':
      default:
        return <Badge variant="employee">Employee</Badge>
    }
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onMobileMenuToggle}
            aria-label="Toggle navigation menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-2.5">
            <img src="/zeroado-logo.png" alt="Zeroado" className="h-7 w-auto" />
            <div className="hidden flex-col sm:flex">
              <div className="flex items-center gap-2">
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">Enterprise</span>
              </div>
              <span className="text-[11px] text-slate-500">Employee Task Management</span>
            </div>
          </div>
        </div>

        {/* Center / Right Quick Switcher & User Profile */}
        <div className="flex items-center gap-3">
          {/* Database connection status, admins only */}
          {user.role === 'admin' && (
            <div className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50/80 px-2.5 py-1 text-xs sm:flex">
              <Database className="h-3.5 w-3.5 text-blue-600" />
              {isLiveSupabase ? (
                <span className="font-medium text-emerald-600">Supabase Connected</span>
              ) : (
                <span className="font-medium text-rose-600">Supabase Not Connected</span>
              )}
            </div>
          )}


          {/* User Profile Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 rounded-full p-1 sm:rounded-lg sm:px-2 sm:py-1.5 hover:bg-slate-100"
              >
                <Avatar className="h-8 w-8 ring-2 ring-blue-500/20">
                  <AvatarImage src={user.avatar_url} alt={user.name} />
                  <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="hidden text-left sm:block">
                  <p className="text-xs font-semibold leading-none text-slate-800">{user.name}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500 truncate max-w-[120px]">{user.email}</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-semibold leading-none text-slate-900">{user.name}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  <div className="pt-1.5">{getRoleBadge(user.role)}</div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setProfileDialogOpen(true)} className="cursor-pointer">
                <UserIcon className="mr-2 h-4 w-4 text-slate-500" />
                <span>Profile Details</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={signOut}
                className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Profile Details Dialog */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Google Profile Information</DialogTitle>
            <DialogDescription>
              Authenticated profile automatically retrieved via Google OAuth
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <Avatar className="h-20 w-20 ring-4 ring-blue-100">
              <AvatarImage src={user.avatar_url} alt={user.name} />
              <AvatarFallback className="text-xl font-bold">
                {user.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h4 className="text-lg font-bold text-slate-900">{user.name}</h4>
              <p className="text-sm text-slate-500">{user.email}</p>
              <div className="mt-2 flex justify-center">{getRoleBadge(user.role)}</div>
            </div>
            <div className="w-full rounded-lg border border-slate-100 bg-slate-50 p-3 text-left text-xs space-y-1.5 text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-400">Account Type:</span>
                <span className="font-medium text-slate-700">Company Google Workspace</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">User ID:</span>
                <span className="font-mono text-[11px] text-slate-700">{user.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Role Permissions:</span>
                <span className="font-medium capitalize text-slate-700">{user.role.replace('_', ' ')}</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
