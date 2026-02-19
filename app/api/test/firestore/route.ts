import { query } from "@/lib/mysql"

export async function GET() {
  try {
    console.log("Testing MySQL connection...")
    
    // Test 1: Get all users
    const allUsersData = await query("SELECT id, firstName, surname, email, role FROM users")
    
    // Test 2: Get users with role: employee
    const employeesData = await query("SELECT id, firstName, surname, email, role FROM users WHERE role = 'employee'")
    
    return Response.json({
      success: true,
      totalUsers: allUsersData.length,
      employees: employeesData.length,
      allUsersData,
      employeesData,
      message: "MySQL connection successful"
    })
  } catch (error) {
    console.error("MySQL test error:", error)
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
