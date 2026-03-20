import { NextResponse } from "next/server";
import { query, execute, mysqlNow } from "../../../lib/mysql";
import bcrypt from "bcryptjs";

async function generateEmployeeCode(): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await query(
    "SELECT employeeCode FROM users WHERE employeeCode LIKE ? ORDER BY employeeCode DESC LIMIT 1",
    [`${year}-%`]
  );
  let seq = 1;
  if (rows.length > 0 && rows[0].employeeCode) {
    const parts = rows[0].employeeCode.split("-");
    seq = parseInt(parts[1], 10) + 1;
  }
  return `${year}-${String(seq).padStart(4, "0")}`;
}

export async function POST(req: Request) {
  const formData = await req.json();

  try {
    // Check if email already exists
    const existing = await query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [formData.email.toLowerCase()]
    );

    if (existing.length > 0) {
      return NextResponse.json({ message: "Email is already in use" }, { status: 400 });
    }

    // Hash password before saving
    const passwordHash = await bcrypt.hash(formData.password, 10);
    const id = crypto.randomUUID();
    const now = mysqlNow();
    const employeeCode = await generateEmployeeCode();

    await execute(
      `INSERT INTO users (id, firstName, surname, nickname, email, passwordHash, phone, address, type, availability, isPresent, isEmployee, archived, status, role, employeeCode, hireDate, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, 'approved', 'employee', ?, ?, ?, ?)`,
      [
        id,
        formData.firstName || "",
        formData.surname || "",
        formData.nickname || null,
        formData.email.toLowerCase(),
        passwordHash,
        formData.phone || null,
        formData.address || null,
        formData.type || "full-time",
        formData.availability ? JSON.stringify(formData.availability) : null,
        employeeCode,
        now.split("T")[0],
        now,
        now,
      ]
    );

    return NextResponse.json({
      id,
      firstName: formData.firstName,
      surname: formData.surname,
      email: formData.email.toLowerCase(),
      employeeCode,
      role: "employee",
    }, { status: 201 });
  } catch (error: any) {
    console.error("Register error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
