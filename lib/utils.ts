import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get current date as YYYY-MM-DD in Philippine local time (Asia/Manila, UTC+8).
 * Avoids the UTC-offset bug where toISOString() returns yesterday after midnight PHT.
 */
export function toLocalDateISO(date?: Date): string {
  const d = date || new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
