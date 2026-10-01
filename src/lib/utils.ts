import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMinutes(totalMinutes: number): string {
  if (isNaN(totalMinutes) || totalMinutes < 0) return '0m'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) {
    return `${minutes}m`
  }
  if (minutes === 0) {
    return `${hours}h 00m`
  }
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`
}

export function parseHoursAndMinutes(hours: number, minutes: number): number {
  const safeHours = Math.max(0, Number(hours) || 0)
  const safeMinutes = Math.max(0, Number(minutes) || 0)
  return safeHours * 60 + safeMinutes
}

export function getTodayDateString(): string {
  // Return YYYY-MM-DD in local time
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
