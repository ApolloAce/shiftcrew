import { db } from "./firebase"
import { collection, addDoc, getDocs, query, where, updateDoc, doc, deleteDoc } from "firebase/firestore"

// Employee details within a branch assignment
export type BranchEmployee = {
  employeeId: string
  employeeName?: string // firstName and surname combined
  isPresent: boolean
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
  employeeName?: string // firstName and surname combined
  branchId: string
  branchName?: string // Branch name for readability
  isPresent: boolean
  shift?: string
}

export type Schedule = {
  id?: string
  date: string
  time: string
  branchNames?: string[] // Array of branch names included in this schedule (deprecated)
  assignments?: ScheduleAssignment[] // Legacy flat array (deprecated, kept for backward compatibility)
  branchAssignments?: BranchAssignment[] // New organized structure: employees grouped by branch
  createdAt?: string
  updatedAt?: string
}

const SCHEDULES_COLLECTION = "schedules"

// Helper function to group flat assignments by branch
const groupAssignmentsByBranch = (assignments: ScheduleAssignment[]): BranchAssignment[] => {
  const branchMap = new Map<string, BranchAssignment>()
  
  for (const assignment of assignments) {
    const branchId = assignment.branchId
    const branchName = assignment.branchName || branchId
    
    if (!branchMap.has(branchId)) {
      branchMap.set(branchId, {
        branchId,
        branchName,
        employees: []
      })
    }
    
    branchMap.get(branchId)!.employees.push({
      employeeId: assignment.employeeId,
      employeeName: assignment.employeeName,
      isPresent: assignment.isPresent,
      shift: assignment.shift
    })
  }
  
  return Array.from(branchMap.values())
}

// Add/create a new schedule with all assignments
// Add or replace schedule for a given date. If a schedule already exists for the same date,
// update the first found document and remove any duplicates so only the latest remains.
export const addSchedule = async (schedule: Omit<Schedule, "id" | "createdAt" | "updatedAt">): Promise<string> => {
  try {
    // Debug info: log invocation and environment project id
    try {
      console.log("addSchedule called for date:", schedule.date, "assignments:", schedule.assignments?.length)
      console.log("NEXT_PUBLIC_FIREBASE_PROJECT_ID:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
    } catch (e) {
      // ignore
    }
    // Find existing schedules for the same date
    const q = query(collection(db, SCHEDULES_COLLECTION), where("date", "==", schedule.date))
    const snap = await getDocs(q)

    // Group assignments by branch for organized storage
    const branchAssignments = schedule.assignments
      ? groupAssignmentsByBranch(schedule.assignments)
      : []

    // Build the schedule data with organized branch assignments
    // Exclude branchNames and flat assignments from saved data
    const scheduleData = {
      date: schedule.date,
      time: schedule.time,
      branchAssignments, // Employees grouped by branch
    }

    if (!snap.empty) {
      console.log(`Found existing schedules for date=${schedule.date}, count=${snap.docs.length}`)
      // Update the first found document with the new schedule data
      const first = snap.docs[0]
      const firstRef = doc(db, SCHEDULES_COLLECTION, first.id)
      await updateDoc(firstRef, {
        ...scheduleData,
        updatedAt: new Date().toISOString(),
      })

      // Delete any additional duplicate documents for the same date
      if (snap.docs.length > 1) {
        for (let i = 1; i < snap.docs.length; i++) {
          try {
            await deleteDoc(doc(db, SCHEDULES_COLLECTION, snap.docs[i].id))
          } catch (e) {
            console.warn(`Could not delete duplicate schedule ${snap.docs[i].id}:`, e)
          }
        }
      }

      console.log(`✓ Schedule updated (replaced) for date: ${schedule.date} (id=${first.id})`)
      return first.id
    }

    // No existing schedule for this date — create a new one
    const docRef = await addDoc(collection(db, SCHEDULES_COLLECTION), {
      ...scheduleData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    console.log(`✓ Schedule saved: ${docRef.id}`)
    return docRef.id
  } catch (error) {
    console.error("❌ Error saving schedule:", error)
    throw error
  }
}

// Get all schedules for a specific date
export const getSchedulesForDate = async (date: string): Promise<Schedule[]> => {
  try {
    const q = query(collection(db, SCHEDULES_COLLECTION), where("date", "==", date))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Schedule))
  } catch (error) {
    console.error("❌ Error fetching schedules:", error)
    throw error
  }
}

// Update an existing schedule's assignments (e.g., mark employee as absent/present)
export const updateScheduleAssignments = async (scheduleId: string, assignments: ScheduleAssignment[]): Promise<void> => {
  try {
    const docRef = doc(db, SCHEDULES_COLLECTION, scheduleId)
    await updateDoc(docRef, {
      assignments,
      updatedAt: new Date().toISOString(),
    })
    console.log(`✓ Schedule ${scheduleId} updated`)
  } catch (error) {
    console.error("❌ Error updating schedule:", error)
    throw error
  }
}
