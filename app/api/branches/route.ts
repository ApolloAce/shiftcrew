import { NextResponse } from "next/server";
import { query, execute } from "@/lib/mysql";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/branches?id=xxx
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (id) {
      const rows = await query("SELECT * FROM branches WHERE id = ?", [id]);
      if (rows.length === 0) return NextResponse.json(null, { status: 404 });
      return NextResponse.json(rows[0]);
    }

    const rows = await query("SELECT * FROM branches ORDER BY branchName");
    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("GET /api/branches error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST /api/branches
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = crypto.randomUUID();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await execute(
      `INSERT INTO branches (id, branchName, address, latitude, longitude, city, province, radius, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.branchName,
        body.address || null,
        body.latitude ?? null,
        body.longitude ?? null,
        body.city || null,
        body.province || null,
        body.radius ?? 100,
        now,
        now,
      ]
    );

    return NextResponse.json({ id }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/branches error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// PUT /api/branches
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    // Filter out read-only / auto-managed fields to prevent duplicate SET clauses
    const allowedFields = ["branchName", "address", "latitude", "longitude", "city", "province", "radius"];
    const setClauses: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedFields.includes(key)) continue;
      setClauses.push(`\`${key}\` = ?`);
      params.push(value);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ message: "No valid fields to update" }, { status: 400 });
    }

    setClauses.push("updatedAt = ?");
    params.push(new Date().toISOString().slice(0, 19).replace('T', ' '));
    params.push(id);

    await execute(`UPDATE branches SET ${setClauses.join(", ")} WHERE id = ?`, params);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PUT /api/branches error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// DELETE /api/branches?id=xxx
// Cascade: removes all employees assigned to this branch + their attendance records
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    // 1. Find all employees assigned to this branch
    const employees: any[] = await query(
      "SELECT id FROM users WHERE branchId = ?",
      [id]
    );
    const employeeIds = employees.map((e: any) => e.id);

    // 2. Delete attendance records for those employees
    if (employeeIds.length > 0) {
      const placeholders = employeeIds.map(() => "?").join(",");
      await execute(
        `DELETE FROM daily_attendance WHERE employeeId IN (${placeholders})`,
        employeeIds
      );
    }

    // 3. Delete the employees themselves
    if (employeeIds.length > 0) {
      const placeholders = employeeIds.map(() => "?").join(",");
      await execute(
        `DELETE FROM users WHERE id IN (${placeholders})`,
        employeeIds
      );
    }

    // 4. Delete the branch
    await execute("DELETE FROM branches WHERE id = ?", [id]);

    return NextResponse.json({
      success: true,
      deletedEmployees: employeeIds.length,
    });
  } catch (error: any) {
    console.error("DELETE /api/branches error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
