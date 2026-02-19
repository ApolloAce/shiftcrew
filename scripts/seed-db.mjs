// Seed script — run with: node scripts/seed-db.mjs
// Populates the shiftcrew database with test data

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
    const defaultHash = await bcrypt.hash("password123", 10);

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

    // ---- Luis (employee) ----
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

    // ---- Additional employees ----
    const employees = [
        { id: "emp-001", firstName: "Jane", surname: "Doe", email: "jane@shiftmate.com", type: "full-time", branchId: "branch-001", hireDate: "2024-01-15" },
        { id: "emp-002", firstName: "John", surname: "Smith", email: "john@shiftmate.com", type: "part-time", branchId: "branch-002", hireDate: "2024-06-01" },
        { id: "emp-003", firstName: "Maria", surname: "Santos", email: "maria@shiftmate.com", type: "full-time", branchId: "branch-001", hireDate: "2024-04-10" },
        { id: "emp-004", firstName: "Carlos", surname: "Reyes", email: "carlos@shiftmate.com", type: "full-time", branchId: "branch-002", hireDate: "2024-07-20" },
        { id: "emp-005", firstName: "Ana", surname: "Cruz", email: "ana@shiftmate.com", type: "part-time", branchId: null, hireDate: "2025-01-05" },
    ];

    for (const emp of employees) {
        await upsertUser({
            ...emp,
            passwordHash: defaultHash,
            role: "employee",
            isEmployee: 1,
            status: "approved",
        });
        console.log(`  ✅ ${emp.firstName} ${emp.surname} (${emp.email} / password123)`);
    }

    // ---- Branches ----
    await upsertBranch("branch-001", "Main Office", "123 Main St, Metro City");
    await upsertBranch("branch-002", "North Branch", "456 North Ave, Metro City");
    console.log("  ✅ 2 branches");

    // ---- Sample schedule for this week ----
    const today = new Date();
    const day = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - day + (day === 0 ? -6 : 1));
    const mondayISO = formatDate(monday);
    const sundayISO = formatDate(new Date(monday.getTime() + 6 * 86400000));

    // Create schedules for each day of this week
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateISO = formatDate(d);

        const branchAssignments = JSON.stringify([
            {
                branchId: "branch-001",
                branchName: "Main Office",
                employees: [
                    { employeeId: "emp-luis", employeeName: "Luis Garcia", isPresent: true, shift: { start: "08:00", end: "17:00" } },
                    { employeeId: "emp-001", employeeName: "Jane Doe", isPresent: true, shift: { start: "08:00", end: "17:00" } },
                    { employeeId: "emp-003", employeeName: "Maria Santos", isPresent: true, shift: { start: "09:00", end: "18:00" } },
                ],
            },
            {
                branchId: "branch-002",
                branchName: "North Branch",
                employees: [
                    { employeeId: "emp-002", employeeName: "John Smith", isPresent: true, shift: { start: "09:00", end: "18:00" } },
                    { employeeId: "emp-004", employeeName: "Carlos Reyes", isPresent: true, shift: { start: "08:00", end: "17:00" } },
                ],
            },
        ]);

        await pool.execute(
            `INSERT INTO schedules (id, date, time, scheduleFor, branchAssignments, weekStart, weekEnd) 
       VALUES (?, ?, '08:00', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE branchAssignments = VALUES(branchAssignments), weekStart = VALUES(weekStart), weekEnd = VALUES(weekEnd)`,
            [`sched-${dateISO}`, dateISO, dateISO, branchAssignments, mondayISO, sundayISO]
        );
    }
    console.log(`  ✅ 7 daily schedules (${mondayISO} → ${sundayISO})`);

    // ---- Sample attendance for today ----
    const todayISO = formatDate(today);
    const attendanceRecords = [
        { id: `emp-luis_${todayISO}`, employeeId: "emp-luis", employeeName: "Luis Garcia", branchId: "branch-001", branchName: "Main Office" },
        { id: `emp-001_${todayISO}`, employeeId: "emp-001", employeeName: "Jane Doe", branchId: "branch-001", branchName: "Main Office" },
        { id: `emp-002_${todayISO}`, employeeId: "emp-002", employeeName: "John Smith", branchId: "branch-002", branchName: "North Branch" },
    ];

    for (const rec of attendanceRecords) {
        await pool.execute(
            `INSERT INTO daily_attendance (id, employeeId, employeeName, date, status, branchId, branchName)
       VALUES (?, ?, ?, ?, 'present', ?, ?)
       ON DUPLICATE KEY UPDATE status = 'present'`,
            [rec.id, rec.employeeId, rec.employeeName, todayISO, rec.branchId, rec.branchName]
        );
    }
    console.log(`  ✅ 3 attendance records for today (${todayISO})`);

    // ---- Sample leave request ----
    await pool.execute(
        `INSERT INTO leave_requests (id, employeeId, employeeName, startDate, endDate, reason, status, type)
     VALUES ('leave-001', 'emp-luis', 'Luis Garcia', '2026-03-01', '2026-03-03', 'Family vacation', 'pending', 'vacation')
     ON DUPLICATE KEY UPDATE status = 'pending'`
    );
    console.log("  ✅ 1 leave request for Luis");

    console.log("\n🎉 Seed complete! You can now test with:");
    console.log("   Admin:    admin / admin123");
    console.log("   Employee: luis / luis123");
    console.log("   Employee: jane@shiftmate.com / password123");

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

function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
