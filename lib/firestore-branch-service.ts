// MySQL-backed branch service — calls /api/branches

export type Branch = {
  id: string
  branchName: string
  address: string
  createdAt?: string
  updatedAt?: string
}

const API = "/api/branches"

async function apiFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json()
}

// Get all branches
export const getAllBranches = async (): Promise<Branch[]> => {
  return apiFetch(API)
}

// Add new branch
export const addBranch = async (branch: Omit<Branch, "id" | "createdAt" | "updatedAt">): Promise<string> => {
  const data = await apiFetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(branch),
  })
  return data.id
}

// Update branch
export const updateBranch = async (branchId: string, updates: Partial<Branch>): Promise<void> => {
  await apiFetch(API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: branchId, ...updates }),
  })
}

// Delete branch
export const deleteBranch = async (branchId: string): Promise<void> => {
  await apiFetch(`${API}?id=${branchId}`, { method: "DELETE" })
}

// Get branch by ID
export const getBranchById = async (branchId: string): Promise<Branch | null> => {
  try {
    return await apiFetch(`${API}?id=${branchId}`)
  } catch {
    return null
  }
}
