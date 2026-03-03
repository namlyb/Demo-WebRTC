Create database DemoRTC;
use DemoRTC;
CREATE TABLE rooms (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    room_code VARCHAR(12) NOT NULL,
    password_hash VARCHAR(255) NULL,

    status ENUM('ACTIVE', 'ENDED', 'EXPIRED') 
        NOT NULL DEFAULT 'ACTIVE',

    max_participants INT NOT NULL DEFAULT 10,
    current_participants INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME NULL,
    expired_at DATETIME NULL,

    INDEX idx_room_code (room_code),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);