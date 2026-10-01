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

export function formatDateDDMMYYYY(isoDate: string): string {
  // YYYY-MM-DD -> dd/mm/yyyy
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  return `${day}/${month}/${year}`
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Monday of the current week, as YYYY-MM-DD in local time
export function getWeekStartDateString(): string {
  const now = new Date()
  const daysSinceMonday = (now.getDay() + 6) % 7
  now.setDate(now.getDate() - daysSinceMonday)
  return toLocalDateString(now)
}

// First day of the current month, as YYYY-MM-DD in local time
export function getMonthStartDateString(): string {
  const now = new Date()
  return toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1))
}

// Whole days from one YYYY-MM-DD date to another (inclusive of the start day)
export function daysActiveSince(startIsoDate: string, endIsoDate: string): number {
  const start = new Date(`${startIsoDate}T00:00:00`)
  const end = new Date(`${endIsoDate}T00:00:00`)
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
}
