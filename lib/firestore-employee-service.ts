// MySQL-backed employee service — calls /api/employees

export type Employee = {
  id: string
  firstName: string
  surname: string
  nickname?: string
  type?: "full-time" | "part-time"
  availability?: string[]
  isPresent?: boolean
  archived?: boolean
  email?: string
  phone?: string
  address?: string
  emergencyContact?: string
  position?: string
  hireDate?: string
  branchId?: string
  createdAt?: string
  updatedAt?: string
}

const API = "/api/employees"

async function apiFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json()
}

// Get all employees
export const getAllEmployees = async (): Promise<Employee[]> => {
  return apiFetch(API)
}

// Get active employees
export const getActiveEmployees = async (): Promise<Employee[]> => {
  return apiFetch(`${API}?active=true`)
}

// Get archived employees
export const getArchivedEmployees = async (): Promise<Employee[]> => {
  return apiFetch(`${API}?archived=true`)
}

// Add new employee
export const addEmployee = async (employee: Omit<Employee, "id" | "createdAt" | "updatedAt">): Promise<string> => {
  const data = await apiFetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(employee),
  })
  return data.id
}

// Update employee
export const updateEmployee = async (employeeId: string, updates: Partial<Employee>): Promise<void> => {
  await apiFetch(API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: employeeId, ...updates }),
  })
}

// Archive employee
export const archiveEmployee = async (employeeId: string): Promise<void> => {
  await updateEmployee(employeeId, { archived: true } as any)
}

// Restore employee
export const restoreEmployee = async (employeeId: string): Promise<void> => {
  await updateEmployee(employeeId, { archived: false } as any)
}

// Delete employee
export const deleteEmployee = async (employeeId: string): Promise<void> => {
  await apiFetch(`${API}?id=${employeeId}`, { method: "DELETE" })
}

// Get employee by ID
export const getEmployeeById = async (employeeId: string): Promise<Employee | null> => {
  try {
    return await apiFetch(`${API}?id=${employeeId}`)
  } catch {
    return null
  }
}
