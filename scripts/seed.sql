-- ShiftCrew seed data — demo accounts only
-- Run AFTER schema.sql:  mysql -u root shiftcrew < scripts/seed.sql

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
-- Demo Employee: Luis  (username: luis, password: luis123)
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
-- Demo Branches
-- ============================================================
INSERT IGNORE INTO branches (id, branchName, address)
VALUES
  ('branch-001', 'Main Office', '123 Main St, Metro City'),
  ('branch-002', 'North Branch', '456 North Ave, Metro City');
