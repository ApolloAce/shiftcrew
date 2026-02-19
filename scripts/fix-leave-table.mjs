import mysql from "mysql2/promise";

const c = await mysql.createConnection({
  host: "127.0.0.1",
  port: 3306,
  user: "root",
  password: "",
  database: "shiftcrew",
});

await c.execute("DROP TABLE IF EXISTS leave_requests");
await c.execute(`
  CREATE TABLE IF NOT EXISTS leave_requests (
    id           VARCHAR(64)  NOT NULL PRIMARY KEY DEFAULT (UUID()),
    employeeId   VARCHAR(64)  NOT NULL,
    employeeName VARCHAR(200) DEFAULT NULL,
    startDate    VARCHAR(10)  NOT NULL,
    endDate      VARCHAR(10)  NOT NULL,
    reason       TEXT         DEFAULT NULL,
    status       VARCHAR(50)  NOT NULL DEFAULT 'pending',
    type         VARCHAR(50)  DEFAULT NULL,
    notes        TEXT         DEFAULT NULL,
    reviewedAt   DATETIME     DEFAULT NULL,
    reviewedBy   VARCHAR(64)  DEFAULT NULL,
    createdAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_leave_employeeId (employeeId)
  ) ENGINE=InnoDB
`);

console.log("leave_requests table recreated with employeeId");
await c.end();
