import React, { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { isSupabaseConfigured, saveSupabaseCredentials } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { AnimatedGrid } from '@/components/react-bits/AnimatedGrid'
import {
  ShieldCheck,
  AlertCircle,
  Lock,
  Database,
  ExternalLink,
  KeyRound,
} from 'lucide-react'
import { toast } from 'sonner'

export const LoginPage: React.FC = () => {
  const { signInWithGoogle, approvedDomain, isLiveSupabase } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  // Show OAuth errors Supabase returns in the redirect URL (?error_description=... or #error_description=...)
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search || window.location.hash.slice(1))
    const oauthError = params.get('error_description') || params.get('error')
    return oauthError ? decodeURIComponent(oauthError.replace(/\+/g, ' ')) : null
  })

  // Supabase credentials modal (for connecting if not already in .env)
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  const [inputUrl, setInputUrl] = useState('')
  const [inputKey, setInputKey] = useState('')

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      if (!isSupabaseConfigured()) {
        setIsConnectModalOpen(true)
        setIsLoading(false)
        return
      }
      await signInWithGoogle()
    } catch (err: any) {
      setErrorMessage(err.message || 'Google authentication failed')
      toast.error('Authentication Error', { description: err.message })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputUrl.trim() || !inputKey.trim()) {
      toast.error('Both Project URL and Anon Key are required')
      return
    }
    if (!inputUrl.startsWith('http')) {
      toast.error('Project URL must start with https://')
      return
    }

    saveSupabaseCredentials(inputUrl, inputKey)
    toast.success('Supabase connected successfully!')
    setIsConnectModalOpen(false)
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center p-4 overflow-hidden bg-slate-50/50">
      <AnimatedGrid />

      <div className="w-full max-w-md space-y-6">
        {/* Brand / Logo Header */}
        <div className="text-center space-y-2">
          <h1 className="flex justify-center">
            <img src="/zeroado-logo.png" alt="Zeroado" className="h-10 w-auto sm:h-12" />
          </h1>
          <p className="text-xs text-slate-500">
            Zeroado Employee Task & Time Log Portal
          </p>
        </div>

        {/* Main Login Card */}
        <Card className="border border-slate-200/90 bg-white shadow-xl shadow-slate-200/50">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-lg font-bold text-slate-900">Sign in to your account</CardTitle>
            <CardDescription className="text-xs">
              Access is restricted strictly to verified{' '}
              <span className="font-semibold text-blue-600 font-mono">{approvedDomain}</span> accounts.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {errorMessage && (
              <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {/* Dedicated Google OAuth Button */}
            <div className="space-y-3">
              <Button
                variant="google"
                className="w-full h-12 relative flex items-center justify-center gap-3 border-slate-300 text-slate-800 text-sm font-semibold shadow-xs hover:bg-slate-50 active:scale-[0.99] transition-transform"
                onClick={handleGoogleLogin}
                disabled={isLoading}
              >
                {/* Official Google 'G' Logo SVG */}
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </Button>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                <Lock className="h-3 w-3" />
                <span>Single Sign-On powered by Google Workspace & Supabase</span>
              </div>
            </div>

            {/* Supabase connection setup, shown only when not configured */}
            {!isLiveSupabase && (
            <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <Database className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-slate-600">Database Status:</span>
              </div>
                <button
                  type="button"
                  onClick={() => setIsConnectModalOpen(true)}
                  className="font-medium text-blue-600 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <KeyRound className="h-3 w-3" /> Connect Supabase
                </button>
            </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-0">
            {/* Domain Enforcement Notice */}
            <div className="w-full rounded-lg bg-slate-50 border border-slate-200/70 p-3 text-slate-600 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-[11px]">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                <span>Domain Policy: {approvedDomain}</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Only email addresses belonging to <strong className="text-slate-800">{approvedDomain}</strong> are authorized to access this portal. Personal Google accounts or outside email domains will be rejected automatically.
              </p>
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* Connect Supabase Dialog */}
      <Dialog open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-blue-600">
              <Database className="h-5 w-5" />
              <DialogTitle>Connect Supabase Project</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              Enter your Supabase project credentials to connect with your database and Google OAuth provider.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveCredentials} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Supabase Project URL <span className="text-rose-500">*</span>
              </label>
              <Input
                placeholder="https://your-project-id.supabase.co"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                required
                className="text-xs font-mono"
              />
              <span className="text-[10px] text-slate-400 block">
                Found in: Supabase Dashboard &gt; Project Settings &gt; API &gt; Project URL
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Supabase Anon (Public) Key <span className="text-rose-500">*</span>
              </label>
              <Input
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                required
                className="text-xs font-mono"
              />
              <span className="text-[10px] text-slate-400 block">
                Found in: Supabase Dashboard &gt; Project Settings &gt; API &gt; Project API keys (anon public)
              </span>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsConnectModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
                Save &amp; Connect
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
