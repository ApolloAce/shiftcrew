import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "shiftcrew",
  port: 3306,
});

async function main() {
  const [rows] = await pool.query("SELECT id, email FROM users WHERE email LIKE '%@shiftmate.com'");
  console.log("Found emails to fix:", rows.length);
  for (const row of rows) {
    console.log(`  ${row.id}: ${row.email}`);
  }
  
  if (rows.length > 0) {
    const [result] = await pool.query(
      "UPDATE users SET email = REPLACE(email, '@shiftmate.com', '@shiftcrew.com') WHERE email LIKE '%@shiftmate.com'"
    );
    console.log("Updated rows:", result.affectedRows);
  }
  
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
