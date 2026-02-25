import { NextResponse } from "next/server";
import { query } from "@/lib/mysql";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/debug/scheduling — diagnostic endpoint to verify DB state for rotation
export async function GET() {
  try {
    // 1. Count all users
    const allUsers = await query("SELECT COUNT(*) as count FROM users");

    // 2. Count employees (role = 'employee')
    const allEmployees = await query("SELECT COUNT(*) as count FROM users WHERE role = 'employee'");

    // 3. Count active employees (not archived)
    const activeEmployees = await query(
      "SELECT COUNT(*) as count FROM users WHERE role = 'employee' AND (archived = 0 OR archived IS NULL)"
    );

    // 4. List active employees with key fields
    const activeList = await query(
      "SELECT id, firstName, surname, email, role, status, archived, branchId, type FROM users WHERE role = 'employee' AND (archived = 0 OR archived IS NULL) ORDER BY firstName, surname"
    );

    // 5. Count branches
    const branchCount = await query("SELECT COUNT(*) as count FROM branches");

    // 6. List branches
    const branchList = await query("SELECT id, branchName, address FROM branches ORDER BY branchName");

    // 7. Check for common issues
    const issues: string[] = [];

    if ((activeList as any[]).length === 0) {
      // Check if employees exist but with wrong role
      const nonEmployeeUsers = await query(
        "SELECT id, firstName, surname, role, status FROM users WHERE role != 'employee' LIMIT 10"
      );
      if ((nonEmployeeUsers as any[]).length > 0) {
        issues.push(`Found ${(nonEmployeeUsers as any[]).length} users with non-employee roles: ${JSON.stringify(nonEmployeeUsers)}`);
      }

      // Check if employees exist but are archived
      const archivedEmployees = await query(
        "SELECT COUNT(*) as count FROM users WHERE role = 'employee' AND archived = 1"
      );
      if ((archivedEmployees as any[])[0]?.count > 0) {
        issues.push(`Found ${(archivedEmployees as any[])[0].count} archived employees`);
      }
    }

    if ((branchList as any[]).length === 0) {
      issues.push("No branches found — rotation requires at least 1 branch");
    }

    return NextResponse.json({
      summary: {
        totalUsers: (allUsers as any[])[0]?.count ?? 0,
        totalEmployees: (allEmployees as any[])[0]?.count ?? 0,
        activeEmployees: (activeEmployees as any[])[0]?.count ?? 0,
        totalBranches: (branchCount as any[])[0]?.count ?? 0,
      },
      activeEmployees: activeList,
      branches: branchList,
      issues: issues.length > 0 ? issues : ["No issues detected — employees and branches exist"],
      rotationReady: (activeList as any[]).length > 0 && (branchList as any[]).length > 0,
    });
  } catch (error: any) {
    console.error("GET /api/debug/scheduling error:", error);
    return NextResponse.json({
      error: error.message,
      hint: "Database connection may have failed. Check MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE env vars.",
    }, { status: 500 });
  }
}
