/*
 * Project note: Xampp Auth Setup is a database setup or migration script for Smart Tole.
 * Run SQL files deliberately and keep them aligned with the current Express API expectations.
 */
CREATE DATABASE IF NOT EXISTS tole_management;
USE tole_management;

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  address VARCHAR(255) NOT NULL,
  house_no VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin (
  admin_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL
);

INSERT INTO admin (username, password, name)
SELECT 'reactadmin', 'admin123', 'React Admin'
WHERE NOT EXISTS (
  SELECT 1 FROM admin WHERE username = 'reactadmin'
);
