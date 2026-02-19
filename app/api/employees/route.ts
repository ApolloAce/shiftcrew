import { NextResponse } from "next/server";
import { query, execute } from "@/lib/mysql";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/employees  — list employees (optional ?archived=true&active=true)
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const archived = url.searchParams.get("archived");
    const active = url.searchParams.get("active");
    const id = url.searchParams.get("id");

    if (id) {
      const rows = await query("SELECT * FROM users WHERE id = ? AND role = 'employee'", [id]);
      if (rows.length === 0) return NextResponse.json(null, { status: 404 });
      return NextResponse.json(mapUser(rows[0]));
    }

    let sql = "SELECT * FROM users WHERE role = 'employee'";
    const params: any[] = [];

    if (archived === "true") {
      sql += " AND archived = 1";
    } else if (active === "true") {
      sql += " AND (archived = 0 OR archived IS NULL)";
    }

    sql += " ORDER BY firstName, surname";
    const rows = await query(sql, params);
    return NextResponse.json(rows.map(mapUser));
  } catch (error: any) {
    console.error("GET /api/employees error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST /api/employees — add employee
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await execute(
      `INSERT INTO users (id, firstName, surname, nickname, email, passwordHash, phone, address, emergencyContact, position, type, availability, isPresent, isEmployee, archived, role, status, branchId, hireDate, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, 0, 1, 0, 'employee', 'approved', ?, ?, ?, ?)`,
      [
        id,
        body.firstName || "",
        body.surname || "",
        body.nickname || null,
        (body.email || "").toLowerCase(),
        body.phone || null,
        body.address || null,
        body.emergencyContact || null,
        body.position || null,
        body.type || "full-time",
        body.availability ? JSON.stringify(body.availability) : null,
        body.branchId || null,
        body.hireDate || null,
        now,
        now,
      ]
    );

    return NextResponse.json({ id }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/employees error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// PUT /api/employees  (body must include { id, ...updates })
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === "id") continue;
      const col = key === "availability" ? key : key;
      setClauses.push(`\`${col}\` = ?`);
      params.push(key === "availability" ? JSON.stringify(value) : value);
    }

    setClauses.push("updatedAt = ?");
    params.push(new Date().toISOString());
    params.push(id);

    await execute(`UPDATE users SET ${setClauses.join(", ")} WHERE id = ?`, params);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PUT /api/employees error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// DELETE /api/employees?id=xxx
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    await execute("DELETE FROM users WHERE id = ? AND role = 'employee'", [id]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/employees error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

function mapUser(row: any) {
  return {
    id: row.id,
    firstName: row.firstName,
    surname: row.surname,
    nickname: row.nickname,
    email: row.email,
    phone: row.phone,
    address: row.address,
    emergencyContact: row.emergencyContact,
    position: row.position,
    type: row.type,
    availability: typeof row.availability === "string" ? JSON.parse(row.availability) : row.availability || [],
    isPresent: !!row.isPresent,
    isEmployee: !!row.isEmployee,
    archived: !!row.archived,
    role: row.role,
    status: row.status,
    branchId: row.branchId,
    hireDate: row.hireDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
