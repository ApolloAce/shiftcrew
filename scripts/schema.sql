-- ShiftCrew MySQL Schema
-- Run: mysql -u root -p < scripts/schema.sql

CREATE DATABASE IF NOT EXISTS shiftcrew CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE shiftcrew;

-- ============================================================
-- USERS (employees + admins)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id          VARCHAR(64)  NOT NULL PRIMARY KEY DEFAULT (UUID()),
  firstName   VARCHAR(100) NOT NULL DEFAULT '',
  surname     VARCHAR(100) NOT NULL DEFAULT '',
  nickname    VARCHAR(100) DEFAULT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  passwordHash VARCHAR(255) NOT NULL,
  phone       VARCHAR(50)  DEFAULT NULL,
  address     TEXT         DEFAULT NULL,
  emergencyContact VARCHAR(255) DEFAULT NULL,
  position    VARCHAR(100) DEFAULT NULL,
  type        ENUM('full-time','part-time') DEFAULT 'full-time',
  availability JSON        DEFAULT NULL,
  isPresent   TINYINT(1)   NOT NULL DEFAULT 0,
  isEmployee  TINYINT(1)   NOT NULL DEFAULT 1,
  archived    TINYINT(1)   NOT NULL DEFAULT 0,
  role        VARCHAR(50)  NOT NULL DEFAULT 'employee',
  status      VARCHAR(50)  NOT NULL DEFAULT 'approved',
  branchId    VARCHAR(64)  DEFAULT NULL,
  hireDate    DATE         DEFAULT NULL,
  createdAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- BRANCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  id          VARCHAR(64)  NOT NULL PRIMARY KEY DEFAULT (UUID()),
  branchName  VARCHAR(255) NOT NULL,
  address     TEXT         DEFAULT NULL,
  createdAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- SCHEDULES
-- ============================================================
CREATE TABLE IF NOT EXISTS schedules (
  id               VARCHAR(64) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  date             VARCHAR(10) NOT NULL,          -- ISO YYYY-MM-DD
  time             VARCHAR(20) DEFAULT NULL,
  scheduleFor      VARCHAR(10) DEFAULT NULL,
  branchAssignments JSON       DEFAULT NULL,       -- [{branchId, branchName, employees:[...]}]
  assignments      JSON        DEFAULT NULL,       -- legacy flat array
  weekStart        VARCHAR(10) DEFAULT NULL,
  weekEnd          VARCHAR(10) DEFAULT NULL,
  manuallyScheduled TINYINT(1) DEFAULT 0,
  createdAt        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_schedules_date (date),
  INDEX idx_schedules_scheduleFor (scheduleFor),
  INDEX idx_schedules_weekStart (weekStart)
) ENGINE=InnoDB;

-- ============================================================
-- DAILY ATTENDANCE
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_attendance (
  id           VARCHAR(128) NOT NULL PRIMARY KEY,  -- employeeId_date
  employeeId   VARCHAR(64)  NOT NULL,
  employeeName VARCHAR(200) DEFAULT NULL,
  date         VARCHAR(10)  NOT NULL,
  status       ENUM('present','absent') NOT NULL DEFAULT 'present',
  timeIn       VARCHAR(8)   DEFAULT NULL,          -- HH:MM:SS
  timeOut      VARCHAR(8)   DEFAULT NULL,          -- HH:MM:SS
  photoUrl     LONGTEXT     DEFAULT NULL,          -- base64 selfie data URL
  latitude     DECIMAL(10,7) DEFAULT NULL,
  longitude    DECIMAL(10,7) DEFAULT NULL,
  branchId     VARCHAR(64)  DEFAULT NULL,
  branchName   VARCHAR(255) DEFAULT NULL,
  createdAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_attendance_date (date),
  INDEX idx_attendance_employee (employeeId)
) ENGINE=InnoDB;

-- ============================================================
-- LEAVE REQUESTS
-- ============================================================
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
) ENGINE=InnoDB;

-- ============================================================
-- ABSENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS absences (
  id           VARCHAR(64)  NOT NULL PRIMARY KEY DEFAULT (UUID()),
  employeeId   VARCHAR(64)  NOT NULL,
  employeeName VARCHAR(200) DEFAULT NULL,
  date         VARCHAR(10)  NOT NULL,
  reason       TEXT         DEFAULT NULL,
  status       ENUM('excused','unexcused') NOT NULL DEFAULT 'unexcused',
  notes        TEXT         DEFAULT NULL,
  createdAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_absences_employee (employeeId),
  INDEX idx_absences_date (date)
) ENGINE=InnoDB;

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id           VARCHAR(64)  NOT NULL PRIMARY KEY DEFAULT (UUID()),
  recipientId  VARCHAR(64)  DEFAULT NULL,
  title        VARCHAR(255) NOT NULL,
  message      TEXT         NOT NULL,
  type         VARCHAR(50)  DEFAULT 'info',
  isRead       TINYINT(1)   NOT NULL DEFAULT 0,
  createdAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_recipient (recipientId),
  INDEX idx_notifications_read (isRead)
) ENGINE=InnoDB;

-- ============================================================
-- MANUAL OVERRIDES
-- ============================================================
CREATE TABLE IF NOT EXISTS manual_overrides (
  id                 VARCHAR(64)  NOT NULL PRIMARY KEY DEFAULT (UUID()),
  employeeId         VARCHAR(64)  NOT NULL,
  employeeName       VARCHAR(200) NOT NULL DEFAULT '',
  date               VARCHAR(10)  NOT NULL,
  dayOfWeek          VARCHAR(15)  DEFAULT NULL,
  overrideBranchId   VARCHAR(64)  NOT NULL,
  overrideBranchName VARCHAR(255) NOT NULL DEFAULT '',
  originalBranchId   VARCHAR(64)  DEFAULT NULL,
  originalBranchName VARCHAR(255) DEFAULT NULL,
  shift              VARCHAR(10)  DEFAULT NULL,
  reason             TEXT         DEFAULT NULL,
  createdBy          VARCHAR(100) DEFAULT NULL,
  createdAt          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_overrides_employee_date (employeeId, date),
  INDEX idx_overrides_date (date)
) ENGINE=InnoDB;
