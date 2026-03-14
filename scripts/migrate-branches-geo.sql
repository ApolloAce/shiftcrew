-- Migration: Add geolocation fields to branches table
-- Run: mysql -u root -p shiftcrew < scripts/migrate-branches-geo.sql

USE shiftcrew;

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS latitude    DECIMAL(10,7) DEFAULT NULL AFTER address,
  ADD COLUMN IF NOT EXISTS longitude   DECIMAL(10,7) DEFAULT NULL AFTER latitude,
  ADD COLUMN IF NOT EXISTS city        VARCHAR(255)  DEFAULT NULL AFTER longitude,
  ADD COLUMN IF NOT EXISTS province    VARCHAR(255)  DEFAULT NULL AFTER city,
  ADD COLUMN IF NOT EXISTS radius      INT           NOT NULL DEFAULT 100 AFTER province;

-- radius is in meters (default 100m)
-- latitude/longitude store the branch pin location
-- city/province store the resolved location name
