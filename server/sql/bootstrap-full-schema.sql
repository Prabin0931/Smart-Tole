/*
 * Project note: Bootstrap Full Schema is a database setup or migration script for Smart Tole.
 * Run SQL files deliberately and keep them aligned with the current Express API expectations.
 */
CREATE DATABASE IF NOT EXISTS tole_management;
USE tole_management;

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  address VARCHAR(255) NOT NULL,
  house_no VARCHAR(50) NOT NULL,
  zone VARCHAR(100) DEFAULT 'General',
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin (
  admin_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NULL,
  role_type VARCHAR(100) DEFAULT 'Super Admin'
);

CREATE TABLE IF NOT EXISTS complaints (
  complaint_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  category ENUM(
    'Streetlight','Water Supply','Sanitation','Road Damage','Drainage','Garbage Collection',
    'Electricity','Security','Noise Disturbance','Public Property Damage','Public Safety Alert','Other'
  ) NOT NULL,
  message TEXT NOT NULL,
  photo_data LONGTEXT NULL,
  status ENUM('Pending','In Progress','Resolved') DEFAULT 'Pending',
  admin_remark TEXT NULL,
  priority VARCHAR(30) DEFAULT 'Medium',
  escalated TINYINT(1) DEFAULT 0,
  due_date DATE NULL,
  assigned_admin_id INT NULL,
  assigned_committee VARCHAR(100) DEFAULT 'General Committee',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_complaints_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS complaint_updates (
  update_id INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id INT NOT NULL,
  admin_id INT NULL,
  admin_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_updates_complaint FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notices (
  notice_id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  date DATE NOT NULL,
  photo_data LONGTEXT NULL,
  target_zone VARCHAR(120) DEFAULT 'All Zones',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notices_admin FOREIGN KEY (admin_id) REFERENCES admin(admin_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS garbage_status (
  status_id INT AUTO_INCREMENT PRIMARY KEY,
  sensor_id VARCHAR(255) NOT NULL,
  level INT NOT NULL,
  assigned_user_id INT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_sensor UNIQUE (sensor_id),
  CONSTRAINT fk_garbage_user FOREIGN KEY (assigned_user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dustbin_devices (
  sensor_id VARCHAR(255) PRIMARY KEY,
  zone VARCHAR(100) DEFAULT 'General',
  location_label VARCHAR(255) DEFAULT NULL,
  device_status VARCHAR(50) DEFAULT 'Active',
  installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resident_update_history (
  history_id INT AUTO_INCREMENT PRIMARY KEY,
  resident_id INT NOT NULL,
  admin_name VARCHAR(255) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_notification_log (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  event_key VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notification_event (event_key, recipient_email)
);
