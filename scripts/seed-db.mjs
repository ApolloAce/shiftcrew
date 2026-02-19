// Seed script — run with: node scripts/seed-db.mjs
// Populates the shiftcrew database with demo accounts only

import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "shiftcrew",
    waitForConnections: true,
    connectionLimit: 5,
});

async function seed() {
    console.log("🌱 Seeding ShiftCrew database...\n");

    // Hash passwords
    const adminHash = await bcrypt.hash("admin123", 10);
    const luisHash = await bcrypt.hash("luis123", 10);

    // ---- Admin user ----
    await upsertUser({
        id: "admin-001",
        firstName: "Admin",
        surname: "User",
        email: "admin@shiftmate.com",
        passwordHash: adminHash,
        role: "admin",
        isEmployee: 0,
        type: "full-time",
        status: "approved",
        branchId: null,
        hireDate: null,
    });
    console.log("  ✅ Admin user (admin / admin123)");

    // ---- Luis (demo employee) ----
    await upsertUser({
        id: "emp-luis",
        firstName: "Luis",
        surname: "Garcia",
        email: "luis@shiftmate.com",
        passwordHash: luisHash,
        role: "employee",
        isEmployee: 1,
        type: "full-time",
        status: "approved",
        branchId: "branch-001",
        hireDate: "2024-03-01",
    });
    console.log("  ✅ Luis Garcia (luis / luis123)");

    // ---- Demo branches ----
    await upsertBranch("branch-001", "Main Office", "123 Main St, Metro City");
    await upsertBranch("branch-002", "North Branch", "456 North Ave, Metro City");
    console.log("  ✅ 2 demo branches");

    console.log("\n🎉 Seed complete! You can now log in with:");
    console.log("   Admin:    admin / admin123");
    console.log("   Employee: luis / luis123");
    console.log("\n   Add more employees and branches via the admin dashboard.");

    await pool.end();
}

// ---- Helpers ----

async function upsertUser(user) {
    await pool.execute(
        `INSERT INTO users (id, firstName, surname, email, passwordHash, role, isEmployee, type, status, branchId, hireDate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE firstName = VALUES(firstName), surname = VALUES(surname), email = VALUES(email),
       passwordHash = VALUES(passwordHash), role = VALUES(role), isEmployee = VALUES(isEmployee),
       type = VALUES(type), status = VALUES(status), branchId = VALUES(branchId), hireDate = VALUES(hireDate)`,
        [user.id, user.firstName, user.surname, user.email, user.passwordHash, user.role, user.isEmployee, user.type, user.status, user.branchId, user.hireDate]
    );
}

async function upsertBranch(id, branchName, address) {
    await pool.execute(
        `INSERT INTO branches (id, branchName, address) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE branchName = VALUES(branchName), address = VALUES(address)`,
        [id, branchName, address]
    );
}

seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
