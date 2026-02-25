-- ShiftCrew seed data — test users, branches, sample records
-- Run AFTER schema.sql:  mysql -u root -p shiftcrew < scripts/seed.sql

USE shiftcrew;

-- ============================================================
-- Admin user  (password: admin123)
-- Hash generated with bcryptjs, 10 rounds
-- ============================================================
INSERT IGNORE INTO users (id, firstName, surname, email, passwordHash, role, isEmployee, status)
VALUES (
  'admin-001',
  'Admin',
  'User',
  'admin@example.com',
  '$2b$10$0A65giRY8s/eyujH8jWFouBXO9qgZLT2OPCShjDqqqy5uzBG4KmxO',
  'admin',
  0,
  'approved'
);

-- ============================================================
-- Test employee  (password: password123)
-- ============================================================
INSERT IGNORE INTO users (id, firstName, surname, email, passwordHash, role, isEmployee, type, status, hireDate)
VALUES (
  'emp-001',
  'Jane',
  'Doe',
  'jane@example.com',
  '$2b$10$URSGYhVlsdIQPDwoYUO7RODUdpyld9sAw/VSV5I6QWqjHioeFXzs.',
  'employee',
  1,
  'full-time',
  'approved',
  '2024-01-15'
);

INSERT IGNORE INTO users (id, firstName, surname, email, passwordHash, role, isEmployee, type, status, hireDate)
VALUES (
  'emp-002',
  'John',
  'Smith',
  'john@example.com',
  '$2b$10$URSGYhVlsdIQPDwoYUO7RODUdpyld9sAw/VSV5I6QWqjHioeFXzs.',
  'employee',
  1,
  'part-time',
  'approved',
  '2024-06-01'
);

-- ============================================================
-- Branches
-- ============================================================
INSERT IGNORE INTO branches (id, branchName, address)
VALUES
  ('branch-001', 'Main Office', '123 Main St, Metro City'),
  ('branch-002', 'North Branch', '456 North Ave, Metro City');

-- ============================================================
-- Sample schedule
-- ============================================================
INSERT IGNORE INTO schedules (id, date, time, scheduleFor, branchAssignments, weekStart)
VALUES (
  'sched-001',
  '2026-02-16',
  '08:00',
  '2026-02-16',
  '[{"branchId":"branch-001","branchName":"Main Office","employees":[{"employeeId":"emp-001","employeeName":"Jane Doe","isPresent":true,"shift":"AM"}]}]',
  '2026-02-16'
);

-- ============================================================
-- Sample attendance
-- ============================================================
INSERT IGNORE INTO daily_attendance (id, employeeId, employeeName, date, status, branchId, branchName)
VALUES
  ('emp-001_2026-02-16', 'emp-001', 'Jane Doe', '2026-02-16', 'present', 'branch-001', 'Main Office');
