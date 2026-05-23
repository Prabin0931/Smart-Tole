/*
 * Project note: Final Year Scope Upgrade is a database setup or migration script for Smart Tole.
 * Run SQL files deliberately and keep them aligned with the current Express API expectations.
 */
ALTER TABLE users
ADD COLUMN IF NOT EXISTS zone VARCHAR(100) DEFAULT 'General';

ALTER TABLE admin
ADD COLUMN IF NOT EXISTS role_type VARCHAR(100) DEFAULT 'Super Admin';

ALTER TABLE admin
ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL;

ALTER TABLE complaints
ADD COLUMN IF NOT EXISTS priority VARCHAR(30) DEFAULT 'Medium',
ADD COLUMN IF NOT EXISTS escalated TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS due_date DATE NULL,
ADD COLUMN IF NOT EXISTS assigned_admin_id INT NULL,
ADD COLUMN IF NOT EXISTS assigned_committee VARCHAR(100) DEFAULT 'General Committee';

ALTER TABLE notices
ADD COLUMN IF NOT EXISTS target_zone VARCHAR(120) DEFAULT 'All Zones';

CREATE TABLE IF NOT EXISTS dustbin_devices (
  sensor_id VARCHAR(255) PRIMARY KEY,
  zone VARCHAR(100) DEFAULT 'General',
  location_label VARCHAR(255) DEFAULT NULL,
  device_status VARCHAR(50) DEFAULT 'Active',
  installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
