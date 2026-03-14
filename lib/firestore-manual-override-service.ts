// MySQL-backed manual override service — calls /api/overrides

// Manual override for a single employee on a specific date
export type ManualOverride = {
  id?: string
  employeeId: string
  employeeName: string
  date: string
  dayOfWeek: string
  overrideBranchId: string
  overrideBranchName: string
  originalBranchId?: string
  originalBranchName?: string
  shift?: string
  reason?: string
  createdAt?: string
  updatedAt?: string
  createdBy?: string
}

// Weekly override summary
export type WeeklyOverrides = {
  weekStartDate: string
  overrides: ManualOverride[]
}

const API = "/api/overrides"

async function apiFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json()
}

// Save a manual override
export const saveManualOverride = async (override: Omit<ManualOverride, "id" | "createdAt" | "updatedAt">): Promise<string> => {
  const data = await apiFetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(override),
  })
  return data.id
}

// Update an existing manual override
export const updateManualOverride = async (overrideId: string, updates: Partial<ManualOverride>): Promise<void> => {
  await apiFetch(API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: overrideId, ...updates }),
  })
}

// Get all manual overrides for a specific date
export const getOverridesForDate = async (date: string): Promise<ManualOverride[]> => {
  return apiFetch(`${API}?date=${date}`)
}

// Get override for a specific employee on a specific date
export const getOverrideForEmployeeOnDate = async (employeeId: string, date: string): Promise<ManualOverride | null> => {
  const list: ManualOverride[] = await apiFetch(`${API}?employeeId=${employeeId}&date=${date}`)
  return list.length > 0 ? list[0] : null
}

// Get all manual overrides for a week
export const getOverridesForWeek = async (weekStartDate: string): Promise<ManualOverride[]> => {
  return apiFetch(`${API}?weekStart=${weekStartDate}`)
}

// Get all overrides for a specific employee
export const getOverridesForEmployee = async (employeeId: string): Promise<ManualOverride[]> => {
  return apiFetch(`${API}?employeeId=${employeeId}`)
}

// Delete a manual override
export const deleteManualOverride = async (overrideId: string): Promise<void> => {
  await apiFetch(`${API}?id=${overrideId}`, { method: "DELETE" })
}

// Delete all overrides for an employee on a specific date
export const deleteOverridesForEmployeeOnDate = async (employeeId: string, date: string): Promise<void> => {
  await apiFetch(`${API}?employeeId=${employeeId}&date=${date}`, { method: "DELETE" })
}
