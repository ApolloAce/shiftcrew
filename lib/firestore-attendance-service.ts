import { db } from "./firebase"
import { collection, addDoc, getDocs, query, where, updateDoc, doc, deleteDoc, setDoc } from "firebase/firestore"

export type AttendanceRecord = {
  id?: string
  employeeId: string
  employeeName?: string
  date: string
  status: "present" | "absent"
  branchId?: string
  branchName?: string
  createdAt?: string
  updatedAt?: string
}

const ATTENDANCE_COLLECTION = "daily_attendance"

// Get today's date in YYYY-MM-DD format
const getTodayDate = (): string => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// Save or update attendance record
export const saveAttendanceRecord = async (
  record: Omit<AttendanceRecord, "id" | "createdAt" | "updatedAt">
): Promise<string> => {
  try {
    console.log("[Firestore Attendance] Saving attendance record:", record)
    
    // Use a unique document ID: employeeId_date
    const docId = `${record.employeeId}_${record.date}`
    const docRef = doc(db, ATTENDANCE_COLLECTION, docId)
    
    await setDoc(docRef, {
      ...record,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }, { merge: true })
    
    console.log(`✓ Attendance record saved: ${docId}`)
    return docId
  } catch (error) {
    console.error("❌ Error saving attendance record:", error)
    throw error
  }
}

// Get all attendance records for a specific date
export const getAttendanceForDate = async (date: string): Promise<AttendanceRecord[]> => {
  try {
    const q = query(collection(db, ATTENDANCE_COLLECTION), where("date", "==", date))
    const snap = await getDocs(q)
    const records = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord))
    console.log(`✓ Fetched ${records.length} attendance records for ${date}`)
    return records
  } catch (error) {
    console.error("❌ Error fetching attendance for date:", error)
    throw error
  }
}

// Get today's attendance records
export const getTodayAttendance = async (): Promise<AttendanceRecord[]> => {
  return getAttendanceForDate(getTodayDate())
}

// Get attendance records for a specific employee
export const getEmployeeAttendance = async (
  employeeId: string,
  dateRange?: { start: string; end: string }
): Promise<AttendanceRecord[]> => {
  try {
    const q = query(collection(db, ATTENDANCE_COLLECTION), where("employeeId", "==", employeeId))
    const snap = await getDocs(q)
    let records = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord))
    
    // Filter by date range if provided
    if (dateRange) {
      records = records.filter((r) => r.date >= dateRange.start && r.date <= dateRange.end)
    }
    
    // Sort by date descending
    records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    
    console.log(`✓ Fetched ${records.length} attendance records for employee ${employeeId}`)
    return records
  } catch (error) {
    console.error("❌ Error fetching employee attendance:", error)
    throw error
  }
}

// Get attendance records for a date range
export const getAttendanceForDateRange = async (startDate: string, endDate: string): Promise<AttendanceRecord[]> => {
  try {
    const snap = await getDocs(collection(db, ATTENDANCE_COLLECTION))
    const allRecords = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord))
    
    const filteredRecords = allRecords.filter((r) => r.date >= startDate && r.date <= endDate)
    
    console.log(`✓ Fetched ${filteredRecords.length} attendance records for range ${startDate} to ${endDate}`)
    return filteredRecords
  } catch (error) {
    console.error("❌ Error fetching attendance for date range:", error)
    throw error
  }
}

// Delete attendance record
export const deleteAttendanceRecord = async (employeeId: string, date: string): Promise<void> => {
  try {
    const docId = `${employeeId}_${date}`
    await deleteDoc(doc(db, ATTENDANCE_COLLECTION, docId))
    console.log(`✓ Attendance record ${docId} deleted`)
  } catch (error) {
    console.error("❌ Error deleting attendance record:", error)
    throw error
  }
}

// Get attendance statistics for a date
export const getAttendanceStats = async (date: string): Promise<{
  totalRecords: number
  presentCount: number
  absentCount: number
  attendancePercentage: number
}> => {
  try {
    const records = await getAttendanceForDate(date)
    const presentCount = records.filter((r) => r.status === "present").length
    const absentCount = records.filter((r) => r.status === "absent").length
    const totalRecords = records.length
    const attendancePercentage = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0
    
    return {
      totalRecords,
      presentCount,
      absentCount,
      attendancePercentage,
    }
  } catch (error) {
    console.error("❌ Error calculating attendance stats:", error)
    throw error
  }
}
