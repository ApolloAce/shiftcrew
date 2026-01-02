-- Enhanced attendance table with photo-linked GPS coordinates
CREATE TABLE IF NOT EXISTS enhanced_attendance (
    id SERIAL PRIMARY KEY,
    crew_id INTEGER NOT NULL,
    date DATE NOT NULL,
    time_in TIME,
    time_out TIME,
    
    -- GPS coordinates captured at the exact moment photo was taken
    photo_latitude DECIMAL(10, 8),
    photo_longitude DECIMAL(11, 8),
    photo_accuracy DECIMAL(8, 2),
    photo_timestamp BIGINT, -- Unix timestamp when photo and GPS were captured
    
    -- Photo verification data
    photo_url TEXT NOT NULL,
    photo_file_size INTEGER,
    photo_mime_type VARCHAR(50) DEFAULT 'image/jpeg',
    
    -- Branch and verification info
    branch_id INTEGER NOT NULL,
    verification_method VARCHAR(20) DEFAULT 'gps_photo',
    status VARCHAR(20) DEFAULT 'present',
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for efficient querying
    INDEX idx_crew_date (crew_id, date),
    INDEX idx_branch_date (branch_id, date),
    INDEX idx_photo_timestamp (photo_timestamp),
    
    -- Constraints
    CONSTRAINT chk_coordinates CHECK (
        photo_latitude BETWEEN -90 AND 90 AND 
        photo_longitude BETWEEN -180 AND 180
    ),
    CONSTRAINT chk_status CHECK (status IN ('present', 'absent', 'late'))
);

-- Sample data showing GPS coordinates captured with photos
INSERT INTO enhanced_attendance (
    crew_id, date, time_in, photo_latitude, photo_longitude, 
    photo_accuracy, photo_timestamp, photo_url, branch_id
) VALUES 
(1, '2024-12-16', '08:00:00', 14.4791, 120.9899, 5.2, 1734336000000, 'photos/crew1_20241216_080000.jpg', 1),
(2, '2024-12-16', '08:15:00', 14.4801, 120.9909, 3.8, 1734336900000, 'photos/crew2_20241216_081500.jpg', 2),
(3, '2024-12-16', '07:45:00', 14.4811, 120.9919, 4.1, 1734335100000, 'photos/crew3_20241216_074500.jpg', 3);
