import { db } from "./firebase"
import { collection, addDoc, getDocs, query, where, updateDoc, doc, deleteDoc, Timestamp } from "firebase/firestore"

// Manual override for a single employee on a specific date
export type ManualOverride = {
  id?: string
  employeeId: string
  employeeName: string
  date: string // ISO date format (YYYY-MM-DD)
  dayOfWeek: string // e.g., "Monday", "Tuesday", etc.
  overrideBranchId: string
  overrideBranchName: string
  originalBranchId?: string // The original assigned branch for reference
  originalBranchName?: string
  shift?: string // AM or PM
  reason?: string // Optional note explaining why this override was made
  createdAt?: string
  updatedAt?: string
  createdBy?: string // User who created the override
}

// Weekly override summary (all overrides for a week)
export type WeeklyOverrides = {
  weekStartDate: string // ISO date of Monday of the week
  overrides: ManualOverride[]
}

const MANUAL_OVERRIDES_COLLECTION = "manual_overrides"

// Get day of week name from a date
const getDayOfWeekName = (date: string): string => {
  const d = new Date(date + "T00:00:00")
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  return days[d.getUTCDay()]
}

// Get the start of the week (Monday) for a given date
const getWeekStart = (date: string): string => {
  const d = new Date(date + "T00:00:00")
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1) // Adjust to Monday
  const monday = new Date(d.setUTCDate(diff))
  return monday.toISOString().split("T")[0]
}

// Save a manual override for an employee on a specific date
export const saveManualOverride = async (override: Omit<ManualOverride, "id" | "createdAt" | "updatedAt">): Promise<string> => {
  try {
    // Add day of week if not provided
    const dayOfWeek = override.dayOfWeek || getDayOfWeekName(override.date)
    
    const overrideData = {
      ...override,
      dayOfWeek,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const docRef = await addDoc(collection(db, MANUAL_OVERRIDES_COLLECTION), overrideData)
    console.log(`✓ Manual override saved: ${docRef.id}`)
    return docRef.id
  } catch (error) {
    console.error("❌ Error saving manual override:", error)
    throw error
  }
}

// Update an existing manual override
export const updateManualOverride = async (overrideId: string, updates: Partial<ManualOverride>): Promise<void> => {
  try {
    const docRef = doc(db, MANUAL_OVERRIDES_COLLECTION, overrideId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: new Date().toISOString(),
    })
    console.log(`✓ Manual override ${overrideId} updated`)
  } catch (error) {
    console.error("❌ Error updating manual override:", error)
    throw error
  }
}

// Get all manual overrides for a specific date
export const getOverridesForDate = async (date: string): Promise<ManualOverride[]> => {
  try {
    const q = query(collection(db, MANUAL_OVERRIDES_COLLECTION), where("date", "==", date))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ManualOverride))
  } catch (error) {
    console.error("❌ Error fetching overrides for date:", error)
    throw error
  }
}

// Get all manual overrides for a specific employee on a specific date
export const getOverrideForEmployeeOnDate = async (employeeId: string, date: string): Promise<ManualOverride | null> => {
  try {
    const q = query(
      collection(db, MANUAL_OVERRIDES_COLLECTION),
      where("employeeId", "==", employeeId),
      where("date", "==", date),
    )
    const snap = await getDocs(q)
    if (snap.docs.length > 0) {
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as ManualOverride
    }
    return null
  } catch (error) {
    console.error("❌ Error fetching override for employee on date:", error)
    throw error
  }
}

// Get all manual overrides for a week (Monday to Sunday)
export const getOverridesForWeek = async (weekStartDate: string): Promise<ManualOverride[]> => {
  try {
    const startDate = getWeekStart(weekStartDate)
    // Calculate end date (Sunday of that week)
    const startDateObj = new Date(startDate + "T00:00:00")
    const endDate = new Date(startDateObj)
    endDate.setUTCDate(endDate.getUTCDate() + 6) // Add 6 days to get Sunday
    const endDateStr = endDate.toISOString().split("T")[0]

    const q = query(
      collection(db, MANUAL_OVERRIDES_COLLECTION),
      where("date", ">=", startDate),
      where("date", "<=", endDateStr),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ManualOverride))
  } catch (error) {
    console.error("❌ Error fetching overrides for week:", error)
    throw error
  }
}

// Get all overrides for a specific employee
export const getOverridesForEmployee = async (employeeId: string): Promise<ManualOverride[]> => {
  try {
    const q = query(collection(db, MANUAL_OVERRIDES_COLLECTION), where("employeeId", "==", employeeId))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ManualOverride))
  } catch (error) {
    console.error("❌ Error fetching overrides for employee:", error)
    throw error
  }
}

// Delete a manual override
export const deleteManualOverride = async (overrideId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, MANUAL_OVERRIDES_COLLECTION, overrideId))
    console.log(`✓ Manual override ${overrideId} deleted`)
  } catch (error) {
    console.error("❌ Error deleting manual override:", error)
    throw error
  }
}

// Delete all overrides for an employee on a specific date
export const deleteOverridesForEmployeeOnDate = async (employeeId: string, date: string): Promise<void> => {
  try {
    const overrides = await getOverrideForEmployeeOnDate(employeeId, date)
    if (overrides?.id) {
      await deleteManualOverride(overrides.id)
    }
  } catch (error) {
    console.error("❌ Error deleting overrides for employee on date:", error)
    throw error
  }
}
