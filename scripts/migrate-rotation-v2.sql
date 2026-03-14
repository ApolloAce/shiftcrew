-- ShiftCrew: Rotation Enhancement Migration
-- Adds: employee_branch_history, rotation_log, branches.maxCapacity
-- Run: mysql -u root -p shiftcrew < scripts/migrate-rotation-v2.sql

USE shiftcrew;

-- ============================================================
-- EMPLOYEE BRANCH HISTORY
-- Tracks which branch each employee was assigned to each week.
-- Used by the rotation algorithm for fairness (avoid same branch).
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_branch_history (
  id          VARCHAR(64)  NOT NULL PRIMARY KEY DEFAULT (UUID()),
  employeeId  VARCHAR(64)  NOT NULL,
  branchId    VARCHAR(64)  NOT NULL,
  branchName  VARCHAR(255) NOT NULL DEFAULT '',
  weekStart   VARCHAR(10)  NOT NULL,          -- YYYY-MM-DD (Monday)
  isManual    TINYINT(1)   NOT NULL DEFAULT 0,
  rotationId  VARCHAR(64)  DEFAULT NULL,      -- FK to rotation_log.id
  createdAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_emp_week (employeeId, weekStart),
  INDEX idx_history_employee (employeeId),
  INDEX idx_history_week (weekStart),
  INDEX idx_history_rotation (rotationId)
) ENGINE=InnoDB;

-- ============================================================
-- ROTATION LOG
-- Audit trail for every rotation generation (cron, admin, force).
-- ============================================================
CREATE TABLE IF NOT EXISTS rotation_log (
  id              VARCHAR(64)  NOT NULL PRIMARY KEY DEFAULT (UUID()),
  weekStart       VARCHAR(10)  NOT NULL,
  weekEnd         VARCHAR(10)  NOT NULL,
  triggeredBy     VARCHAR(100) NOT NULL DEFAULT 'cron',
  totalEmployees  INT          NOT NULL DEFAULT 0,
  totalBranches   INT          NOT NULL DEFAULT 0,
  assignedCount   INT          NOT NULL DEFAULT 0,
  onLeaveCount    INT          NOT NULL DEFAULT 0,
  manualCount     INT          NOT NULL DEFAULT 0,
  skippedDays     INT          NOT NULL DEFAULT 0,
  status          VARCHAR(50)  NOT NULL DEFAULT 'success',
  details         JSON         DEFAULT NULL,
  elapsed         VARCHAR(20)  DEFAULT NULL,
  createdAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rotlog_week (weekStart),
  INDEX idx_rotlog_status (status)
) ENGINE=InnoDB;

-- ============================================================
-- ADD maxCapacity TO BRANCHES (nullable = unlimited)
-- ============================================================
ALTER TABLE branches ADD COLUMN IF NOT EXISTS maxCapacity INT DEFAULT NULL;

-- ============================================================
-- BACKFILL: Seed employee_branch_history from existing schedules
-- This reads the JSON `assignments` column and inserts one row
-- per employee per week. Run once after migration.
-- ============================================================
-- NOTE: MySQL 8 can parse JSON, but the assignments column format
-- varies. The backfill is better done via the app. See:
--   node scripts/backfill-rotation-history.mjs
-- ============================================================

SELECT 'Migration complete!' AS result;
