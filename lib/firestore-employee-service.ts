import { db } from "./firebase"
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  addDoc,
  QueryConstraint,
} from "firebase/firestore"

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

const USERS_COLLECTION = "users"

// Get all employees (users with role: employee)
export const getAllEmployees = async (): Promise<Employee[]> => {
  try {
    console.log("🔍 Querying users collection for role='employee'...")
    const q = query(collection(db, USERS_COLLECTION), where("role", "==", "employee"))
    const querySnapshot = await getDocs(q)
    console.log(`✓ Found ${querySnapshot.size} users with role='employee'`)
    
    const employees = querySnapshot.docs.map((doc) => {
      console.log(`  - User: ${doc.id}`, doc.data())
      return {
        id: doc.id,
        ...doc.data(),
      } as Employee
    })
    return employees
  } catch (error) {
    console.error("❌ Error fetching employees:", error)
    throw error
  }
}

// Get active employees (users with role: employee and archived: false or not set)
export const getActiveEmployees = async (): Promise<Employee[]> => {
  try {
    console.log("🔍 Querying for active employees (role='employee')...")
    const q = query(
      collection(db, USERS_COLLECTION),
      where("role", "==", "employee")
    )
    const querySnapshot = await getDocs(q)
    console.log(`✓ Found ${querySnapshot.size} employees total, filtering for non-archived...`)
    
    const activeEmployees = querySnapshot.docs
      .filter((doc) => {
        const isArchived = doc.data().archived
        console.log(`  - ${doc.id}: archived=${isArchived}`)
        return !isArchived
      })
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as Employee))
    
    console.log(`✓ ${activeEmployees.length} active employees`)
    return activeEmployees
  } catch (error) {
    console.error("❌ Error fetching active employees:", error)
    throw error
  }
}

// Get archived employees (users with role: employee and archived: true)
export const getArchivedEmployees = async (): Promise<Employee[]> => {
  try {
    console.log("🔍 Querying for archived employees...")
    const q = query(
      collection(db, USERS_COLLECTION),
      where("role", "==", "employee"),
      where("archived", "==", true)
    )
    const querySnapshot = await getDocs(q)
    console.log(`✓ Found ${querySnapshot.size} archived employees`)
    
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as Employee))
  } catch (error) {
    console.error("❌ Error fetching archived employees:", error)
    throw error
  }
}

// Add new employee
export const addEmployee = async (employee: Omit<Employee, "id" | "createdAt" | "updatedAt">): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, USERS_COLLECTION), {
      ...employee,
      role: "employee",
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    return docRef.id
  } catch (error) {
    console.error("Error adding employee:", error)
    throw error
  }
}

// Update employee
export const updateEmployee = async (employeeId: string, updates: Partial<Employee>): Promise<void> => {
  try {
    const docRef = doc(db, USERS_COLLECTION, employeeId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error updating employee:", error)
    throw error
  }
}

// Archive employee
export const archiveEmployee = async (employeeId: string): Promise<void> => {
  try {
    const docRef = doc(db, USERS_COLLECTION, employeeId)
    await updateDoc(docRef, {
      archived: true,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error archiving employee:", error)
    throw error
  }
}

// Restore employee
export const restoreEmployee = async (employeeId: string): Promise<void> => {
  try {
    const docRef = doc(db, USERS_COLLECTION, employeeId)
    await updateDoc(docRef, {
      archived: false,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error restoring employee:", error)
    throw error
  }
}

// Delete employee
export const deleteEmployee = async (employeeId: string): Promise<void> => {
  try {
    const docRef = doc(db, USERS_COLLECTION, employeeId)
    await deleteDoc(docRef)
  } catch (error) {
    console.error("Error deleting employee:", error)
    throw error
  }
}

// Get employee by ID
export const getEmployeeById = async (employeeId: string): Promise<Employee | null> => {
  try {
    const q = query(collection(db, USERS_COLLECTION), where("id", "==", employeeId))
    const querySnapshot = await getDocs(q)
    if (querySnapshot.empty) return null
    const document = querySnapshot.docs[0]
    return {
      id: document.id,
      ...document.data(),
    } as Employee
  } catch (error) {
    console.error("Error fetching employee:", error)
    throw error
  }
}
