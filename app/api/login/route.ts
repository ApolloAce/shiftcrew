import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { query } from "../../../lib/mysql";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const { username, email, password } = await req.json();

  // Use whichever field is provided
  const identifier = (email || username || "").toLowerCase();

  if (!identifier || !password) {
    return NextResponse.json({ message: "Missing credentials" }, { status: 400 });
  }

  try {
    const rows = await query(
      "SELECT * FROM users WHERE email = ? LIMIT 1",
      [identifier]
    );

    if (rows.length === 0) {
      return NextResponse.json({ message: "Invalid username or password" }, { status: 401 });
    }

    const userDoc = rows[0];

    const isMatch = await bcrypt.compare(password, userDoc.passwordHash);
    if (!isMatch) {
      return NextResponse.json({ message: "Invalid username or password" }, { status: 401 });
    }

    const userData = {
      id: userDoc.id,
      email: userDoc.email,
      role: userDoc.role,
      name: `${userDoc.firstName} ${userDoc.surname}`,
      firstName: userDoc.firstName,
      surname: userDoc.surname,
      isAdmin: userDoc.role === "admin",
      isEmployee: !!userDoc.isEmployee,
      branchId: userDoc.branchId || null,
      status: userDoc.status || "approved",
      employeeCode: userDoc.employeeCode || null,
    };

    return NextResponse.json({ user: userData }, { status: 200 });
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
