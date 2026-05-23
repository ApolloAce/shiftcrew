// MySQL-backed schedule service — calls /api/schedules

// Employee details within a branch assignment
export type BranchEmployee = {
  employeeId: string
  employeeName?: string
  isPresent: boolean
  isManual?: boolean
  shift?: string
}

// Branch with its assigned employees
export type BranchAssignment = {
  branchId: string
  branchName: string
  employees: BranchEmployee[]
}

// Legacy flat assignment type (for backward compatibility)
export type ScheduleAssignment = {
  employeeId: string
  employeeName?: string
  branchId: string
  branchName?: string
  isPresent: boolean
  shift?: string
}

export type Schedule = {
  id?: string
  date: string
  time: string
  scheduleFor?: string
  branchNames?: string[]
  assignments?: ScheduleAssignment[]
  branchAssignments?: BranchAssignment[]
  weekStart?: string
  weekEnd?: string
  manuallyScheduled?: boolean
  createdAt?: string
  updatedAt?: string
}

const API = "/api/schedules"

async function apiFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json()
}

export const addSchedule = async (schedule: Omit<Schedule, "id" | "createdAt" | "updatedAt">): Promise<string> => {
  const data = await apiFetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(schedule),
  })
  return data.id
}


export const getSchedulesForDate = async (date: string): Promise<Schedule[]> => {
  return apiFetch(`${API}?scheduleFor=${date}`)
}

// Get all schedules for an entire week in a single API call
export const getSchedulesForWeek = async (weekStart: string): Promise<Schedule[]> => {
  return apiFetch(`${API}?weekStart=${weekStart}`)
}

// Update an existing schedule's assignments
export const updateScheduleAssignments = async (scheduleId: string, assignments: ScheduleAssignment[]): Promise<void> => {
  await apiFetch(API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: scheduleId, assignments }),
  })
}

// Delete all schedules for a given week (optionally preserve manually scheduled ones)
export const deleteSchedulesForWeek = async (weekStart: string, preserveManual?: boolean): Promise<void> => {
  const params = new URLSearchParams({ weekStart })
  if (preserveManual) params.set("preserveManual", "true")
  await apiFetch(`${API}?${params.toString()}`, { method: "DELETE" })
}
