import React from 'react'
import { useAuth } from '@/context/AuthContext'
import { UserRole } from '@/types'
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  UserCheck,
  Shield,
  Layers,
  User,
  LogOut,
  X,
  FileSpreadsheet,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  currentTab: string
  onTabChange: (tab: string) => void
  isMobileOpen: boolean
  onMobileClose: () => void
}

interface NavItem {
  id: string
  label: string
  icon: React.ElementType
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  isMobileOpen,
  onMobileClose,
}) => {
  const { user, signOut } = useAuth()

  if (!user) return null

  const getNavItems = (role: UserRole): NavItem[] => {
    switch (role) {
      case 'employee':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'my-tasks', label: 'My Task Logs', icon: ClipboardList },
          { id: 'profile', label: 'Profile', icon: User },
        ]
      case 'team_leader':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'my-tasks', label: 'My Tasks', icon: ClipboardList },
          { id: 'my-team', label: 'My Team', icon: Users },
          { id: 'team-logs', label: 'Team Task Logs', icon: FileSpreadsheet },
          { id: 'profile', label: 'Profile', icon: User },
        ]
      case 'admin':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'all-tasks', label: 'All Task Logs', icon: ClipboardList },
          { id: 'employees', label: 'Employees', icon: Users },
          { id: 'team-leaders', label: 'Team Leaders', icon: UserCheck },
          { id: 'user-management', label: 'User Management', icon: Shield },
          { id: 'team-assignments', label: 'Team Assignments', icon: Layers },
          { id: 'profile', label: 'Profile', icon: User },
        ]
      default:
        return []
    }
  }

  const navItems = getNavItems(user.role)

  const handleItemClick = (id: string) => {
    onTabChange(id)
    onMobileClose()
  }

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-in-out md:static md:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile Header with close button */}
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-6 md:hidden">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <img src="/zeroado-logo.png" alt="Zeroado" className="h-6 w-auto" />
          </div>
          <button
            onClick={onMobileClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = currentTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 transition-colors',
                    isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                  )}
                />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Bottom Sign Out */}
        <div className="border-t border-slate-200 p-3">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut className="h-4 w-4 text-slate-400" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  )
}
