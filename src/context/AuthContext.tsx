import React, { createContext, useContext, useEffect, useState } from 'react'
import { Profile } from '@/types'
import { supabase, isSupabaseConfigured, validateCompanyEmail, APPROVED_DOMAIN } from '@/lib/supabase'
import { dataService } from '@/services/dataService'

interface AuthContextType {
  user: Profile | null
  isLoading: boolean
  isLiveSupabase: boolean
  approvedDomain: string
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  uploadAvatar: (file: File) => Promise<void>
  resetToGoogleAvatar: () => Promise<void>
}

const AVATAR_BUCKET = 'avatars'
const MAX_AVATAR_BYTES = 2 * 1024 * 1024

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const CURRENT_USER_STORAGE_KEY = 'tasklog_current_user_v2'

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const isLiveSupabase = isSupabaseConfigured()

  useEffect(() => {
    async function initAuth() {
      setIsLoading(true)
      try {
        if (isLiveSupabase) {
          // Listen to live Supabase Auth session
          const { data: { session } } = await supabase.auth.getSession()

          if (session?.user) {
            const userEmail = session.user.email || ''
            const validation = validateCompanyEmail(userEmail)

            if (!validation.isValid) {
              await supabase.auth.signOut()
              setUser(null)
              setIsLoading(false)
              return
            }

            // Sync or fetch profile from public.profiles
            const { data: profileData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single()

            if (profileData) {
              setUser(profileData as Profile)
            } else {
              // Check if this is the first user in the database -> make admin
              const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
              const initialRole = count === 0 ? 'admin' : 'employee'

              const newProf: Profile = {
                id: session.user.id,
                name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || userEmail.split('@')[0],
                email: userEmail,
                avatar_url: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || '',
                role: initialRole,
                created_at: new Date().toISOString(),
              }
              // Save to public.profiles
              await supabase.from('profiles').upsert(newProf)
              setUser(newProf)
            }
          } else {
            setUser(null)
          }

          // Subscribe to auth state changes
          const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
            if (newSession?.user) {
              const email = newSession.user.email || ''
              const check = validateCompanyEmail(email)
              if (!check.isValid) {
                await supabase.auth.signOut()
                setUser(null)
                return
              }
              const { data: prof } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', newSession.user.id)
                .single()

              if (prof) setUser(prof as Profile)
            } else {
              setUser(null)
            }
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
              setUser(matched || parsed)
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

  // Google OAuth Login
  const signInWithGoogle = async () => {
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
