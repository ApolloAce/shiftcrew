// MySQL-backed absence service — calls /api/absences

export type Absence = {
  id?: string
  employeeId: string
  employeeName?: string
  date: string
  reason: string
  status: "excused" | "unexcused"
  notes?: string
  createdAt?: string
  updatedAt?: string
}

const API = "/api/absences"

async function apiFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json()
}

// Add a new absence record
export const addAbsence = async (absence: Omit<Absence, "id" | "createdAt" | "updatedAt">): Promise<string> => {
  const data = await apiFetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(absence),
  })
  return data.id
}

// Get all absences
export const getAllAbsences = async (): Promise<Absence[]> => {
  return apiFetch(API)
}

// Get absences for a specific employee
export const getAbsencesForEmployee = async (employeeId: string): Promise<Absence[]> => {
  return apiFetch(`${API}?employeeId=${employeeId}`)
}

// Get absences for a specific date
export const getAbsencesForDate = async (date: string): Promise<Absence[]> => {
  return apiFetch(`${API}?date=${date}`)
}

// Update absence status
export const updateAbsenceStatus = async (absenceId: string, status: "excused" | "unexcused"): Promise<void> => {
  await apiFetch(API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: absenceId, status }),
  })
}

// Update absence record
export const updateAbsence = async (absenceId: string, updates: Partial<Absence>): Promise<void> => {
  await apiFetch(API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: absenceId, ...updates }),
  })
}

// Delete absence record
export const deleteAbsence = async (absenceId: string): Promise<void> => {
  await apiFetch(`${API}?id=${absenceId}`, { method: "DELETE" })
}
