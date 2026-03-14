import { NextResponse } from "next/server";
import { query, execute } from "@/lib/mysql";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PUT /api/employees/password — change password
export async function PUT(req: Request) {
  try {
    const { id, currentPassword, newPassword } = await req.json();

    if (!id || !currentPassword || !newPassword) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ message: "New password must be at least 6 characters" }, { status: 400 });
    }

    // Get current password hash
    const rows: any = await query("SELECT passwordHash FROM users WHERE id = ?", [id]);
    if (!rows.length) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, rows[0].passwordHash);
    if (!valid) {
      return NextResponse.json({ message: "Current password is incorrect" }, { status: 401 });
    }

    // Hash and save new password
    const newHash = await bcrypt.hash(newPassword, 10);
    await execute("UPDATE users SET passwordHash = ? WHERE id = ?", [newHash, id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PUT /api/employees/password error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
