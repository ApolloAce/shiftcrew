// MySQL-backed attendance service — calls /api/attendance

export type AttendanceRecord = {
  id?: string
  employeeId: string
  employeeName?: string
  date: string
  status: "present" | "absent"
  timeIn?: string
  timeOut?: string
  photoUrl?: string
  latitude?: number
  longitude?: number
  branchId?: string
  branchName?: string
  createdAt?: string
  updatedAt?: string
}

const API = "/api/attendance"

async function apiFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json()
}

// Get today's date in YYYY-MM-DD format
const getTodayDate = (): string => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// Save or update attendance record
export const saveAttendanceRecord = async (
  record: Omit<AttendanceRecord, "id" | "createdAt" | "updatedAt">
): Promise<string> => {
  const data = await apiFetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  })
  return data.id
}

// Get all attendance records for a specific date
export const getAttendanceForDate = async (date: string): Promise<AttendanceRecord[]> => {
  return apiFetch(`${API}?date=${date}`)
}

// Get today's attendance records
export const getTodayAttendance = async (): Promise<AttendanceRecord[]> => {
  return getAttendanceForDate(getTodayDate())
}

// Get attendance records for a specific employee
export const getEmployeeAttendance = async (
  employeeId: string,
  dateRange?: { start: string; end: string }
): Promise<AttendanceRecord[]> => {
  let url = `${API}?employeeId=${employeeId}`
  if (dateRange) {
    url += `&startDate=${dateRange.start}&endDate=${dateRange.end}`
  }
  return apiFetch(url)
}

// Get attendance records for a date range
export const getAttendanceForDateRange = async (startDate: string, endDate: string): Promise<AttendanceRecord[]> => {
  return apiFetch(`${API}?startDate=${startDate}&endDate=${endDate}`)
}

// Delete attendance record
export const deleteAttendanceRecord = async (employeeId: string, date: string): Promise<void> => {
  await apiFetch(`${API}?employeeId=${employeeId}&date=${date}`, { method: "DELETE" })
}

// Get attendance statistics for a date
export const getAttendanceStats = async (date: string): Promise<{
  totalRecords: number
  presentCount: number
  absentCount: number
  attendancePercentage: number
}> => {
  return apiFetch(`${API}?date=${date}&stats=true`)
}
