// MySQL-backed leave service — calls /api/leave

export type LeaveRequest = {
  id?: string
  employeeId: string
  employeeName?: string
  startDate: string
  endDate: string
  reason?: string
  status?: string
  type?: string
  notes?: string
  createdAt?: string
  reviewedAt?: string
  reviewedBy?: string
}

const API = "/api/leave"

async function apiFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json()
}

export const getAllLeaveRequests = async (): Promise<LeaveRequest[]> => {
  return apiFetch(API)
}

export const getPendingLeaveRequests = async (): Promise<LeaveRequest[]> => {
  return apiFetch(`${API}?status=pending`)
}

export const getLeaveRequestsForEmployee = async (employeeId: string): Promise<LeaveRequest[]> => {
  return apiFetch(`${API}?employeeId=${employeeId}`)
}

export const addLeaveRequest = async (request: Omit<LeaveRequest, "id" | "createdAt"> & { status?: string }) => {
  const data = await apiFetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })
  return data.id
}

export const updateLeaveRequest = async (id: string, data: Partial<LeaveRequest>) => {
  await apiFetch(API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...data }),
  })
}

// Convenience helpers for approve/reject
export const approveLeaveRequest = async (id: string, reviewedBy?: string) => {
  await updateLeaveRequest(id, { status: "approved", reviewedBy: reviewedBy || null } as any)
}

export const rejectLeaveRequest = async (id: string, notes?: string, reviewedBy?: string) => {
  await updateLeaveRequest(id, { status: "rejected", notes, reviewedBy: reviewedBy || null } as any)
}
