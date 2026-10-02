import React, { createContext, useContext, useEffect, useState } from 'react'
import { Profile } from '@/types'
import { supabase, isSupabaseConfigured, validateCompanyEmail, APPROVED_DOMAIN } from '@/lib/supabase'
import { dataService } from '@/services/dataService'

interface AuthContextType {
  user: Profile | null
  isLoading: boolean
  isLiveSupabase: boolean
  approvedDomain: string
  /** Why a signed-in Google account was turned away (deactivated, not invited). */
  accessError: string | null
  clearAccessError: () => void
  signInWithGoogle: (emailHint?: string) => Promise<void>
  signOut: () => Promise<void>
  uploadAvatar: (file: File) => Promise<void>
  resetToGoogleAvatar: () => Promise<void>
}

const DEACTIVATED_MESSAGE =
  'Your access to this workspace has been deactivated by an administrator. Contact your admin if you think this is a mistake.'
const NOT_INVITED_MESSAGE =
  'This workspace is invite only. Your Google account has no invitation, so no access was granted. Ask an administrator to invite you.'

const AVATAR_BUCKET = 'avatars'
const MAX_AVATAR_BYTES = 2 * 1024 * 1024

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const CURRENT_USER_STORAGE_KEY = 'tasklog_current_user_v2'

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [accessError, setAccessError] = useState<string | null>(null)
  const isLiveSupabase = isSupabaseConfigured()

  useEffect(() => {
    // Access is invite only, so a valid Google session is not enough: the
    // profile has to exist (the invitation was accepted) and still be active.
    // Anyone who fails either check is signed out immediately, which is what
    // stops a deactivated user from reusing a session they already had.
    async function resolveSession(sessionUser: { id: string; email?: string } | undefined | null) {
      if (!sessionUser) {
        setUser(null)
        return
      }

      const userEmail = sessionUser.email || ''
      if (!validateCompanyEmail(userEmail).isValid) {
        await supabase.auth.signOut()
        setUser(null)
        return
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sessionUser.id)
        .maybeSingle()

      if (!profileData) {
        // The sign-in gate refused to create a profile: no invitation
        await supabase.auth.signOut()
        setUser(null)
        setAccessError(NOT_INVITED_MESSAGE)
        return
      }

      const profile = profileData as Profile
      if ((profile.status ?? 'active') !== 'active') {
        await supabase.auth.signOut()
        setUser(null)
        setAccessError(DEACTIVATED_MESSAGE)
        return
      }

      setAccessError(null)
      setUser(profile)
    }

    async function initAuth() {
      setIsLoading(true)
      try {
        if (isLiveSupabase) {
          // Listen to live Supabase Auth session
          const { data: { session } } = await supabase.auth.getSession()
          await resolveSession(session?.user)

          // Subscribe to auth state changes
          const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
            await resolveSession(newSession?.user)
          })

          return () => {
            authListener.subscription.unsubscribe()
          }
        } else {
          // If not connected to Supabase yet, check if there's a stored session
          const saved = localStorage.getItem(CURRENT_USER_STORAGE_KEY)
          if (saved) {
            try {
              const parsed = JSON.parse(saved)
              const profiles = await dataService.getProfiles()
              const matched = profiles.find((p) => p.id === parsed.id)
              const resolved = (matched || parsed) as Profile
              if ((resolved.status ?? 'active') !== 'active') {
                localStorage.removeItem(CURRENT_USER_STORAGE_KEY)
                setUser(null)
                setAccessError(DEACTIVATED_MESSAGE)
              } else {
                setUser(resolved)
              }
            } catch {
              setUser(null)
            }
          } else {
            setUser(null)
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err)
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()
  }, [isLiveSupabase])

  // Google OAuth Login. `emailHint` comes from an invitation link, so Google
  // pre-selects the address the invitation was actually sent to.
  const signInWithGoogle = async (emailHint?: string) => {
    if (!isLiveSupabase) {
      throw new Error('Supabase project credentials not configured yet. Please enter your Supabase URL and Anon Key.')
    }

    const redirectUrl = `${window.location.origin}/`
    const cleanDomain = APPROVED_DOMAIN.replace('@', '')

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        scopes: 'openid email profile',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
          hd: cleanDomain, // Request Google to show only @zeroado.com accounts
          ...(emailHint ? { login_hint: emailHint } : {}),
        },
      },
    })

    if (error) throw error
  }

  const signOut = async () => {
    if (isLiveSupabase) {
      await supabase.auth.signOut()
    }
    localStorage.removeItem(CURRENT_USER_STORAGE_KEY)
    setUser(null)
    setAccessError(null)
  }

  // Save a new avatar URL on the profile and in local state
  const saveAvatarUrl = async (avatarUrl: string) => {
    if (!user) return
    if (isLiveSupabase) {
      const { error } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id)
      if (error) throw error
    }
    const updated = { ...user, avatar_url: avatarUrl }
    setUser(updated)
    if (!isLiveSupabase) {
      localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(updated))
    }
  }

  const uploadAvatar = async (file: File) => {
    if (!user) return
    if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (JPG, PNG or WebP).')
    if (file.size > MAX_AVATAR_BYTES) throw new Error('Image must be 2 MB or smaller.')

    if (!isLiveSupabase) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Could not read the image file.'))
        reader.readAsDataURL(file)
      })
      await saveAvatarUrl(dataUrl)
      return
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: true })
    if (uploadError) throw uploadError

    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
    await saveAvatarUrl(data.publicUrl)
  }

  // Switch back to the photo Google provides (empty string shows initials if Google has none)
  const resetToGoogleAvatar = async () => {
    let googleUrl = ''
    if (isLiveSupabase) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      googleUrl = authUser?.user_metadata?.avatar_url || authUser?.user_metadata?.picture || ''
    }
    await saveAvatarUrl(googleUrl)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isLiveSupabase,
        approvedDomain: APPROVED_DOMAIN,
        accessError,
        clearAccessError: () => setAccessError(null),
        signInWithGoogle,
        signOut,
        uploadAvatar,
        resetToGoogleAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
