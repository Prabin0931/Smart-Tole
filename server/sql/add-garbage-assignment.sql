/*
 * Project note: Add Garbage Assignment is a database setup or migration script for Smart Tole.
 * Run SQL files deliberately and keep them aligned with the current Express API expectations.
 */
USE tole_management;

ALTER TABLE garbage_status
ADD COLUMN IF NOT EXISTS assigned_user_id INT NULL AFTER level;
