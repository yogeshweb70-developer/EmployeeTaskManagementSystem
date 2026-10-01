import { createClient, SupabaseClient } from '@supabase/supabase-js'

const envUrl = import.meta.env.VITE_SUPABASE_URL || ''
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Also check localStorage for saved credentials entered in browser
const storedUrl = typeof window !== 'undefined' ? localStorage.getItem('supabase_project_url') || '' : ''
const storedAnonKey = typeof window !== 'undefined' ? localStorage.getItem('supabase_anon_key') || '' : ''

const activeUrl = envUrl.trim() || storedUrl.trim()
const activeAnonKey = envAnonKey.trim() || storedAnonKey.trim()

export const isSupabaseConfigured = (): boolean => {
  return (
    Boolean(activeUrl) &&
    Boolean(activeAnonKey) &&
    activeUrl.startsWith('http') &&
    !activeUrl.includes('placeholder') &&
    !activeAnonKey.includes('placeholder')
  )
}

// Supabase client instance
export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured() ? activeUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured() ? activeAnonKey : 'placeholder'
)

// Helper to save credentials at runtime
export function saveSupabaseCredentials(url: string, anonKey: string): void {
  localStorage.setItem('supabase_project_url', url.trim())
  localStorage.setItem('supabase_anon_key', anonKey.trim())
  window.location.reload()
}

// Approved company email domain
export const APPROVED_DOMAIN = import.meta.env.VITE_APPROVED_COMPANY_DOMAIN || '@zeroado.com'

export function validateCompanyEmail(email: string): { isValid: boolean; message?: string } {
  if (!email || !email.includes('@')) {
    return { isValid: false, message: 'Please enter a valid email address.' }
  }

  const cleanDomain = APPROVED_DOMAIN.startsWith('@') ? APPROVED_DOMAIN.toLowerCase() : `@${APPROVED_DOMAIN.toLowerCase()}`

  if (!email.toLowerCase().endsWith(cleanDomain)) {
    return {
      isValid: false,
      message: `Access Restricted: Only employees with approved ${cleanDomain} company email accounts can log in. Personal Google accounts or outside email domains are prohibited.`,
    }
  }

  return { isValid: true }
}
