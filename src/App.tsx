import React, { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { LoginPage } from '@/components/auth/LoginPage'
import { Navbar } from '@/components/common/Navbar'
import { Sidebar } from '@/components/common/Sidebar'
import { EmployeeDashboard } from '@/components/dashboard/EmployeeDashboard'
import { TeamLeaderDashboard } from '@/components/dashboard/TeamLeaderDashboard'
import { AdminDashboard } from '@/components/dashboard/AdminDashboard'
import { ProfileView } from '@/components/profile/ProfileView'
import { Toaster } from 'sonner'
import { Loader2 } from 'lucide-react'

const MainApp: React.FC = () => {
  const { user, isLoading } = useAuth()
  const [currentTab, setCurrentTab] = useState<string>('dashboard')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Synchronize default tab on role switch
  useEffect(() => {
    if (user) {
      setCurrentTab('dashboard')
    }
  }, [user?.role])

  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-slate-600">Loading ZeroAdo TaskLog...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <LoginPage />
        <Toaster position="top-right" richColors />
      </>
    )
  }

  // Render role-specific content based on active navigation tab
  const renderContent = () => {
    if (currentTab === 'profile') {
      return <ProfileView />
    }

    if (user.role === 'employee') {
      return <EmployeeDashboard />
    }

    if (user.role === 'team_leader') {
      let initialTab = 'overview'
      if (currentTab === 'my-team') initialTab = 'my-team'
      if (currentTab === 'team-logs') initialTab = 'team-logs'
      return <TeamLeaderDashboard key={currentTab} initialTab={initialTab} />
    }

    if (user.role === 'admin') {
      let initialTab = 'all-tasks'
      if (currentTab === 'dashboard') initialTab = 'all-tasks'
      if (currentTab === 'all-tasks') initialTab = 'all-tasks'
      if (currentTab === 'employees' || currentTab === 'team-leaders' || currentTab === 'user-management') {
        initialTab = 'user-management'
      }
      if (currentTab === 'team-assignments') initialTab = 'team-assignments'
      return <AdminDashboard key={currentTab} initialTab={initialTab} />
    }

    return <EmployeeDashboard />
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/60 font-sans text-slate-900 antialiased">
      {/* Top Header Navbar */}
      <Navbar
        onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        currentTab={currentTab}
        onTabChange={setCurrentTab}
      />

      <div className="flex flex-1">
        {/* Role-tailored Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          isMobileOpen={isMobileMenuOpen}
          onMobileClose={() => setIsMobileMenuOpen(false)}
        />

        {/* Main Dashboard Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {renderContent()}
        </main>
      </div>

      <Toaster position="top-right" richColors />
    </div>
  )
}

export function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  )
}

export default App
