import { db } from "./firebase"
import { collection, addDoc, getDocs, query, where, updateDoc, doc, deleteDoc } from "firebase/firestore"

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

const ABSENCES_COLLECTION = "absences"

// Add a new absence record
export const addAbsence = async (absence: Omit<Absence, "id" | "createdAt" | "updatedAt">): Promise<string> => {
  try {
    console.log("Adding absence to Firestore:", absence)
    const docRef = await addDoc(collection(db, ABSENCES_COLLECTION), {
      employeeId: absence.employeeId,
      employeeName: absence.employeeName || "",
      date: absence.date,
      reason: absence.reason,
      status: absence.status,
      notes: absence.notes || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    console.log(`✓ Absence recorded: ${docRef.id}`)
    return docRef.id
  } catch (error) {
    console.error("❌ Error recording absence:", error)
    throw error
  }
}

// Get all absences (sorted client-side to avoid index requirement)
export const getAllAbsences = async (): Promise<Absence[]> => {
  try {
    const snap = await getDocs(collection(db, ABSENCES_COLLECTION))
    const absences = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Absence))
    // Sort by date descending (most recent first)
    return absences.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  } catch (error) {
    console.error("❌ Error fetching absences:", error)
    throw error
  }
}

// Get absences for a specific employee
export const getAbsencesForEmployee = async (employeeId: string): Promise<Absence[]> => {
  try {
    const q = query(
      collection(db, ABSENCES_COLLECTION),
      where("employeeId", "==", employeeId)
    )
    const snap = await getDocs(q)
    const absences = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Absence))
    // Sort by date descending
    return absences.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  } catch (error) {
    console.error("❌ Error fetching employee absences:", error)
    throw error
  }
}

// Get absences for a specific date
export const getAbsencesForDate = async (date: string): Promise<Absence[]> => {
  try {
    const q = query(collection(db, ABSENCES_COLLECTION), where("date", "==", date))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Absence))
  } catch (error) {
    console.error("❌ Error fetching absences for date:", error)
    throw error
  }
}

// Update absence status
export const updateAbsenceStatus = async (absenceId: string, status: "excused" | "unexcused"): Promise<void> => {
  try {
    const docRef = doc(db, ABSENCES_COLLECTION, absenceId)
    await updateDoc(docRef, {
      status,
      updatedAt: new Date().toISOString(),
    })
    console.log(`✓ Absence ${absenceId} status updated to ${status}`)
  } catch (error) {
    console.error("❌ Error updating absence status:", error)
    throw error
  }
}

// Update absence record
export const updateAbsence = async (absenceId: string, updates: Partial<Absence>): Promise<void> => {
  try {
    const docRef = doc(db, ABSENCES_COLLECTION, absenceId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: new Date().toISOString(),
    })
    console.log(`✓ Absence ${absenceId} updated`)
  } catch (error) {
    console.error("❌ Error updating absence:", error)
    throw error
  }
}

// Delete absence record
export const deleteAbsence = async (absenceId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, ABSENCES_COLLECTION, absenceId))
    console.log(`✓ Absence ${absenceId} deleted`)
  } catch (error) {
    console.error("❌ Error deleting absence:", error)
    throw error
  }
}
