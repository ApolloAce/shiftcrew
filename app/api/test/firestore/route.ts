import { db } from "@/lib/firebase"
import { collection, getDocs, query, where } from "firebase/firestore"

export async function GET() {
  try {
    console.log("Testing Firestore connection...")
    
    // Test 1: Get all users
    const allUsersSnapshot = await getDocs(collection(db, "users"))
    console.log(`Total users in collection: ${allUsersSnapshot.size}`)
    
    const allUsersData = allUsersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    
    // Test 2: Get users with role: employee
    const q = query(collection(db, "users"), where("role", "==", "employee"))
    const employeesSnapshot = await getDocs(q)
    console.log(`Employees with role='employee': ${employeesSnapshot.size}`)
    
    const employeesData = employeesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    
    return Response.json({
      success: true,
      totalUsers: allUsersSnapshot.size,
      employees: employeesSnapshot.size,
      allUsersData,
      employeesData,
      message: "Firestore connection successful"
    })
  } catch (error) {
    console.error("Firestore test error:", error)
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
