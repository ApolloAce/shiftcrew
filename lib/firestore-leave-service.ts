import { db } from "./firebase"
import { collection, getDocs, query, where, addDoc, updateDoc, doc } from "firebase/firestore"

export type LeaveRequest = {
  id?: string | number
  crewId: number
  startDate: string
  endDate: string
  reason?: string
  status?: string
  type?: string
  notes?: string
  createdAt?: string
  reviewedAt?: string
  reviewedBy?: number
}

const LEAVE_COLLECTION = "leaveRequests"

export const getAllLeaveRequests = async (): Promise<LeaveRequest[]> => {
  try {
    const q = query(collection(db, LEAVE_COLLECTION))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeaveRequest))
  } catch (error) {
    console.error("Error fetching leave requests:", error)
    throw error
  }
}

export const getLeaveRequestsForCrew = async (crewId: number): Promise<LeaveRequest[]> => {
  try {
    const q = query(collection(db, LEAVE_COLLECTION), where("crewId", "==", crewId))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeaveRequest))
  } catch (error) {
    console.error("Error fetching leave requests for crew:", error)
    throw error
  }
}

export const addLeaveRequest = async (request: Omit<LeaveRequest, "id" | "createdAt" | "status"> & { status?: string }) => {
  try {
    const docRef = await addDoc(collection(db, LEAVE_COLLECTION), {
      ...request,
      status: (request as any).status || "pending",
      createdAt: new Date().toISOString(),
    })
    return docRef.id
  } catch (error) {
    console.error("Error adding leave request:", error)
    throw error
  }
}

export const updateLeaveRequest = async (id: string, data: Partial<LeaveRequest>) => {
  try {
    const ref = doc(db, LEAVE_COLLECTION, id)
    await updateDoc(ref, { ...data, reviewedAt: new Date().toISOString() })
  } catch (error) {
    console.error("Error updating leave request:", error)
    throw error
  }
}
