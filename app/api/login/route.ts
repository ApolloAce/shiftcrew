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
      "SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(firstName) = ? LIMIT 1",
      [identifier, identifier]
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
      firstName: userDoc.firstName,
      surname: userDoc.surname,
      email: userDoc.email,
      role: userDoc.role,
      type: userDoc.type || "full-time",
      isAdmin: userDoc.role === "admin",
      isEmployee: userDoc.role === "employee" || !!userDoc.isEmployee,
      status: userDoc.status || "approved",
      branchId: userDoc.branchId || null,
    };

    return NextResponse.json({ user: userData }, { status: 200 });
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
