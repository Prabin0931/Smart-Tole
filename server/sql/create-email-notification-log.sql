/*
 * Project note: Create Email Notification Log is a database setup or migration script for Smart Tole.
 * Run SQL files deliberately and keep them aligned with the current Express API expectations.
 */
USE tole_management;

CREATE TABLE IF NOT EXISTS email_notification_log (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  event_key VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
