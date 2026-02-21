-- Migration: Add timeIn, timeOut, photoUrl, latitude, longitude to daily_attendance
-- Run this if your daily_attendance table already exists without these columns.

ALTER TABLE daily_attendance
  ADD COLUMN timeIn       VARCHAR(8)    DEFAULT NULL AFTER status,
  ADD COLUMN timeOut      VARCHAR(8)    DEFAULT NULL AFTER timeIn,
  ADD COLUMN photoUrl     LONGTEXT      DEFAULT NULL AFTER timeOut,
  ADD COLUMN latitude     DECIMAL(10,7) DEFAULT NULL AFTER photoUrl,
  ADD COLUMN longitude    DECIMAL(10,7) DEFAULT NULL AFTER latitude;
