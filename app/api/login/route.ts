import { NextResponse } from "next/server";
import { db } from "../../../lib/firebaseAdmin";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const { username, email, password } = await req.json();

  // Use whichever field is provided
  const identifier = (email || username || "").toLowerCase();

  if (!identifier || !password) {
    return NextResponse.json({ message: "Missing credentials" }, { status: 400 });
  }

  try {
    const snapshot = await db.collection("users")
      .where("email", "==", identifier)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ message: "Invalid username or password" }, { status: 401 });
    }

    const userDoc = snapshot.docs[0].data();

    const isMatch = await bcrypt.compare(password, userDoc.passwordHash);
    if (!isMatch) {
      return NextResponse.json({ message: "Invalid username or password" }, { status: 401 });
    }

    const userData = {
      id: snapshot.docs[0].id,
      email: userDoc.email,
      role: userDoc.role,
      name: `${userDoc.firstName} ${userDoc.surname}`,
      isAdmin: userDoc.role === "admin",
      isEmployee: userDoc.isEmployee === true,
    };

    return NextResponse.json({ user: userData }, { status: 200 });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
