-- Create enhanced attendance table with GPS and photo data
CREATE TABLE IF NOT EXISTS enhanced_attendance (
    id SERIAL PRIMARY KEY,
    crew_id INTEGER NOT NULL,
    date DATE NOT NULL,
    time_in TIME,
    time_out TIME,
    
    -- GPS Location Data
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    location_accuracy DECIMAL(8, 2),
    location_timestamp BIGINT,
    
    -- Photo Data
    photo_url TEXT,
    photo_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Branch and Status
    branch_id INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'present',
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    INDEX idx_crew_date (crew_id, date),
    INDEX idx_branch_date (branch_id, date),
    INDEX idx_location (location_lat, location_lng)
);

-- Create branch locations table for GPS validation
CREATE TABLE IF NOT EXISTS branch_locations (
    id SERIAL PRIMARY KEY,
    branch_id INTEGER NOT NULL UNIQUE,
    branch_name VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    radius_meters INTEGER DEFAULT 100,
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample branch locations
INSERT INTO branch_locations (branch_id, branch_name, latitude, longitude, radius_meters, address) VALUES
(1, 'Branch 1', 14.4791, 120.9899, 100, '123 Main Street, City'),
(2, 'Branch 2', 14.4801, 120.9909, 100, '456 Second Avenue, City'),
(3, 'Branch 3', 14.4811, 120.9919, 100, '789 Third Boulevard, City'),
(4, 'Branch 4', 14.4821, 120.9929, 100, '101 Fourth Street, City'),
(5, 'Branch 5', 14.4831, 120.9939, 100, '202 Fifth Avenue, City'),
(6, 'Branch 6', 14.4841, 120.9949, 100, '303 Sixth Street, City');

-- Create photo storage table for organizing captured photos
CREATE TABLE IF NOT EXISTS attendance_photos (
    id SERIAL PRIMARY KEY,
    attendance_id INTEGER NOT NULL,
    crew_id INTEGER NOT NULL,
    photo_type VARCHAR(20) NOT NULL, -- 'clock_in' or 'clock_out'
    photo_url TEXT NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (attendance_id) REFERENCES enhanced_attendance(id) ON DELETE CASCADE,
    INDEX idx_crew_photos (crew_id, created_at),
    INDEX idx_attendance_photos (attendance_id)
);
