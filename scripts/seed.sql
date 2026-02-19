-- ShiftCrew seed data — test users, branches, sample records
-- Run AFTER schema.sql:  mysql -u root -p shiftcrew < scripts/seed.sql

USE shiftcrew;

-- ============================================================
-- Admin user  (username: admin, password: admin123)
-- ============================================================
INSERT IGNORE INTO users (id, firstName, surname, email, passwordHash, role, isEmployee, status)
VALUES (
  'admin-001',
  'Admin',
  'User',
  'admin@shiftmate.com',
  '$2b$10$GJMqpY0T74wr1FJWDGyE1ukHdSUYhTkwH1nj8jEem02zrE7ypbh3K',
  'admin',
  0,
  'approved'
);

-- ============================================================
-- Employee: Luis  (username: luis, password: luis123)
-- ============================================================
INSERT IGNORE INTO users (id, firstName, surname, email, passwordHash, role, isEmployee, type, status, hireDate, branchId)
VALUES (
  'emp-luis',
  'Luis',
  'Garcia',
  'luis@shiftmate.com',
  '$2b$10$BgS2bGhIVHTZy27IXcYeb.o5ZU4WTKFDtOyQzVNzK2KMr4CsyzJb6',
  'employee',
  1,
  'full-time',
  'approved',
  '2024-03-01',
  'branch-001'
);

-- ============================================================
-- Additional test employees (password: password123)
-- ============================================================
INSERT IGNORE INTO users (id, firstName, surname, email, passwordHash, role, isEmployee, type, status, hireDate, branchId)
VALUES
  ('emp-001', 'Jane', 'Doe', 'jane@shiftmate.com',
   '$2b$10$.aloJH4wE6MIUBGvOoE96..bgy3/g.N.q8Bpe8PiI.wSp1/VZPtLm',
   'employee', 1, 'full-time', 'approved', '2024-01-15', 'branch-001'),

  ('emp-002', 'John', 'Smith', 'john@shiftmate.com',
   '$2b$10$.aloJH4wE6MIUBGvOoE96..bgy3/g.N.q8Bpe8PiI.wSp1/VZPtLm',
   'employee', 1, 'part-time', 'approved', '2024-06-01', 'branch-002'),

  ('emp-003', 'Maria', 'Santos', 'maria@shiftmate.com',
   '$2b$10$.aloJH4wE6MIUBGvOoE96..bgy3/g.N.q8Bpe8PiI.wSp1/VZPtLm',
   'employee', 1, 'full-time', 'approved', '2024-04-10', 'branch-001'),

  ('emp-004', 'Carlos', 'Reyes', 'carlos@shiftmate.com',
   '$2b$10$.aloJH4wE6MIUBGvOoE96..bgy3/g.N.q8Bpe8PiI.wSp1/VZPtLm',
   'employee', 1, 'full-time', 'approved', '2024-07-20', 'branch-002'),

  ('emp-005', 'Ana', 'Cruz', 'ana@shiftmate.com',
   '$2b$10$.aloJH4wE6MIUBGvOoE96..bgy3/g.N.q8Bpe8PiI.wSp1/VZPtLm',
   'employee', 1, 'part-time', 'approved', '2025-01-05', NULL);

-- ============================================================
-- Branches
-- ============================================================
INSERT IGNORE INTO branches (id, branchName, address)
VALUES
  ('branch-001', 'Main Office', '123 Main St, Metro City'),
  ('branch-002', 'North Branch', '456 North Ave, Metro City');

-- ============================================================
-- Sample schedule (current week)
-- ============================================================
INSERT IGNORE INTO schedules (id, date, time, scheduleFor, branchAssignments, weekStart, weekEnd)
VALUES (
  'sched-001',
  '2026-02-16',
  '08:00',
  '2026-02-16',
  '[{"branchId":"branch-001","branchName":"Main Office","employees":[{"employeeId":"emp-luis","employeeName":"Luis Garcia","isPresent":true,"shift":{"start":"08:00","end":"17:00"}},{"employeeId":"emp-001","employeeName":"Jane Doe","isPresent":true,"shift":{"start":"08:00","end":"17:00"}},{"employeeId":"emp-003","employeeName":"Maria Santos","isPresent":true,"shift":{"start":"08:00","end":"17:00"}}]},{"branchId":"branch-002","branchName":"North Branch","employees":[{"employeeId":"emp-002","employeeName":"John Smith","isPresent":true,"shift":{"start":"09:00","end":"18:00"}},{"employeeId":"emp-004","employeeName":"Carlos Reyes","isPresent":true,"shift":{"start":"09:00","end":"18:00"}}]}]',
  '2026-02-16',
  '2026-02-22'
);

-- ============================================================
-- Sample attendance
-- ============================================================
INSERT IGNORE INTO daily_attendance (id, employeeId, employeeName, date, status, branchId, branchName)
VALUES
  ('emp-luis_2026-02-19', 'emp-luis', 'Luis Garcia', '2026-02-19', 'present', 'branch-001', 'Main Office'),
  ('emp-001_2026-02-19', 'emp-001', 'Jane Doe', '2026-02-19', 'present', 'branch-001', 'Main Office'),
  ('emp-002_2026-02-19', 'emp-002', 'John Smith', '2026-02-19', 'present', 'branch-002', 'North Branch');

-- ============================================================
-- Sample leave request
-- ============================================================
INSERT IGNORE INTO leave_requests (id, employeeId, employeeName, startDate, endDate, reason, status, type)
VALUES
  ('leave-001', 'emp-luis', 'Luis Garcia', '2026-03-01', '2026-03-03', 'Family vacation', 'pending', 'vacation');
