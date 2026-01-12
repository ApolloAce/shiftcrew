import { NextResponse } from "next/server";
import { db } from "../../../lib/firebaseAdmin";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const formData = await req.json();

  try {
    // Check if email already exists
    const snapshot = await db.collection("users")
      .where("email", "==", formData.email.toLowerCase())
      .limit(1)
      .get();

    if (!snapshot.empty) {
      return NextResponse.json({ message: "Email is already in use" }, { status: 400 });
    }

    // Hash password before saving
    const passwordHash = await bcrypt.hash(formData.password, 10);

    const newEmployee = {
      firstName: formData.firstName,
      surname: formData.surname,
      nickname: formData.nickname,
      email: formData.email.toLowerCase(),
      passwordHash,
      phone: formData.phone,
      address: formData.address,
      type: formData.type,
      availability: formData.availability || [],
      isPresent: false,
      isEmployee: true,
      status: "approved",
      role: "employee",
      hireDate: new Date().toISOString().split("T")[0],
      createdAt: new Date().toISOString(),
    };

    const docRef = await db.collection("users").add(newEmployee);

    return NextResponse.json({ id: docRef.id, ...newEmployee }, { status: 201 });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
