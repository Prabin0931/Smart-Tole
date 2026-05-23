/*
 * Project note: Add User Address Fields is a database setup or migration script for Smart Tole.
 * Run SQL files deliberately and keep them aligned with the current Express API expectations.
 */
USE tole_management;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS address VARCHAR(255) NOT NULL DEFAULT '' AFTER email,
ADD COLUMN IF NOT EXISTS house_no VARCHAR(50) NOT NULL DEFAULT '' AFTER address;
