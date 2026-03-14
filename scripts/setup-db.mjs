/**
 * Setup script — creates the shiftcrew database, tables, and seed data.
 *
 * Usage:
 *   node scripts/setup-db.mjs            (uses defaults: root@127.0.0.1:3306)
 *   MYSQL_USER=myuser MYSQL_PASSWORD=secret node scripts/setup-db.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const host = process.env.MYSQL_HOST || "127.0.0.1";
  const port = Number(process.env.MYSQL_PORT || 3306);
  const user = process.env.MYSQL_USER || "root";
  const password = process.env.MYSQL_PASSWORD || "";

  console.log(`Connecting to MySQL at ${user}@${host}:${port} ...`);

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: true,
  });

  // Schema
  const schemaSql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  console.log("Running schema.sql ...");
  await conn.query(schemaSql);

  // Seed
  const seedSql = fs.readFileSync(path.join(__dirname, "seed.sql"), "utf-8");
  console.log("Running seed.sql ...");
  await conn.query(seedSql);

  // Verify
  const [users] = await conn.query("SELECT id, email, role FROM shiftcrew.users");
  console.log("Users in DB:", users);

  const [branches] = await conn.query("SELECT id, branchName FROM shiftcrew.branches");
  console.log("Branches in DB:", branches);

  await conn.end();
  console.log("\n✓ Database setup complete!");
  console.log("You can now start the dev server: npm run dev");
}

run().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
